import type { Metadata } from "next";
import type { Viewport } from "next";
import { Bricolage_Grotesque, Geist_Mono, Hanken_Grotesk } from "next/font/google";
import "./globals.css";
import "./editorial.css";

// Bricolage Grotesque for display and figures, Hanken Grotesk for the interface, Geist Mono for timecodes only.
const display = Bricolage_Grotesque({ variable: "--font-ed-display", subsets: ["latin"], axes: ["opsz", "wdth"] });
const body = Hanken_Grotesk({ variable: "--font-ed-body", subsets: ["latin"] });

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Screen-Time", template: "%s · Screen-Time" },
  description: "Second-by-second proof your product was seen in creator video, checked against the contract.",
};

export const viewport: Viewport = { viewportFit: "cover", themeColor: "#f7f6f2" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${geistMono.variable} h-full`}>
      <body className="ed flex min-h-full flex-col overflow-x-clip">{children}</body>
    </html>
  );
}
