"use client";
import { useEffect, useState } from "react";

// The customer's "Check in meeting URL" from HubSpot. It isn't in the warehouse,
// so it can't ride along with the account row — fetch it lazily per account and
// self-hide when the integration is unconfigured or the account has no link.
export default function MeetingLinkChip({ entityId }: { entityId: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setUrl(null);
    fetch(`/api/account/${entityId}/meeting-link`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d?.url) setUrl(String(d.url)); })
      .catch(() => {});
    return () => { alive = false; };
  }, [entityId]);

  if (!url) return null;
  const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title="Open the customer's check-in meeting"
      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium no-underline"
      style={{ borderColor: "var(--cave-line2)", color: "var(--cave-cy)" }}
    >
      📅 Meeting Link ↗
    </a>
  );
}
