import { Check, CircleDashed, CircleHelp, X } from "lucide-react";
import { VERDICT_LABEL, type Verdict } from "./format";

const STYLE: Record<Verdict, string> = {
  delivered: "bg-pass-soft text-pass",
  short: "bg-fail-soft text-fail",
  review: "bg-unsure-soft text-unsure",
  pending: "bg-sunken text-ink-3",
};

const ICON = { delivered: Check, short: X, review: CircleHelp, pending: CircleDashed };

export function VerdictBadge({ verdict, size = "sm" }: { verdict: Verdict; size?: "sm" | "lg" }) {
  const Icon = ICON[verdict];
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap",
        size === "lg" ? "px-3 py-1 text-[15px]" : "px-2 py-0.5 text-[12px]",
        STYLE[verdict],
      ].join(" ")}
    >
      <Icon className={size === "lg" ? "size-4" : "size-3.5"} strokeWidth={2.5} aria-hidden />
      {VERDICT_LABEL[verdict]}
    </span>
  );
}
