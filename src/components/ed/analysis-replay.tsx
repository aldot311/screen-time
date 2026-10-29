"use client";

// "Replay analysis": the run page's live view, replayed from a finished report for anyone who did not watch the run.
// The six steps play out one by one with what each actually found (nothing is re-run or re-billed). On a phone it is a
// full-height sheet; from sm up a centered panel. With reduced motion every step shows at once.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { RotateCcw, ScanSearch, X } from "lucide-react";
import { liveFromReport, liveUpTo } from "@/lib/live";
import { STEPS } from "@/lib/campaign/types";
import type { VideoReport } from "@/lib/types";
import { RunStepsEd } from "./run-steps";

const STEP_MS = 1600;
const REDUCED = "(prefers-reduced-motion: reduce)";
const subscribe = (cb: () => void) => {
  const mq = window.matchMedia(REDUCED);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

export function AnalysisReplay({ report, videoUrl, brand }: { report: VideoReport; videoUrl: string; brand: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  // The replay's clock: started on open (and on "Again"), ticked while open; the step shown follows from the time.
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(0);
  const reduced = useSyncExternalStore(subscribe, () => window.matchMedia(REDUCED).matches, () => false);
  const live = useMemo(() => liveFromReport(report), [report]);
  const last = STEPS.length - 1;
  const start = () => {
    const t = Date.now();
    setStartedAt(t);
    setNow(t);
  };

  useEffect(() => {
    if (!open || reduced) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [open, reduced]);

  const at = reduced ? last + 1 : Math.min(last + 1, Math.max(0, Math.floor((now - startedAt) / STEP_MS)));
  const finished = at > last;
  const shown = liveUpTo(live, Math.min(at, last));

  return (
    <>
      <button
        type="button"
        onClick={() => {
          start();
          setOpen(true);
          dialog.current?.showModal();
        }}
        className="ed-press inline-flex h-11 cursor-pointer items-center gap-2 rounded-full bg-(--card) px-4 text-[14px] font-semibold text-(--ink) shadow-(--sh-1) ring-1 ring-(--hair-2) active:bg-(--wash) [@media(hover:hover)]:hover:ring-(--ink-3)"
      >
        <ScanSearch className="size-4" aria-hidden />
        Replay analysis
      </button>
      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        aria-labelledby="replay-h"
        className="m-0 mt-auto h-[92svh] max-h-none w-full max-w-none rounded-t-[24px] bg-(--paper) p-0 text-(--ink) shadow-(--sh-2) backdrop:bg-[rgb(20_19_15/0.45)] sm:m-auto sm:h-auto sm:max-h-[88svh] sm:max-w-[640px] sm:rounded-[24px]"
      >
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-(--hair) bg-(--paper)/95 px-4 py-3 backdrop-blur sm:px-6">
          <div className="min-w-0 flex-1">
            <h2 id="replay-h" className="ed-display text-[20px] leading-tight">
              How this report was made
            </h2>
            <p className="text-[12.5px] text-(--ink-3)">A replay of the real run: nothing is analyzed or billed again.</p>
          </div>
          {finished && !reduced && (
            <button
              type="button"
              onClick={start}
              className="ed-press inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[13.5px] font-semibold text-(--ink) ring-1 ring-(--hair-2) active:bg-(--wash)"
            >
              <RotateCcw className="size-3.5" strokeWidth={2.5} aria-hidden />
              Again
            </button>
          )}
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            aria-label="Close the replay"
            className="ed-press grid size-11 cursor-pointer place-items-center rounded-full text-(--ink-2) active:bg-(--wash) [@media(hover:hover)]:hover:bg-(--wash)"
          >
            <X className="size-5" strokeWidth={2.25} aria-hidden />
          </button>
        </div>
        <div className="p-3 sm:p-5" aria-live="polite">
          {open && (
            <RunStepsEd
              status={finished ? "done" : "running"}
              step={finished ? null : STEPS[Math.max(0, at)].id}
              live={shown}
              videoUrl={videoUrl}
              brand={brand}
            />
          )}
        </div>
      </dialog>
    </>
  );
}
