// The app's global states (404, error) as one composition: the strip in miniature tells the story, an ed-display
// headline names it, and the actions sit below at thumb height. Server-safe (no hooks); error.tsx passes its own
// client-side retry button in `actions`.
import type { ReactNode } from "react";

export function StateScreen({
  tone,
  code,
  title,
  body,
  actions,
}: {
  /** "empty": a strip with nothing lit (nothing here). "broken": a strip cut by a dashed red gap (something failed). */
  tone: "empty" | "broken";
  code?: string;
  title: string;
  body: ReactNode;
  actions: ReactNode;
}) {
  return (
    <main className="flex flex-1 items-start justify-center px-4 pt-14 pb-20 sm:items-center sm:px-6 sm:py-20">
      <div className="w-full max-w-[520px]">
        <StateStrip tone={tone} />
        {code && <p className="ed-tc mt-8 text-[13px] text-(--ink-3)">{code}</p>}
        <h1 className={`ed-display text-[40px] leading-[1] sm:text-[56px] ${code ? "mt-2" : "mt-8"}`}>{title}</h1>
        <div className="mt-4 max-w-[46ch] text-[16px] leading-[1.6] text-(--ink-2) sm:text-[17px]">{body}</div>
        <div className="mt-8 grid gap-3 sm:flex sm:flex-wrap">{actions}</div>
      </div>
    </main>
  );
}

function StateStrip({ tone }: { tone: "empty" | "broken" }) {
  return (
    <div className="relative h-10 w-full max-w-[320px] overflow-hidden rounded-[10px] bg-(--wash) ring-1 ring-(--hair-2) ring-inset" aria-hidden>
      {tone === "broken" ? (
        <>
          <span className="absolute inset-y-0 left-[6%] w-[30%] bg-(--signal)" />
          <span className="absolute inset-y-[5px] left-[42%] w-[22%] rounded-[4px] border-[1.5px] border-dashed border-(--reject) bg-(--reject-soft)" />
          <span className="absolute inset-y-0 left-[70%] w-[14%] bg-(--signal) opacity-35" />
        </>
      ) : (
        // Hairline ticks only: a timeline with nothing lit.
        <span className="absolute inset-x-3 top-1/2 h-px -translate-y-1/2 border-t-[1.5px] border-dashed border-(--hair-2)" />
      )}
      <span className="absolute -inset-y-1 left-[38%] w-[3px] rounded-full bg-(--ink)" />
    </div>
  );
}

export const stateBtnPrimary =
  "inline-flex h-14 items-center justify-center gap-2 rounded-full bg-(--ink) px-7 text-[16px] font-semibold text-white shadow-(--sh-2) hover:bg-black active:bg-black/80";
export const stateBtnSecondary =
  "inline-flex h-14 items-center justify-center gap-2 rounded-full bg-(--card) px-7 text-[16px] font-semibold shadow-(--sh-1) ring-1 ring-(--hair) hover:ring-(--hair-2) active:bg-(--wash)";
