"use client";

import {
  CircleAlert,
  CircleCheck,
  FileText,
  LoaderCircle,
  Paperclip,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useRef, useState } from "react";

import { removeFileAction } from "@/app/(public)/request/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { compressImage, formatFileSize } from "@/lib/image-compress";
import { cn, focusRing } from "@/lib/utils";

export type UploaderRequirement = {
  id: string;
  label: string;
  details: string | null;
  isRequired: boolean;
};

type Item = {
  key: string;
  id?: string;
  name: string;
  size: number;
  requirementId: string | null;
  status: "uploading" | "done" | "failed" | "removing";
  progress: number;
  error?: string;
  file?: File;
};

type Props = {
  requestId: string;
  requirements: UploaderRequirement[];
  initialFiles: {
    id: string;
    originalName: string;
    sizeBytes: number;
    requirementId: string | null;
  }[];
  maxFiles: number;
  maxBytes: number;
  // False when the client came from the tracking page: they may add files but not remove any.
  canRemove?: boolean;
};

// Sends ONE file with progress. XMLHttpRequest is used because fetch cannot report upload progress.
function sendFile(
  requestId: string,
  requirementId: string | null,
  file: File,
  onProgress: (percent: number) => void,
): Promise<{ ok: boolean; file?: { id: string }; error?: string }> {
  return new Promise((resolve) => {
    const form = new FormData();
    form.set("requestId", requestId);
    if (requirementId) form.set("requirementId", requirementId);
    form.set("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      try {
        resolve(JSON.parse(xhr.responseText));
      } catch {
        resolve({ ok: false, error: "We could not save that file. Please try again." });
      }
    };
    xhr.onerror = () => resolve({ ok: false, error: "The connection dropped. Please try again." });
    xhr.send(form);
  });
}

