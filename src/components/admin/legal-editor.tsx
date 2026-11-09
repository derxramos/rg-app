"use client";

import { useState } from "react";

import { ActionForm } from "@/components/admin/action-form";
import { Markdown } from "@/components/shared/markdown";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LEGAL_BODY_MAX, fillLegalText, type LegalFacts, type LegalKind } from "@/lib/legal-text";
import type { ActionResult } from "@/server/auth/panel";

// The text box for the Privacy notice or the Terms, with a preview of how visitors will read it.
// The words {{retention_days}} and {{contact_lines}} stay in the text and are filled in on the website.
export function LegalEditor({
  kind,
  initialBody,
  facts,
  action,
  cancelHref,
}: {
  kind: LegalKind;
  initialBody: string;
  facts: LegalFacts;
  action: (previous: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  cancelHref: string;
}) {
  const [body, setBody] = useState(initialBody);
  const [preview, setPreview] = useState(false);

  return (
    <ActionForm
      action={action}
      hidden={{ kind }}
      submitLabel="Save as a new version"
      cancelHref={cancelHref}
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor="legal-body">Text</Label>
          <div className="flex gap-2" role="group" aria-label="Write or preview">
            <Button
              type="button"
              size="sm"
              variant={preview ? "outline" : "default"}
              aria-pressed={!preview}
              onClick={() => setPreview(false)}
            >
              Write
            </Button>
            <Button
              type="button"
              size="sm"
              variant={preview ? "default" : "outline"}
              aria-pressed={preview}
              onClick={() => setPreview(true)}
            >
              Preview
            </Button>
          </div>
        </div>
        {/* The box stays in the page (hidden) while previewing, so the text is still sent when saving. */}
        <Textarea
          id="legal-body"
          name="body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={LEGAL_BODY_MAX}
          className="min-h-[28rem] font-mono text-sm"
          hidden={preview}
          spellCheck
        />
        {preview ? (
          <div className="min-h-[28rem] rounded-md border bg-background p-4">
            <Markdown>{fillLegalText(kind, body, facts)}</Markdown>
          </div>
        ) : null}
        <p className="text-sm text-muted-foreground">
          Use ## for headings and - for lists. Keep <code>{"{{retention_days}}"}</code> and{" "}
          <code>{"{{contact_lines}}"}</code> where they are: the website fills them in.
        </p>
      </div>
    </ActionForm>
  );
}
