"use client";

import { Download, Eraser } from "lucide-react";
import { useCallback, useState } from "react";

import { purgeActivityAction } from "@/app/admin/(protected)/activity/actions";
import { ActionForm } from "@/components/admin/action-form";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";

// The manual clean-up of the activity log (owner and admin). The log is also cleaned by itself: entries older than
// 1 year are removed every day. Here you can remove older entries sooner (older than 90, 180 or 365 days).
// It needs the confirm of the person doing it, and the clean-up is written to the log (that entry stays).
export function ActivityCleanup({ counts }: { counts: Record<number, number> }) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(180);
  // The age (in days) for which the CSV copy was downloaded. The button stays off until it matches the choice.
  const [downloadedFor, setDownloadedFor] = useState<number | null>(null);
  const close = useCallback(() => setOpen(false), []);
  const willRemove = counts[days] ?? 0;
  const needsCopy = willRemove > 0 && downloadedFor !== days;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Eraser aria-hidden="true" />
          Clean up old entries
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Clean up old entries</DialogTitle>
          <DialogDescription>
            This removes old lines from the activity log. It cannot be undone. Entries from the last
            30 days can never be removed. The clean-up itself is written to the log.
          </DialogDescription>
        </DialogHeader>
        {willRemove > 0 ? (
          <div className="flex flex-col gap-2 rounded-lg border bg-primary-soft p-3 text-primary-ink">
            <p className="text-sm font-bold">
              First download a copy. The clean-up button stays off until you do.
            </p>
            <a
              href={`/api/admin/activity-export?days=${days}`}
              download
              onClick={() => setDownloadedFor(days)}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Download aria-hidden="true" />
              {willRemove === 1
                ? "Download this entry as CSV"
                : `Download these ${willRemove} entries as CSV`}
            </a>
          </div>
        ) : null}
        <ActionForm
          action={purgeActivityAction}
          fresh
          variant="destructive"
          submitLabel={`Remove ${willRemove} ${willRemove === 1 ? "entry" : "entries"}`}
          submitDisabled={needsCopy}
          onSuccess={close}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="purge-days">Remove entries older than</Label>
            <NativeSelect
              id="purge-days"
              name="olderThanDays"
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
            >
              <option value={90}>90 days</option>
              <option value={180}>180 days (6 months)</option>
              <option value={365}>365 days (1 year)</option>
            </NativeSelect>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {willRemove === 0
                ? "There is nothing that old yet."
                : `${willRemove} ${willRemove === 1 ? "entry" : "entries"} will be removed.`}
            </p>
          </div>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
