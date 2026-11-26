import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, IBM_Plex_Mono, Instrument_Sans } from "next/font/google";
import "lenis/dist/lenis.css";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { SmoothScroll } from "@/components/providers/smooth-scroll";

const display = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-cormorant",
  display: "swap",
});

const sans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Pactline | Procurement continuity for construction",
    template: "%s | Pactline",
  },
  description:
    "Pactline watches schedules, purchase orders and vendor promises, then runs every slipping equipment delivery through to verified receipt.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f1f3ec" },
    { media: "(prefers-color-scheme: dark)", color: "#0b130f" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      {/* Extensions such as ColorZilla add attributes to <body> before hydration. */}
      <body suppressHydrationWarning>
        <ThemeProvider>
          <SmoothScroll>{children}</SmoothScroll>
        </ThemeProvider>
      </body>
    </html>
  );
}
