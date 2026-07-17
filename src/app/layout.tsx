import type { Metadata } from "next";
import "./globals.css";
import AlfredChat from "@/components/AlfredChat";

export const metadata: Metadata = {
  title: "CAVE//OS — Account Health Command Deck",
  description:
    "Zoca account-health command deck with Alfred — reasons over per-account health, leads, reviews, GBP metrics, rankings and active products.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        <AlfredChat />
      </body>
    </html>
  );
}
