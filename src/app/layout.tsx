import type { Metadata, Viewport } from "next";
import { IM_Fell_English, IM_Fell_English_SC, UnifrakturMaguntia } from "next/font/google";
import { family } from "@/config";
import "./globals.css";

// Three faces and no more: blackletter for the name, Fell for everything
// else, Fell small caps for labels.
const unifraktur = UnifrakturMaguntia({
  variable: "--font-unifraktur",
  weight: "400",
  subsets: ["latin"],
});
const fell = IM_Fell_English({
  variable: "--font-fell",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
});
const fellSC = IM_Fell_English_SC({
  variable: "--font-fell-sc",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: family.name,
  description: `A quiet screen for ${family.household}.`,
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#f8f4ea",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${unifraktur.variable} ${fell.variable} ${fellSC.variable}`}>
      <body>{children}</body>
    </html>
  );
}
