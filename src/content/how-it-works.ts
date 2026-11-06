import { FilePlus2, Search, QrCode, ScanSearch, Upload, type LucideIcon } from "lucide-react";

// The steps of the request flow, in plain words (docs/FEATURES.md P4).
// No promises about time and no fees: the business confirms those with each client.
export const HOW_IT_WORKS_STEPS: readonly {
  title: string;
  text: string;
  icon: LucideIcon;
}[] = [
  {
    title: "Send a request",
    text: "Choose a service and tell us how to reach you. You get a tracking code right away.",
    icon: FilePlus2,
  },
  {
    title: "Upload your documents",
    text: "Add a photo or a PDF of each document. We accept JPG, PNG and PDF files.",
    icon: Upload,
  },
  {
    title: "Pay by QR code",
    text: "Scan our QR code in your own GCash, Maya or bank app. You pay in your app, never on this website. You can also pay later.",
    icon: QrCode,
  },
  {
    title: "We review",
    text: "Our team checks your request and your payment. If something is missing, we tell you what to send.",
    icon: ScanSearch,
  },
  {
    title: "Track your request",
    text: "Enter your tracking code and the last 4 digits of your mobile number to see where your request is.",
    icon: Search,
  },
];
