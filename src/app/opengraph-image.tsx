import { ImageResponse } from "next/og";

// The picture shown when a page link is shared (Facebook, Messenger, Viber...).
// Drawn with simple shapes and text, so it needs no image file.
export const alt = "RG'S Bookkeeping and Accounting Services";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "0 90px",
        background: "#0B6158",
        color: "#FFFFFF",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          right: -120,
          top: -120,
          width: 460,
          height: 460,
          borderRadius: 460,
          background: "#FF7B47",
          opacity: 0.9,
        }}
      />
      <div
        style={{
          position: "absolute",
          right: 140,
          bottom: 70,
          width: 90,
          height: 90,
          borderRadius: 90,
          background: "#FFD23F",
        }}
      />
      <svg width="120" height="120" viewBox="0 0 64 64">
        <rect width="64" height="64" rx="16" fill="#FFFFFF" />
        <g fill="none" stroke="#0B6158" strokeWidth="6">
          <path d="M16 47V17h8a7 7 0 0 1 0 14h-8" />
          <path d="M23 31l7 16" />
          <path d="M49.1 25A10.5 10.5 0 1 0 52.5 32" />
        </g>
        <path d="M52.5 32H43.5" stroke="#FF7B47" strokeWidth="6" fill="none" />
      </svg>
      <div style={{ fontSize: 84, fontWeight: 700, marginTop: 36, lineHeight: 1.1 }}>RG&apos;S</div>
      <div style={{ fontSize: 40, marginTop: 10 }}>Bookkeeping and Accounting Services</div>
      <div style={{ fontSize: 30, marginTop: 28, opacity: 0.9 }}>
        Send your request online. Track it with a code.
      </div>
    </div>,
    size,
  );
}
