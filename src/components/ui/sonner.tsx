"use client";

import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { Toaster as Sonner, toast, type ToasterProps } from "sonner";

// Toasts: icon and words, never color alone. 5 s on screen, 8 s for errors.
// Sonner marks the toast area as a live region, so screen readers announce the text.
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="bottom-center"
      duration={5000}
      icons={{
        success: <CircleCheck aria-hidden="true" className="size-5" />,
        error: <CircleAlert aria-hidden="true" className="size-5" />,
        warning: <TriangleAlert aria-hidden="true" className="size-5" />,
        info: <Info aria-hidden="true" className="size-5" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius-md)",
          "--success-bg": "var(--success-soft)",
          "--success-text": "var(--success-ink)",
          "--success-border": "var(--success)",
          "--error-bg": "var(--danger-soft)",
          "--error-text": "var(--danger-ink)",
          "--error-border": "var(--danger)",
          "--warning-bg": "var(--warning-soft)",
          "--warning-text": "var(--warning-ink)",
          "--warning-border": "var(--warning)",
          "--info-bg": "var(--info-soft)",
          "--info-text": "var(--info-ink)",
          "--info-border": "var(--info)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "font-sans text-base font-bold shadow-md",
        },
      }}
      {...props}
    />
  );
}

// Small helper so errors stay longer (8 s) than other toasts (5 s).
const notify = {
  success: (message: string) => toast.success(message),
  info: (message: string) => toast.info(message),
  warning: (message: string) => toast.warning(message),
  error: (message: string) => toast.error(message, { duration: 8000 }),
};

export { Toaster, notify };
