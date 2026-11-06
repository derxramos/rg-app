import localFont from "next/font/local";

// Only two font files are allowed (weights 400 and 700). Both contain the peso sign (U+20B1).
export const plusJakarta = localFont({
  src: [
    {
      path: "../../public/fonts/PlusJakartaSans-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../public/fonts/PlusJakartaSans-Bold.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-plus-jakarta",
  display: "swap",
});
