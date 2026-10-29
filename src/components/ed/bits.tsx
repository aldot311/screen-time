// Small presentational pieces shared by the three comp screens. Server-safe (no hooks).
import { Check, CircleDashed, CircleHelp, X } from "lucide-react";
import type { Verdict } from "@/components/format";
import { VERDICT_LABEL } from "@/components/format";

/** The mark: a lime run on a dark rule, the strip in miniature. Authored SVG, no glyphs. */
export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <rect x="1" y="1" width="22" height="22" rx="7" fill="var(--ink)" />
      <rect x="5" y="10" width="14" height="4" rx="2" fill="rgb(255 255 255 / 0.18)" />
      <rect x="5" y="10" width="8.5" height="4" rx="2" fill="var(--signal)" />
      <rect x="15.5" y="7" width="1.6" height="10" rx="0.8" fill="#fff" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2">
      <Mark />
      <span className="ed-display text-[19px] leading-none tracking-[-0.03em]">Screen-Time</span>
    </span>
  );
}

const VERDICT_TONE: Record<Verdict, string> = {
  delivered: "bg-(--pass-soft) text-(--pass)",
  short: "bg-(--short-soft) text-(--short)",
  review: "bg-(--review-soft) text-(--review)",
  pending: "bg-(--wash) text-(--ink-3)",
};
const VERDICT_ICON = { delivered: Check, short: X, review: CircleHelp, pending: CircleDashed };

export function VerdictPill({ verdict, size = "sm" }: { verdict: Verdict; size?: "sm" | "md" }) {
  const Icon = VERDICT_ICON[verdict];
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-full font-semibold whitespace-nowrap",
        size === "md" ? "h-8 px-3 text-[14px]" : "h-6 px-2.5 text-[12px]",
        VERDICT_TONE[verdict],
      ].join(" ")}
    >
      <Icon className={size === "md" ? "size-4" : "size-3.5"} strokeWidth={2.75} aria-hidden />
      {VERDICT_LABEL[verdict]}
    </span>
  );
}

/** "10.3" with tabular digits but a proportional point, so a live counter does not jitter or gape. */
export function Figure({ value, digits = 1 }: { value: number; digits?: number }) {
  const [whole, frac] = value.toFixed(digits).split(".");
  return (
    <>
      <span className="tabular">{whole}</span>
      {frac !== undefined && (
        <>
          .<span className="tabular">{frac}</span>
        </>
      )}
    </>
  );
}

export function Swatch({ kind }: { kind: "signal" | "voice" | "reject" | "window" }) {
  const cls = {
    signal: "bg-(--signal) ring-1 ring-(--signal-ink)/15",
    voice: "w-[3px]! bg-(--voice)",
    reject: "border-[1.5px] border-dashed border-(--reject) bg-(--reject-soft)",
    window: "border-[1.5px] border-dashed border-(--ink-3)",
  }[kind];
  return <span className={`inline-block h-3 w-3.5 shrink-0 rounded-[3px] ${cls}`} aria-hidden />;
}