export function DocumentsUploader({
  requestId,
  requirements,
  initialFiles,
  maxFiles,
  maxBytes,
  canRemove = true,
}: Props) {
  const [items, setItems] = useState<Item[]>(
    initialFiles.map((f) => ({
      key: f.id,
      id: f.id,
      name: f.originalName,
      size: f.sizeBytes,
      requirementId: f.requirementId,
      status: "done",
      progress: 100,
    })),
  );
  const busy = useRef(false);
  const counter = useRef(0);

  const patch = (key: string, changes: Partial<Item>) =>
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...changes } : item)),
    );

  async function uploadOne(key: string, requirementId: string | null, original: File) {
    patch(key, { status: "uploading", progress: 0, error: undefined });
    if (original.size > maxBytes * 4) {
      // Photos are shrunk first, but a huge file is refused at once.
      patch(key, {
        status: "failed",
        error: `That file is too big. The most we accept is ${maxBytes / 1024 / 1024} MB.`,
      });
      return;
    }
    const file = await compressImage(original);
    if (file.size > maxBytes) {
      patch(key, {
        status: "failed",
        error: `That file is too big. The most we accept is ${maxBytes / 1024 / 1024} MB.`,
      });
      return;
    }
    const result = await sendFile(requestId, requirementId, file, (progress) =>
      patch(key, { progress }),
    );
    if (result.ok && result.file) {
      patch(key, {
        status: "done",
        progress: 100,
        id: result.file.id,
        size: file.size,
        file: undefined,
      });
    } else {
      patch(key, { status: "failed", error: result.error ?? "Upload failed.", file: original });
    }
  }

  // One file at a time, so a slow connection is not overloaded.
  async function addFiles(requirementId: string | null, list: FileList | null) {
    if (!list || busy.current) return;
    busy.current = true;
    const files = Array.from(list);
    const room = Math.max(0, maxFiles - items.length);
    try {
      const accepted = files.slice(0, room);
      const created = accepted.map((file) => ({
        key: `new-${counter.current++}`,
        file,
        item: {
          name: file.name,
          size: file.size,
          requirementId,
          status: "uploading" as const,
          progress: 0,
        },
      }));
      setItems((current) => [...current, ...created.map((c) => ({ key: c.key, ...c.item }))]);
      for (const c of created) await uploadOne(c.key, requirementId, c.file);
    } finally {
      busy.current = false;
    }
  }

  async function retry(item: Item) {
    if (!item.file || busy.current) return;
    busy.current = true;
    try {
      await uploadOne(item.key, item.requirementId, item.file);
    } finally {
      busy.current = false;
    }
  }

  async function remove(item: Item) {
    if (!item.id) {
      setItems((current) => current.filter((i) => i.key !== item.key));
      return;
    }
    patch(item.key, { status: "removing" });
    const result = await removeFileAction(requestId, item.id);
    if (result.ok) setItems((current) => current.filter((i) => i.key !== item.key));
    else
      patch(item.key, {
        status: "done",
        error: "We could not remove that file. Please try again.",
      });
  }

  const full = items.length >= maxFiles;
  const groups: {
    id: string | null;
    label: string;
    details: string | null;
    isRequired: boolean | null;
  }[] = [
    ...requirements.map((r) => ({
      id: r.id,
      label: r.label,
      details: r.details,
      isRequired: r.isRequired,
    })),
    {
      id: null,
      label: requirements.length > 0 ? "Other documents" : "Your documents",
      details:
        requirements.length > 0
          ? "Anything else you want to send us."
          : "Add the documents for your request.",
      isRequired: null,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground" role="status">
        {items.length} of {maxFiles} files. JPG, PNG or PDF. Up to {maxBytes / 1024 / 1024} MB each.
      </p>
      {groups.map((group) => {
        const groupItems = items.filter((i) => i.requirementId === group.id);
        const inputId = `file-${group.id ?? "other"}`;
        return (
          <Card key={group.id ?? "other"}>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <CardTitle>{group.label}</CardTitle>
                {group.isRequired !== null ? (
                  <Badge variant={group.isRequired ? "primary" : "neutral"}>
                    {group.isRequired ? "Required" : "Optional"}
                  </Badge>
                ) : null}
              </div>
              {group.details ? <CardDescription>{group.details}</CardDescription> : null}
            </CardHeader>
            <CardContent>
              {groupItems.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {groupItems.map((item) => (
                    <li
                      key={item.key}
                      className="flex flex-col gap-2 rounded-md border bg-surface-subtle p-3"
                    >
                      <div className="flex items-start gap-3">
                        <FileText
                          aria-hidden="true"
                          className="mt-0.5 size-5 shrink-0 text-muted-foreground"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-base font-bold break-words">{item.name}</p>
                          <p className="flex items-center gap-1 text-sm text-muted-foreground">
                            {item.status === "uploading" ? (
                              <>
                                <LoaderCircle
                                  aria-hidden="true"
                                  className="size-4 animate-spin motion-reduce:animate-none"
                                />{" "}
                                Uploading {item.progress}%
                              </>
                            ) : item.status === "removing" ? (
                              "Removing..."
                            ) : item.status === "failed" ? (
                              <span className="flex items-start gap-1 font-bold text-danger-ink">
                                <CircleAlert
                                  aria-hidden="true"
                                  className="mt-0.5 size-4 shrink-0"
                                />
                                {item.error}
                              </span>
                            ) : (
                              <>
                                <CircleCheck
                                  aria-hidden="true"
                                  className="size-4 text-success-ink"
                                />{" "}
                                Added ({formatFileSize(item.size)})
                              </>
                            )}
                          </p>
                          {item.status === "done" && item.error ? (
                            <p className="text-sm font-bold text-danger-ink">{item.error}</p>
                          ) : null}
                        </div>
                        {item.status === "failed" && item.file ? (
                          <Button variant="outline" size="sm" onClick={() => retry(item)}>
                            <RotateCcw aria-hidden="true" /> Try again
                          </Button>
                        ) : null}
                        {canRemove && item.status !== "uploading" && item.status !== "removing" ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Remove ${item.name}`}
                            onClick={() => remove(item)}
                          >
                            <Trash2 aria-hidden="true" />
                          </Button>
                        ) : null}
                      </div>
                      {item.status === "uploading" ? (
                        <Progress value={item.progress} aria-label={`Uploading ${item.name}`} />
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}

              {/* The real file input is hidden. The label is the 44 px button. */}
              <div>
                <input
                  id={inputId}
                  type="file"
                  accept="image/jpeg,image/png,application/pdf"
                  multiple
                  disabled={full}
                  className="peer sr-only"
                  onChange={(event) => {
                    void addFiles(group.id, event.target.files);
                    event.target.value = "";
                  }}
                />
                <label
                  htmlFor={inputId}
                  className={cn(
                    "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-5 py-2 text-base font-bold hover:bg-accent peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
                    "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background",
                    focusRing,
                  )}
                >
                  <Paperclip aria-hidden="true" className="size-5" />
                  {groupItems.length > 0 ? "Add another file" : "Add a file"}
                </label>
              </div>
            </CardContent>
          </Card>
        );
      })}
      {full ? (
        <p className="text-sm font-bold text-warning-ink">
          You have reached the most files for one request.
        </p>
      ) : null}
    </div>
  );
}
