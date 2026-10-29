"use client";

// What to do about the verdict. The report judges delivery; paying is the manager's call, so this card is worded and
// drawn as a recommendation: pay, hold and ask for a fix (with the missed terms in plain words and a note to send), or
// review first. Plus Share report: the page URL, which anyone with the link can open.
import { useState } from "react";
import { Check, CircleHelp, Copy, Hand, Link2, Share } from "lucide-react";
import type { TermResult } from "@/lib/types";
import type { Verdict } from "@/components/format";
import { useFlash } from "./use-flash";

const n2 = (n: number) => String(Math.round(n * 10) / 10);
const s = (n: number) => `${n2(n)} s`;

/** A missed term as the fix to ask for, in plain words. */
export function fixWords(t: TermResult): string {
  const r = t.term.rule;
  if (!r) return t.term.text;
  switch (r.kind) {
    case "min_seconds_total":
      return `show the product for at least ${s(r.seconds)} in total`;
    case "min_seconds_within":
      return `show the product for ${s(r.seconds)} within the first ${s(r.withinFirstSec)}`;
    case "min_continuous":
      return `hold one continuous shot of the product for ${s(r.seconds)}`;
    case "min_area":
      return `show the product bigger: ${Math.round(r.fraction * 100)}% of the frame for ${s(r.forSeconds)}`;
    case "mentioned":
      return `say the brand name ${r.minTimes === 1 ? "once" : `${r.minTimes} times`}${r.withinFirstSec ? ` in the first ${s(r.withinFirstSec)}` : ""}`;
    case "first_seen_before":
      return `show the product within the first ${s(r.seconds)}`;
    case "disclosed":
      return "disclose the sponsorship, with #ad on screen or by saying it is sponsored";
  }
}

const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

export function PayOrHold({ verdict, creator, terms }: { verdict: Verdict; creator: string; terms: TermResult[] }) {
  const [copied, flash] = useFlash();
  if (verdict === "pending") return null;
  const missed = terms.filter((t) => t.pass === false);
  const unsure = terms.filter((t) => t.pass === null);

  const tone = {
    delivered: { chip: "bg-(--pass-soft) text-(--pass)", Icon: Check, title: "Recommendation: pay" },
    short: { chip: "bg-(--short-soft) text-(--short)", Icon: Hand, title: `Hold: ask ${creator} to fix ${missed.length === 1 ? "one thing" : `${missed.length} things`}` },
    review: { chip: "bg-(--review-soft) text-(--review)", Icon: CircleHelp, title: "Review before paying" },
  }[verdict];

  const note = `Hi ${creator}, thanks for the video. Before we pay, could you ${
    missed.length === 1 ? `${fixWords(missed[0])}?` : `fix these:\n${missed.map((t) => `- ${cap(fixWords(t))}`).join("\n")}`
  }\nThanks!`;

  return (
    <section aria-labelledby="pay-h" className="rounded-(--r-card) bg-(--card) p-4 shadow-(--sh-1) ring-1 ring-(--hair) sm:p-5">
      <div className="flex items-start gap-3">
        <span className={`grid size-10 shrink-0 place-items-center rounded-full ${tone.chip}`} aria-hidden>
          <tone.Icon className="size-[18px]" strokeWidth={2.5} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-semibold text-(--ink-3)">Pay or hold · a recommendation, you decide</p>
          <h2 id="pay-h" className="ed-display mt-0.5 text-[21px] leading-tight sm:text-[23px]">
            {tone.title}
          </h2>
          {verdict === "delivered" && (
            <p className="mt-1.5 max-w-[60ch] text-[14.5px] leading-[1.5] text-(--ink-2)">
              Every contract term was met, each with the second that proves it below. Nothing here moves money; you pay as you normally do.
            </p>
          )}
          {verdict === "short" && (
            <>
              <ul className="mt-2 space-y-1.5 text-[14.5px] leading-[1.45]" aria-label="What to ask for">
                {missed.map((t) => (
                  <li key={t.term.text} className="flex gap-2">
                    <span aria-hidden className="mt-[9px] size-1.5 shrink-0 rounded-full bg-(--ink-3)" />
                    <span className="font-semibold text-(--ink)">{cap(fixWords(t))}</span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(note).then(() => flash(true), () => undefined)}
                className="ed-press mt-3 inline-flex h-11 cursor-pointer items-center gap-2 rounded-full bg-(--ink) px-4 text-[14px] font-semibold text-white shadow-(--sh-1) active:bg-black/85 [@media(hover:hover)]:hover:bg-black"
              >
                {copied ? <Check className="size-4" strokeWidth={3} aria-hidden /> : <Copy className="size-4" aria-hidden />}
                {copied ? "Note copied" : `Copy a note for ${creator}`}
              </button>
            </>
          )}
          {verdict === "review" && (
            <p className="mt-1.5 max-w-[60ch] text-[14.5px] leading-[1.5] text-(--ink-2)">
              {unsure.length
                ? `Screen-Time could not check ${unsure.length === 1 ? `“${unsure[0].term.text}”` : `${unsure.length} terms`} by itself. Watch ${
                    unsure.length === 1 ? "that part" : "those parts"
                  } of the video before you decide.`
                : "No contract terms were set, so there is nothing to check against. Watch the video before you decide."}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

/** Share the report's own URL: the system share sheet where there is one, else copy it. */
export function ShareReport({ title }: { title: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  async function share() {
    const url = location.href.split("#")[0];
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
        return;
      } catch (e) {
        // Cancelled by the user: nothing to do. Any other failure falls through to copying.
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
      setTimeout(() => setState((s) => (s === "copied" ? "idle" : s)), 2000);
    } catch {
      setState("failed");
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <button
        type="button"
        onClick={() => void share()}
        className="ed-press inline-flex h-11 cursor-pointer items-center gap-2 rounded-full bg-(--card) px-4 text-[14px] font-semibold text-(--ink) shadow-(--sh-1) ring-1 ring-(--hair-2) active:bg-(--wash) [@media(hover:hover)]:hover:ring-(--ink-3)"
      >
        {state === "copied" ? <Check className="size-4" strokeWidth={3} aria-hidden /> : state === "failed" ? <Link2 className="size-4" aria-hidden /> : <Share className="size-4" aria-hidden />}
        {state === "copied" ? "Link copied" : "Share report"}
      </button>
      <p className="text-[13px] leading-snug text-(--ink-3)" aria-live="polite">
        {state === "failed" ? "Could not copy. Copy the address from the browser bar instead." : "Anyone with the link can view this report."}
      </p>
    </div>
  );
}
