import type { CSSProperties } from "react";
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Keel Console",
  description:
    "On-device language models for Xbox — a 10-foot living-room console app.",
  applicationName: "Keel Console",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/brand/icon.svg", type: "image/svg+xml" },
      { url: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/brand/icon-512.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a1112",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-tone="ink"
      data-accent="sage"
      data-safe-zone="standard"
      data-text-scale="large"
      className="dark h-full antialiased"
      style={
        {
          "--font-sans":
            '-apple-system, BlinkMacSystemFont, "Segoe UI", "SF Pro Text", "Inter", system-ui, sans-serif',
          "--font-display":
            '-apple-system, BlinkMacSystemFont, "Segoe UI", "SF Pro Display", "Inter", system-ui, sans-serif',
          "--font-mono":
            '"Cascadia Mono", "JetBrains Mono", "SF Mono", ui-monospace, monospace',
        } as CSSProperties
      }
    >
      <body className="flex min-h-full flex-col font-sans selection:bg-[color:var(--keel-accent)] selection:text-[color:var(--keel-accent-ink)]">
        {children}
      </body>
    </html>
  );
}
