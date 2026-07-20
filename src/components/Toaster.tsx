"use client";

import { useEffect, useState } from "react";

// Fire a toast from anywhere: window.dispatchEvent(new CustomEvent("cave-toast", { detail: { message } }))
export function toast(message: string) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("cave-toast", { detail: { message } }));
}

interface T { id: number; message: string; }

export default function Toaster() {
  const [toasts, setToasts] = useState<T[]>([]);

  useEffect(() => {
    let seq = 0;
    function onToast(e: Event) {
      const message = (e as CustomEvent)?.detail?.message;
      if (!message) return;
      const id = ++seq;
      setToasts((t) => [...t, { id, message: String(message) }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
    }
    window.addEventListener("cave-toast", onToast as EventListener);
    return () => window.removeEventListener("cave-toast", onToast as EventListener);
  }, []);

  if (!toasts.length) return null;
  return (
    <div className="fixed bottom-5 right-5 z-[2147483400] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="cave-toast-in rounded-lg border px-3 py-2 text-xs font-medium shadow-xl"
          style={{ borderColor: "var(--cave-line2)", background: "var(--cave-panel)", color: "var(--cave-txt)" }}
        >
          <span style={{ color: "var(--cave-cy)" }}>✓</span> {t.message}
        </div>
      ))}
    </div>
  );
}
