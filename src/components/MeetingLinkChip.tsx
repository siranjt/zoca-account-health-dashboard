"use client";
import { useEffect, useRef, useState } from "react";

// The customer's "Check in meeting URL" from HubSpot. It isn't in the warehouse,
// so it can't ride along with the account row — fetch it lazily per account and
// self-hide when the integration is unconfigured or the account has no link.
// Two actions: open the scheduler (label) or copy the link (⧉ Copy).
export default function MeetingLinkChip({ entityId }: { entityId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    setUrl(null);
    setCopied(false);
    fetch(`/api/account/${entityId}/meeting-link`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d?.url) setUrl(String(d.url)); })
      .catch(() => {});
    return () => { alive = false; };
  }, [entityId]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  if (!url) return null;
  const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(href);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked (non-secure context / permissions) — no-op */
    }
  };

  return (
    <span
      className="inline-flex items-center overflow-hidden rounded-md border text-xs font-medium"
      style={{ borderColor: "var(--cave-line2)", color: "var(--cave-cy)" }}
    >
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title="Open the customer's check-in meeting"
        className="inline-flex items-center gap-1 px-2 py-1 no-underline"
      >
        📅 Meeting Link ↗
      </a>
      <button
        type="button"
        onClick={copy}
        title="Copy meeting link"
        aria-label="Copy meeting link"
        className="inline-flex items-center gap-1 border-l px-2 py-1"
        style={{ borderColor: "var(--cave-line2)" }}
      >
        {copied ? "✓ Copied" : "⧉ Copy"}
      </button>
    </span>
  );
}
