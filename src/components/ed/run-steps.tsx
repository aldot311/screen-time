// The six pipeline steps in the Editorial look, so a judge watches the agent work: done steps tick, the active one
// spins and breathes, a failed one says why in a manager's words. Server-safe.
import { Check, X } from "lucide-react";
import { STEPS, type StepId, type VideoStatus } from "@/lib/campaign/types";
import { friendlyError } from "@/components/format";
import { Spinner } from "./pending-link";

export function RunStepsEd({ status, step, error }: { status: VideoStatus; step: StepId | null; error?: string }) {
  const at = step ? STEPS.findIndex((s) => s.id === step) : status === "running" ? 0 : -1;
  return (
    <ol className="relative space-y-1">
      {STEPS.map((s, i) => {
        const done = status === "done" || i < at;
        const active = status === "running" && i === Math.max(at, 0);
        const failed = status === "failed" && i === at;
        return (
          <li
            key={s.id}
            aria-current={active ? "step" : undefined}
            className={[
              "relative rounded-(--r-inner) px-3 py-2.5 transition-colors duration-200",
              active ? "bg-(--card) shadow-(--sh-2) ring-1 ring-(--hair)" : "",
            ].join(" ")}
          >
            <span className="flex min-h-7 items-center gap-3">
              <span
                className={[
                  "relative grid size-7 shrink-0 place-items-center rounded-full",
                  done
                    ? "bg-(--pass-soft) text-(--pass)"
                    : failed
                      ? "bg-(--short) text-white"
                      : active
                        ? "bg-(--ink) text-white"
                        : "bg-(--wash) text-(--ink-3)",
                ].join(" ")}
              >
                {done ? (
                  <Check className="size-4" strokeWidth={2.75} aria-hidden />
                ) : failed ? (
                  <X className="size-4" strokeWidth={2.75} aria-hidden />
                ) : active ? (
                  <>
                    <span className="absolute inset-0 animate-ping rounded-full bg-(--ink)/25 motion-reduce:hidden" aria-hidden />
                    <Spinner className="size-4" />
                  </>
                ) : (
                  <span className="text-[12px] font-semibold tabular">{i + 1}</span>
                )}
              </span>
              <span className={["text-[15.5px]", done || active || failed ? "font-semibold text-(--ink)" : "text-(--ink-3)"].join(" ")}>
                {s.label}
              </span>
              {active && <span className="ml-auto text-[13px] font-medium text-(--ink-2)">Working…</span>}
              {done && <span className="sr-only">done</span>}
            </span>
            {failed && error && (
              <p className="mt-2.5 ml-10 max-w-[60ch] rounded-(--r-ctl) bg-(--short-soft) px-3.5 py-2.5 text-[14.5px] leading-[1.5] text-(--short)">
                {friendlyError(error)}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
