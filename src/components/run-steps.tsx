import { Check, Loader2, X } from "lucide-react";
import { STEPS, type StepId, type VideoStatus } from "@/lib/campaign/types";

/** The six pipeline steps with the current one in progress, so a judge can see the agent working. */
export function RunSteps({ status, step, error }: { status: VideoStatus; step: StepId | null; error?: string }) {
  const at = step ? STEPS.findIndex((s) => s.id === step) : -1;
  return (
    <ol className="space-y-2.5">
      {STEPS.map((s, i) => {
        const done = status === "done" || i < at;
        const active = status === "running" && i === at;
        const failed = status === "failed" && i === at;
        return (
          <li key={s.id}>
            <span className="flex items-center gap-3">
              <span
                className={[
                  "grid size-6 shrink-0 place-items-center rounded-full",
                  done ? "bg-pass-soft text-pass" : failed ? "bg-fail-soft text-fail" : active ? "bg-lime text-lime-ink" : "bg-sunken text-ink-3",
                ].join(" ")}
              >
                {done ? (
                  <Check className="size-3.5" strokeWidth={2.5} aria-hidden />
                ) : failed ? (
                  <X className="size-3.5" strokeWidth={2.5} aria-hidden />
                ) : active ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <span className="text-[11px] tabular">{i + 1}</span>
                )}
              </span>
              <span className={done || active || failed ? "text-ink" : "text-ink-3"}>{s.label}</span>
            </span>
            {failed && error && (
              <p className="mt-2 ml-9 max-w-[60ch] rounded-[8px] bg-fail-soft px-3 py-2 text-fail">{error}</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
