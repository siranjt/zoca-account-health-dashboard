"use client";

import { istDate } from "@/lib/istDate";

// Shared window control for /admin/impact and /admin/activity: the existing
// preset buttons plus a calendar range.
//
// ONE PIECE OF STATE, not two. A separate `days` and `from`/`to` would let the
// buttons and the picker both look active while only one of them reached the
// query — so `preset` is either a number OR the literal "custom", and the dates
// are only sent in the custom case. What the control shows is what the server
// was asked.
//
// Native <input type="date"> on purpose. CLAUDE.md bans a chart library in
// favour of hand-built SVG; the same reasoning applies here — the native input
// is keyboard-accessible, localises itself to the viewer, and costs no bundle.
// Its value is necessarily YYYY-MM-DD even though the app displays dd/mm/yy.

export interface RangeState {
  preset: number | "custom";
  from: string;
  to: string;
}

/** The query string for a range — the single place presets and dates converge. */
export function rangeParams(r: RangeState): Record<string, string> {
  return r.preset === "custom" ? { from: r.from, to: r.to } : { days: String(r.preset) };
}

/** Default state for a page whose preset group starts on `days`. */
export function defaultRange(days: number): RangeState {
  const today = istDate();
  return { preset: days, from: today, to: today };
}

const btn = "px-2.5 py-1 text-xs font-medium";
const input =
  "rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 " +
  "focus:outline-none focus:ring-1 focus:ring-slate-400";

export function DateRangeFilter({
  presets,
  value,
  onChange,
}: {
  presets: number[];
  value: RangeState;
  onChange: (r: RangeState) => void;
}) {
  // No activity exists in the future, and an accidental 2027 range comes back
  // empty — which reads as "nobody used it" rather than "bad input".
  const today = istDate();

  const pick = (patch: Partial<RangeState>) => {
    const next: RangeState = { ...value, ...patch, preset: "custom" };
    // Keep the pair ordered as the user types rather than rejecting it after the
    // round trip: moving `from` past `to` drags `to` along, and vice versa.
    if (next.from > next.to) {
      if (patch.from !== undefined) next.to = next.from;
      else next.from = next.to;
    }
    onChange(next);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex overflow-hidden rounded-md border border-slate-300">
        {presets.map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={value.preset === d}
            onClick={() => onChange({ ...value, preset: d })}
            className={`${btn} ${
              value.preset === d ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-100"
            }`}
          >
            {d}d
          </button>
        ))}
      </div>

      <div className="inline-flex items-center gap-1.5">
        <input
          type="date"
          aria-label="From date"
          value={value.from}
          max={today}
          onChange={(e) => pick({ from: e.target.value })}
          className={`${input} ${value.preset === "custom" ? "border-slate-500" : ""}`}
        />
        <span className="text-xs text-slate-400" aria-hidden>
          →
        </span>
        <input
          type="date"
          aria-label="To date"
          value={value.to}
          min={value.from}
          max={today}
          onChange={(e) => pick({ to: e.target.value })}
          className={`${input} ${value.preset === "custom" ? "border-slate-500" : ""}`}
        />
      </div>
    </div>
  );
}
