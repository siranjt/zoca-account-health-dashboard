"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { track } from "@/lib/track";

// Logs one page_view per route change. Stored in the DB + rolled into the
// hourly digest (not a real-time Slack ping, so navigation doesn't flood).
export default function ActivityTracker() {
  const path = usePathname() || "/";
  useEffect(() => {
    track("page_view", { surface: path });
  }, [path]);
  return null;
}
