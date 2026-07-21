import type { Metadata } from "next";
import "./globals.css";
import AlfredChat from "@/components/AlfredChat";
import CommandPalette from "@/components/CommandPalette";
import Toaster from "@/components/Toaster";
import ShortcutsHelp from "@/components/ShortcutsHelp";
import BatFX from "@/components/BatFX";

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
        <div className="cave-boot" aria-hidden="true">
          <div className="ln" />
          <div className="tx">◤◢ CAVE//OS · BAT-COMPUTER ONLINE</div>
          <div className="lines">
            &gt; INITIALIZING TACTICAL GRID<br />
            &gt; UPLINK METABASE … <b>OK</b><br />
            &gt; SYNCING UNITS … <b>OK</b><br />
            &gt; THREAT MATRIX ARMED
          </div>
          <div className="prog"><i /></div>
          <div className="pct" id="cave-pct">0%</div>
        </div>
        {children}
        <BatFX />
        <CommandPalette />
        <ShortcutsHelp />
        <Toaster />
        <AlfredChat />
      </body>
    </html>
  );
}
