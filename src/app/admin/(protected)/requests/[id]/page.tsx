import { FileText, Lock, Send } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ActionForm } from "@/components/admin/action-form";
import { AdminTitle } from "@/components/admin/bits";
import { PaymentStateBadge } from "@/components/shared/payment-state-badge";
import { StatusBadge } from "@/components/shared/status-badge";
import { WarningBox } from "@/components/shared/warning-box";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, CheckboxRow } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatFileSize } from "@/lib/image-compress";
import { formatPesos } from "@/lib/money";
import { STATUS_LABELS, nextStatusesFor } from "@/lib/status";
import { formatManilaDate, formatManilaDateTime, todayInManila } from "@/lib/time";
import { guardPanelPage } from "@/server/auth/panel";
import { can } from "@/lib/permissions";
import { getDb } from "@/server/db/client";
import { listEmailsForRequest } from "@/server/email/send";
import { getRequestDetail } from "@/server/services/admin-requests";

import {
  addNoteAction,
  changeStatusAction,
  eraseClientDataAction,
  recordOfflinePaymentAction,
  rejectPaymentAction,
  retryEmailAction,
  verifyPaymentAction,
  voidOfflinePaymentAction,
} from "../actions";

export const metadata: Metadata = { title: "Request" };

const RETRYABLE_TEMPLATES: string[] = [
  "request_submitted_admin",
  "request_submitted_client",
  "payment_submitted_admin",
  "payment_verified_client",
  "status_changed_client",
  "client_message_client",
];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
      <dt className="text-sm text-muted-foreground sm:w-40 sm:shrink-0">{label}</dt>
      <dd className="min-w-0 text-base break-words">{children}</dd>
    </div>
  );
}

