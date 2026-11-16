import type { Metadata, Viewport } from "next";
import {
  Cormorant_Garamond,
  EB_Garamond,
  Fraunces,
  IM_Fell_English,
  IM_Fell_English_SC,
  UnifrakturMaguntia,
} from "next/font/google";
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

// Faces for the design directions under review (src/views/designs). Not
// preloaded: only the chosen direction's face is fetched.
const garamond = EB_Garamond({
  variable: "--font-garamond",
  style: ["normal", "italic"],
  subsets: ["latin"],
  preload: false,
});
const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  preload: false,
});
const fraunces = Fraunces({
  variable: "--font-fraunces",
  style: ["normal", "italic"],
  axes: ["opsz", "SOFT", "WONK"],
  subsets: ["latin"],
  preload: false,
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
    <html
      lang="en"
      className={`${unifraktur.variable} ${fell.variable} ${fellSC.variable} ${garamond.variable} ${cormorant.variable} ${fraunces.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
