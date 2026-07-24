// Client-side activity tracker. Fires one beacon per event to /api/activity;
// the server attaches the trustworthy actor from the session. sendBeacon-first
// so events survive navigation-away (page_view, account open → detail nav, …).
// No-throw, no batching — one call = one event.
export function track(
  event: string,
  opts?: { surface?: string; entityId?: string; detail?: Record<string, unknown> }
): void {
  if (typeof navigator === "undefined") return;
  try {
    const body = JSON.stringify({ event, ...opts });
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }));
    } else {
      void fetch("/api/track", {
        method: "POST",
        body,
        keepalive: true,
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch {
    /* ignore */
  }
}