export default async function AdminRequestDetailPage({
  params,
}: PageProps<"/admin/requests/[id]">) {
  const admin = await guardPanelPage("requests.view", "/admin/requests/[id]");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const detail = await getRequestDetail(getDb(), id);
  if (!detail) notFound();
  const emails = await listEmailsForRequest(getDb(), id);
  const { request, files, payments, events, notes } = detail;
  const nextStatuses = nextStatusesFor("admin", request.status);
  const canVerify = can(admin.role, "payments.verify");
  const canVoid = can(admin.role, "payments.void");
  // A payment can be recorded once the request was sent and until it is cancelled.
  const canRecord =
    can(admin.role, "payments.record_offline") &&
    !["draft", "cancelled", "rejected"].includes(request.status);

  return (
    <>
      <AdminTitle
        title={request.trackingCode}
        intro={`${request.serviceName} · ${request.clientFullName}`}
        actions={<StatusBadge status={request.status} />}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="flex flex-col gap-6 xl:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Client</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="flex flex-col gap-3">
                <Row label="Name">{request.clientFullName}</Row>
                <Row label="Email">{request.clientEmail}</Row>
                <Row label="Mobile number">{request.clientPhone}</Row>
                {request.businessName ? <Row label="Business">{request.businessName}</Row> : null}
                {request.clientMessage ? <Row label="Message">{request.clientMessage}</Row> : null}
                <Row label="Consent">
                  Version {request.consentVersion}, {formatManilaDateTime(request.consentAt)}
                </Row>
                <Row label="Created">{formatManilaDateTime(request.createdAt)}</Row>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Files</CardTitle>
            </CardHeader>
            <CardContent>
              {request.filesDeletedAt ? (
                <p className="font-bold text-warning-ink">
                  Files deleted on {formatManilaDate(request.filesDeletedAt)}
                </p>
              ) : null}
              {files.length === 0 ? (
                <p className="text-base text-muted-foreground">
                  No files uploaded. The client may bring the documents to the office.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {files.map((f) => (
                    <li
                      key={f.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-surface-subtle p-3"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <FileText aria-hidden="true" className="size-5 shrink-0" />
                        <span className="break-words">{f.originalName}</span>
                        <span className="text-sm text-muted-foreground">
                          {formatFileSize(f.sizeBytes)}
                        </span>
                      </span>
                      {f.deletedAt ? (
                        <span className="text-sm font-bold text-warning-ink">Deleted</span>
                      ) : (
                        // The link makes a 60 second signed address and writes the open to the activity log.
                        <a
                          href={`/api/admin/file?id=${f.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-11 items-center rounded-md border border-input bg-background px-4 text-base font-bold text-primary hover:bg-accent"
                        >
                          Open (new tab)
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <section aria-labelledby="payments-title" className="flex flex-col gap-4">
            <h2 id="payments-title" className="text-xl font-bold">
              Payments
            </h2>
            {payments.length === 0 ? (
              <p className="text-base text-muted-foreground">No payment yet.</p>
            ) : null}
            {payments.map((p) => {
              const snapshot = p.methodSnapshot as {
                name?: string;
                accountName?: string;
                accountNumber?: string;
                offline?: boolean;
                recordedByName?: string;
              };
              const isOffline = p.entryMethod === "offline";
              const raw = p.ocrRawValues as {
                reference?: string;
                amount?: string;
                date?: string;
              } | null;
              return (
                <Card key={p.id}>
                  <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
                    <CardTitle>
                      {formatPesos(p.amountCentavos)} by {snapshot.name ?? "payment"}
                    </CardTitle>
                    <PaymentStateBadge state={p.status} />
                  </CardHeader>
                  <CardContent>
                    <dl className="flex flex-col gap-2">
                      <Row label="Reference">{p.referenceNumber}</Row>
                      <Row label={isOffline ? "Paid on" : "Date on receipt"}>
                        {formatManilaDate(`${p.paidOn}T00:00:00+08:00`)}
                      </Row>
                      <Row label="How it was entered">
                        {isOffline
                          ? `Recorded by ${snapshot.recordedByName ?? "staff"} (paid outside the website)`
                          : p.entryMethod === "ocr"
                            ? "Read from the picture (OCR)"
                            : p.entryMethod === "ocr_edited"
                              ? "Read from the picture, then changed"
                              : "Typed by hand"}
                      </Row>
                      {isOffline ? (
                        p.note ? (
                          <Row label="Note">{p.note}</Row>
                        ) : null
                      ) : (
                        <Row label="Account the client saw">
                          {snapshot.accountName} ({snapshot.accountNumber})
                        </Row>
                      )}
                      {p.entryMethod === "ocr_edited" && raw ? (
                        <Row label="OCR first read">
                          Reference {raw.reference || "-"}, amount {raw.amount || "-"}, date{" "}
                          {raw.date || "-"}
                        </Row>
                      ) : null}
                      {p.rejectionReason ? (
                        <Row label="Rejected because">{p.rejectionReason}</Row>
                      ) : null}
                    </dl>
                    {isOffline && p.status === "verified" && canVoid ? (
                      <ActionForm
                        action={voidOfflinePaymentAction}
                        hidden={{ paymentId: p.id }}
                        submitLabel="Void this payment"
                        variant="outline"
                      >
                        <div className="flex flex-col gap-2">
                          <Label htmlFor={`void-${p.id}`}>
                            Why is it wrong? (kept in the activity log)
                          </Label>
                          <Input id={`void-${p.id}`} name="reason" maxLength={300} required />
                        </div>
                      </ActionForm>
                    ) : null}
                    {p.status === "pending" ? (
                      canVerify ? (
                        <div className="flex flex-col gap-4">
                          <WarningBox
                            variant="warning"
                            strong
                            title="Check this payment in your own GCash / Maya / BDO app first."
                          >
                            These values came from the client (typed or read by OCR from their
                            screenshot). They can be wrong or fake.
                          </WarningBox>
                          <ActionForm
                            action={verifyPaymentAction}
                            hidden={{ paymentId: p.id }}
                            submitLabel="Mark payment verified"
                          >
                            <CheckboxRow htmlFor={`found-${p.id}`}>
                              <Checkbox id={`found-${p.id}`} name="found" />
                              <span>I found this payment in our account.</span>
                            </CheckboxRow>
                          </ActionForm>
                          <ActionForm
                            action={rejectPaymentAction}
                            hidden={{ paymentId: p.id }}
                            submitLabel="Reject payment"
                            variant="outline"
                          >
                            <div className="flex flex-col gap-2">
                              <Label htmlFor={`reason-${p.id}`}>
                                Reason (the client sees this)
                              </Label>
                              <Input id={`reason-${p.id}`} name="reason" maxLength={300} />
                            </div>
                          </ActionForm>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Only the owner can verify payments.
                        </p>
                      )
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
            {canRecord ? (
              <Card>
                <CardHeader>
                  <CardTitle>Record a payment (cash or other)</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <p className="text-base text-muted-foreground">
                    Use this when the client paid outside the website, for example in the office
                    after choosing &quot;Skip for now. I will pay later&quot;. The request is marked
                    as paid and the client gets an email.
                  </p>
                  <ActionForm
                    action={recordOfflinePaymentAction}
                    hidden={{ requestId: request.id }}
                    submitLabel="Record payment and mark as paid"
                    resetOnSuccess
                  >
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="off-method">How did the client pay?</Label>
                      <NativeSelect id="off-method" name="method" defaultValue="cash">
                        <option value="cash">Cash</option>
                        <option value="bank_transfer">Bank transfer</option>
                        <option value="other">Other (write it in the note)</option>
                      </NativeSelect>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="off-amount">Amount received (pesos)</Label>
                      <Input
                        id="off-amount"
                        name="amount"
                        inputMode="decimal"
                        placeholder="1500.00"
                        required
                        className="max-w-48"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="off-date">Date paid</Label>
                      <Input
                        id="off-date"
                        name="paidOn"
                        type="date"
                        defaultValue={todayInManila()}
                        max={todayInManila()}
                        required
                        className="max-w-48"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="off-receipt">Receipt or OR number (if any)</Label>
                      <Input
                        id="off-receipt"
                        name="receiptNumber"
                        maxLength={40}
                        className="max-w-72"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="off-note">
                        Note (required if there is no receipt number)
                      </Label>
                      <Input id="off-note" name="note" maxLength={300} />
                    </div>
                  </ActionForm>
                </CardContent>
              </Card>
            ) : null}
          </section>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Change status</CardTitle>
            </CardHeader>
            <CardContent>
              {nextStatuses.length === 0 ? (
                <p className="text-base text-muted-foreground">
                  No change is possible from {STATUS_LABELS[request.status]}.
                </p>
              ) : (
                <ActionForm
                  action={changeStatusAction}
                  hidden={{ requestId: request.id }}
                  submitLabel="Change status"
                >
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="status-to">New status</Label>
                    <NativeSelect id="status-to" name="to" defaultValue={nextStatuses[0]}>
                      {nextStatuses.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABELS[s]}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="status-msg">Message to the client (optional)</Label>
                    <Textarea id="status-msg" name="message" maxLength={2000} />
                  </div>
                </ActionForm>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="flex flex-col gap-3">
                {events.map((e) => (
                  <li key={e.id} className="flex flex-col gap-1">
                    <StatusBadge status={e.toStatus} />
                    <span className="text-sm text-muted-foreground">
                      {formatManilaDateTime(e.createdAt)}
                      {e.changedByName ? ` · ${e.changedByName}` : ""}
                    </span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>

      {can(admin.role, "requests.erase_client_data") &&
      request.clientFullName !== "Deleted client" ? (
        <Card>
          <CardHeader>
            <CardTitle>Delete client data (privacy request)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-base text-muted-foreground">
              Use this when the client asks us to delete their information. The files are deleted
              and the name, email, phone and messages are cleared. A small record stays for your
              accounts (code, service, dates, payment values). This cannot be undone.
            </p>
            <ActionForm
              action={eraseClientDataAction}
              fresh
              hidden={{ requestId: request.id }}
              submitLabel="Delete this client's data"
              variant="destructive"
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="erase-confirm">Type DELETE to confirm</Label>
                <Input id="erase-confirm" name="confirm" autoComplete="off" className="max-w-48" />
              </div>
            </ActionForm>
          </CardContent>
        </Card>
      ) : null}

      <section aria-labelledby="emails-title" className="flex flex-col gap-3">
        <h2 id="emails-title" className="text-xl font-bold">
          Emails
        </h2>
        {emails.length === 0 ? (
          <p className="text-base text-muted-foreground">No emails yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {emails.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-3"
              >
                <span className="min-w-0">
                  <span className="block font-mono text-sm font-bold break-all">{e.template}</span>
                  <span className="block text-sm text-muted-foreground break-all">
                    {e.toEmail} · {formatManilaDateTime(e.createdAt)}
                  </span>
                  {e.status === "failed" && e.error ? (
                    <span className="block text-sm text-danger-ink">{e.error}</span>
                  ) : null}
                </span>
                {e.status === "sent" ? (
                  <span className="text-sm font-bold text-success-ink">Sent</span>
                ) : (
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-danger-ink">Email not sent</span>
                    {RETRYABLE_TEMPLATES.includes(e.template) ? (
                      <ActionForm
                        action={retryEmailAction}
                        hidden={{ logId: e.id, requestId: request.id }}
                        submitLabel="Retry"
                        variant="outline"
                        size="sm"
                      >
                        <span />
                      </ActionForm>
                    ) : null}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="notes-title" className="flex flex-col gap-4">
        <h2 id="notes-title" className="text-xl font-bold">
          Notes and messages
        </h2>
        <ActionForm
          action={addNoteAction}
          hidden={{ requestId: request.id }}
          submitLabel="Save"
          resetOnSuccess
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="note-kind">Who can see it?</Label>
            <NativeSelect id="note-kind" name="visibility" defaultValue="internal">
              <option value="internal">Internal note (staff only)</option>
              <option value="client">Message to the client (shown on the tracking page)</option>
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="note-body">Text</Label>
            <Textarea id="note-body" name="body" maxLength={2000} required />
          </div>
        </ActionForm>
        <ul className="flex flex-col gap-3">
          {notes.map((n) =>
            n.visibility === "internal" ? (
              // Staff only: yellow dashed box with a lock.
              <li
                key={n.id}
                className="flex flex-col gap-1 rounded-lg border-2 border-dashed border-warning bg-warning-soft p-4 text-warning-ink"
              >
                <span className="flex items-center gap-2 text-sm font-bold">
                  <Lock aria-hidden="true" className="size-4" />
                  Internal note (staff only) · {n.authorName} · {formatManilaDateTime(n.createdAt)}
                </span>
                <span className="text-base whitespace-pre-line">{n.body}</span>
              </li>
            ) : (
              // Shown to the client: blue box with a send icon.
              <li
                key={n.id}
                className="flex flex-col gap-1 rounded-lg border border-info bg-info-soft p-4 text-info-ink"
              >
                <span className="flex items-center gap-2 text-sm font-bold">
                  <Send aria-hidden="true" className="size-4" />
                  Message to the client · {n.authorName} · {formatManilaDateTime(n.createdAt)}
                </span>
                <span className="text-base whitespace-pre-line">{n.body}</span>
              </li>
            ),
          )}
        </ul>
      </section>
    </>
  );
}
