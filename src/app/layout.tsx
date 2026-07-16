import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zoca — Account Health Dashboard",
  description:
    "List view of all active (non-churned) Zoca accounts with per-account health markers, leads, reviews, GBP metrics, rankings and active products.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
