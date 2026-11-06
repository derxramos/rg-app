"use client";

import { ImageUp, ScanText } from "lucide-react";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";

import { savePaymentAction, type ReceiptFormState } from "@/app/(public)/request/payment-actions";
import { FieldError, FieldHint } from "@/components/shared/field-message";
import { WarningBox } from "@/components/shared/warning-box";
import { Button } from "@/components/ui/button";
import { Checkbox, CheckboxRow } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input, InputWithPrefix } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { NativeSelect } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { LOW_CONFIDENCE } from "@/ocr/merge";
import { getParser } from "@/ocr/parsers";

type Method = { id: string; name: string; parserKey: string | null };
type Field = "reference" | "amount" | "paidOn";
type FieldInfo = { source: "ocr" | "typed"; confidence: number };

type Ocr =
  | { state: "idle" }
  | { state: "reading"; progress: number }
  | { state: "done"; wrongApp: boolean }
  | { state: "failed"; message: string };

type Props = {
  requestId: string;
  methods: Method[];
  initialMethodId: string;
  minDate: string;
  maxDate: string;
};

const TYPED: FieldInfo = { source: "typed", confidence: 1 };

// The receipt step. Manual typing ALWAYS works. OCR only fills the fields, and every field can be changed.
// The picture is shown with an object URL on this phone only. The file input has no name and is not in
// the form, so the picture can never be sent.
export function ReceiptForm({ requestId, methods, initialMethodId, minDate, maxDate }: Props) {
  const initial: ReceiptFormState = {
    values: { paymentMethodId: initialMethodId, reference: "", amount: "", paidOn: "" },
    errors: {},
  };
  const action = useMemo(() => savePaymentAction.bind(null, requestId), [requestId]);
  const [state, formAction, pending] = useActionState(action, initial);

  const [methodId, setMethodId] = useState(initialMethodId);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [values, setValues] = useState<Record<Field, string>>({
    reference: "",
    amount: "",
    paidOn: "",
  });
  const [info, setInfo] = useState<Record<Field, FieldInfo>>({
    reference: TYPED,
    amount: TYPED,
    paidOn: TYPED,
  });
  const [original, setOriginal] = useState<Record<Field, string> | null>(null);
  const [ocr, setOcr] = useState<Ocr>({ state: "idle" });

  const method = methods.find((m) => m.id === methodId) ?? methods[0];
  const parser = getParser(method?.parserKey);
  const wasmOk = typeof WebAssembly === "object";
  const errors = state.errors;

  // The object URL is made when a picture is chosen and freed when it changes or the page closes.
  // Nothing is stored. The picture only lives in this browser tab.
  const urlRef = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  function choosePicture(chosen: File | null) {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = chosen ? URL.createObjectURL(chosen) : null;
    setFile(chosen);
    setPreviewUrl(urlRef.current);
    setOcr({ state: "idle" });
    setOriginal(null);
  }

  function setField(field: Field, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setInfo((current) => ({ ...current, [field]: TYPED }));
  }

  async function readReceipt() {
    if (!file || !parser) return;
    setOcr({ state: "reading", progress: 0 });
    try {
      // Tesseract.js is only downloaded now, when the client asks for it.
      const { readReceipt: run } = await import("@/ocr/engine");
      const outcome = await run(file, parser, (p) =>
        setOcr({ state: "reading", progress: p.progress }),
      );
      const f = outcome.fields;
      setValues({ reference: f.reference.value, amount: f.amount.value, paidOn: f.date.value });
      setInfo({
        reference: { source: "ocr", confidence: f.reference.confidence },
        amount: { source: "ocr", confidence: f.amount.confidence },
        paidOn: { source: "ocr", confidence: f.date.confidence },
      });
      setOriginal({ reference: f.reference.value, amount: f.amount.value, paidOn: f.date.value });
      setOcr({ state: "done", wrongApp: outcome.matchScore < 0.5 });
    } catch (error) {
      const timeout = error instanceof Error && error.message === "OCR_TIMEOUT";
      setOcr({
        state: "failed",
        message: timeout
          ? "Reading took too long. Please type the values from your receipt."
          : "We could not read the receipt. Please type the values from your receipt.",
      });
    }
  }

  // ocr = read and not changed, ocr_edited = read and then changed, manual = typed by hand.
  const edited = original
    ? (Object.keys(original) as Field[]).some((f) => original[f] && original[f] !== values[f])
    : false;
  const entryMethod = ocr.state !== "done" ? "manual" : edited ? "ocr_edited" : "ocr";

  function hint(field: Field) {
    if (info[field].source !== "ocr" || !values[field]) return null;
    return info[field].confidence < LOW_CONFIDENCE
      ? { text: "Not sure. Please check.", low: true }
      : { text: "Read from image. Please check.", low: false };
  }
  const border = (field: Field) => (hint(field)?.low ? "border-2 border-warning" : undefined);

  const hintLine = (field: Field) => {
    const h = hint(field);
    return h ? (
      <FieldHint className={cn(h.low && "font-bold text-warning-ink")}>{h.text}</FieldHint>
    ) : null;
  };

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <div className="flex flex-col gap-3">
        <Label htmlFor="receipt-file">Receipt screenshot</Label>
        {/* No name, and outside the form: the picture is never sent anywhere. */}
        <input
          id="receipt-file"
          type="file"
          accept="image/*"
          className="min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base file:mr-3 file:border-0 file:bg-transparent file:font-bold"
          onChange={(event) => choosePicture(event.target.files?.[0] ?? null)}
        />
        {previewUrl && file ? (
          <Dialog>
            <DialogTrigger asChild>
              <button
                type="button"
                className="overflow-hidden rounded-lg border bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
                aria-label="Zoom the receipt picture"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt="Your receipt (shown only on this phone)"
                  className="max-h-96 w-full object-contain"
                />
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Your receipt</DialogTitle>
                <DialogDescription>Shown only on this phone. It is not uploaded.</DialogDescription>
              </DialogHeader>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Your receipt, larger"
                className="max-h-[70vh] w-full object-contain"
              />
            </DialogContent>
          </Dialog>
        ) : (
          <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-surface-subtle p-4 text-center text-muted-foreground">
            <ImageUp aria-hidden="true" className="size-8" />
            <span>No picture yet. You can also just type the values.</span>
          </div>
        )}
      </div>

      <form action={formAction} noValidate className="flex flex-col gap-5">
        {state.formError ? (
          <WarningBox variant="danger" title="We could not save your payment">
            {state.formError}
          </WarningBox>
        ) : null}

        <div className="flex flex-col gap-2">
          <Label htmlFor="rc-method">Payment method</Label>
          <NativeSelect
            id="rc-method"
            name="paymentMethodId"
            value={methodId}
            onChange={(e) => setMethodId(e.target.value)}
            aria-invalid={errors.paymentMethodId ? true : undefined}
          >
            {methods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </NativeSelect>
          {errors.paymentMethodId ? <FieldError>{errors.paymentMethodId}</FieldError> : null}
        </div>

        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={readReceipt}
            disabled={!file || !parser || !wasmOk || ocr.state === "reading"}
            loading={ocr.state === "reading"}
          >
            {ocr.state !== "reading" ? <ScanText aria-hidden="true" /> : null}
            Read my receipt
          </Button>
          {!wasmOk || !parser ? (
            <FieldHint>Reading is not available for this method. Please type the values.</FieldHint>
          ) : (
            <FieldHint>
              The reading tool is downloaded the first time (about 4 MB). Or type the values
              yourself.
            </FieldHint>
          )}
          {ocr.state === "reading" ? (
            <Progress value={Math.round(ocr.progress * 100)} aria-label="Reading your receipt" />
          ) : null}
          {ocr.state === "failed" ? (
            <WarningBox variant="warning" title="Please type the values">
              {ocr.message}
            </WarningBox>
          ) : null}
          {ocr.state === "done" && ocr.wrongApp ? (
            <WarningBox variant="warning" title="Check the values carefully">
              This does not look like a {method?.name} receipt. Please check the values carefully.
            </WarningBox>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="rc-reference">Reference number</Label>
          <Input
            id="rc-reference"
            name="reference"
            value={values.reference}
            onChange={(e) => setField("reference", e.target.value)}
            inputMode={parser && /^[0-9]+$/.test(parser.referenceCharList) ? "numeric" : "text"}
            autoComplete="off"
            maxLength={40}
            className={border("reference")}
            aria-invalid={errors.reference ? true : undefined}
          />
          {errors.reference ? <FieldError>{errors.reference}</FieldError> : hintLine("reference")}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="rc-amount">Amount you paid</Label>
          <InputWithPrefix
            id="rc-amount"
            name="amount"
            prefix="₱"
            value={values.amount}
            onChange={(e) => setField("amount", e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            autoComplete="off"
            maxLength={20}
            className={border("amount")}
            invalid={Boolean(errors.amount)}
          />
          {errors.amount ? <FieldError>{errors.amount}</FieldError> : hintLine("amount")}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="rc-date">Date on the receipt</Label>
          <Input
            id="rc-date"
            name="paidOn"
            type="date"
            min={minDate}
            max={maxDate}
            value={values.paidOn}
            onChange={(e) => setField("paidOn", e.target.value)}
            className={border("paidOn")}
            aria-invalid={errors.paidOn ? true : undefined}
          />
          {errors.paidOn ? <FieldError>{errors.paidOn}</FieldError> : hintLine("paidOn")}
        </div>

        <input type="hidden" name="entryMethod" value={entryMethod} />
        <input
          type="hidden"
          name="ocrRaw"
          value={
            original
              ? JSON.stringify({
                  reference: original.reference,
                  amount: original.amount,
                  date: original.paidOn,
                })
              : ""
          }
        />

        <div className="flex flex-col gap-1">
          <CheckboxRow htmlFor="rc-confirmed">
            <Checkbox
              id="rc-confirmed"
              name="confirmed"
              aria-invalid={errors.confirmed ? true : undefined}
            />
            <span>I checked that these values match my receipt.</span>
          </CheckboxRow>
          {errors.confirmed ? <FieldError>{errors.confirmed}</FieldError> : null}
        </div>

        <div>
          <Button type="submit" size="lg" loading={pending} className="w-full sm:w-auto">
            Submit payment
          </Button>
        </div>
      </form>
    </div>
  );
}
