import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { Bricolage_Grotesque, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  axes: ["opsz"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Keel Console",
  description:
    "On-device language models for Xbox — a 10-foot console app aimed at the Microsoft Store.",
  applicationName: "Keel Console",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`dark ${bricolage.variable} ${mono.variable} h-full antialiased`}
      style={
        {
          "--font-sans": "var(--font-bricolage)",
          "--font-display": "var(--font-bricolage)",
        } as CSSProperties
      }
    >
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
