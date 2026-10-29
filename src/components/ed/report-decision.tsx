"use client";

// What to do about the verdict. The report judges delivery; paying is the manager's call, so this card is worded and
// drawn as a recommendation: pay, hold and ask for a fix (with the missed terms in plain words and a note to send), or
// review first. Plus Share report: the page URL, which anyone with the link can open.
import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleHelp, Copy, Eye, Hand, Link2, Share, Undo2 } from "lucide-react";
import type { TermResult } from "@/lib/types";
import type { VideoEntry } from "@/lib/campaign/types";
import { ApiError } from "@/components/api-error";
import { Spinner } from "./pending-link";
import type { Verdict } from "@/components/format";
import { useFlash } from "./use-flash";
import { ACTION_TILE } from "./action-style";
import { usd } from "@/lib/campaign/money";

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

/** "Pay", "Hold", "Review": the decision word for a verdict, used where space is short. */
export function decisionWord(verdict: Verdict): string {
  return verdict === "delivered" ? "Pay" : verdict === "short" ? "Hold" : "Review";
}

/** A missed term in a few words, for the phone's verdict line: "Never said “Alani Nu”", "On screen too late". */
export function missWords(t: TermResult, brand: string): string {
  const r = t.term.rule;
  switch (r?.kind) {
    case "mentioned":
      if (r.withinFirstSec)
        return r.minTimes === 1 ? `“${brand}” not said in the first ${s(r.withinFirstSec)}` : `“${brand}” said too few times in the first ${s(r.withinFirstSec)}`;
      return /\b0 times\b/.test(t.detail) ? `Never said “${brand}”` : `Said “${brand}” too few times`;
    case "disclosed":
      return "Sponsorship not disclosed";
    case "min_seconds_total":
      return "Not on screen long enough";
    case "min_seconds_within":
      return `Too little screen time in the first ${s(r.withinFirstSec)}`;
    case "first_seen_before":
      return "On screen too late";
    case "min_continuous":
      return "No shot held long enough";
    case "min_area":
      return "Product too small in frame";
    default:
      return t.term.text;
  }
}

/** The revision request a brand sends a creator who fell short: each fix, what the contract asked and what the check
 *  saw, and a link to the report at the first missed moment. */
export function revisionRequest(creator: string, missed: TermResult[], reportUrl: string): string {
  const at = missed.flatMap((t) => t.evidence).sort((a, b) => a.startSec - b.startSec)[0]?.startSec;
  const link = at === undefined ? reportUrl : `${reportUrl}?t=${Math.floor(at * 10) / 10}`;
  const items = missed.map((t) => `- ${cap(fixWords(t))}\n  Asked: “${t.term.text}”. Seen: ${t.detail.replace(/\.$/, "")}.`).join("\n");
  return `Hi ${creator}, thanks for the video. Before we pay, could you send a new cut that fixes ${
    missed.length === 1 ? "this" : "these"
  }?\n${items}\n\nWhat our check saw, second by second: ${link}\nThanks!`;
}

export function PayOrHold({
  verdict,
  creator,
  terms,
  fee = null,
  flags = [],
  override,
  overrideEndpoint,
}: {
  verdict: Verdict;
  creator: string;
  terms: TermResult[];
  fee?: number | null;
  /** Reasons to watch before deciding (blur, a near miss); see reviewFlags. */
  flags?: string[];
  override?: VideoEntry["override"];
  /** Where a manager's own decision is saved; absent where none can be (the preview). */
  overrideEndpoint?: string;
}) {
  const [copied, flash] = useFlash();
  if (verdict === "pending") return null;
  const missed = terms.filter((t) => t.pass === false);
  const unsure = terms.filter((t) => t.pass === null);
  const amount = fee === null ? "" : ` ${usd(fee)}`;

  const tone = {
    delivered: { chip: "bg-(--pass-soft) text-(--pass)", Icon: Check, title: `Recommendation: pay${amount}` },
    short: {
      chip: "bg-(--short-soft) text-(--short)",
      Icon: Hand,
      title: `Hold${amount}: ask ${creator} to fix ${missed.length === 1 ? "one thing" : `${missed.length} things`}`,
    },
    review: { chip: "bg-(--review-soft) text-(--review)", Icon: CircleHelp, title: `Review before paying${amount}` },
  }[verdict];


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
                onClick={() =>
                  navigator.clipboard.writeText(revisionRequest(creator, missed, location.href.split(/[?#]/)[0])).then(() => flash(true), () => undefined)
                }
                className="ed-press mt-3 inline-flex h-11 cursor-pointer items-center gap-2 rounded-full bg-(--ink) px-4 text-[14px] font-semibold text-white shadow-(--sh-1) active:bg-black/85 [@media(hover:hover)]:hover:bg-black"
              >
                {copied ? <Check className="size-4" strokeWidth={3} aria-hidden /> : <Copy className="size-4" aria-hidden />}
                {copied ? "Revision request copied" : "Copy revision request"}
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
          {flags.length > 0 && (
            <div className="mt-3 rounded-(--r-inner) bg-(--review-soft) px-3.5 py-3 text-(--review)">
              <p className="flex items-center gap-1.5 text-[13.5px] font-semibold">
                <Eye className="size-4" strokeWidth={2.5} aria-hidden /> Worth a look before you decide
              </p>
              <ul className="mt-1.5 space-y-1 text-[13.5px] leading-[1.45]">
                {flags.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          )}
          {overrideEndpoint && <Override endpoint={overrideEndpoint} override={override} recommended={verdict === "delivered" ? "pay" : "hold"} />}
        </div>
      </div>
    </section>
  );
}

/** A manager's own decision with a written reason, shown beside the recommendation and kept with the report. */
function Override({ endpoint, override, recommended }: { endpoint: string; override?: VideoEntry["override"]; recommended: "pay" | "hold" }) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [decision, setDecision] = useState<"pay" | "hold">(recommended === "pay" ? "hold" : "pay");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(method: "POST" | "DELETE") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "POST" ? JSON.stringify({ decision, reason }) : undefined,
      });
      const out = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(out?.error ?? `Could not save (${res.status}).`);
      setOpen(false);
      setReason("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  if (override) {
    return (
      <div className="mt-3 rounded-(--r-inner) bg-(--wash) px-3.5 py-3">
        <p className="text-[14px] text-(--ink)">
          <span className="font-semibold">Your decision: {override.decision === "pay" ? "Pay" : "Hold"}</span>
          <span className="text-(--ink-2)"> · Screen-Time recommended {recommended === "pay" ? "pay" : "hold"}</span>
        </p>
        <p className="mt-1 text-[14px] leading-[1.45] text-(--ink-2)">&ldquo;{override.reason}&rdquo;</p>
        <p className="mt-1 text-[12.5px] text-(--ink-3)">
          {new Date(override.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" })} UTC · the report
          below is unchanged
        </p>
        <button
          type="button"
          onClick={() => void send("DELETE")}
          disabled={busy}
          className="ed-press mt-2 inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[13.5px] font-semibold text-(--ink) ring-1 ring-(--hair-2) active:bg-(--card) disabled:cursor-wait"
        >
          {busy ? <Spinner className="size-3.5" /> : <Undo2 className="size-3.5" strokeWidth={2.5} aria-hidden />}
          Undo my decision
        </button>
        {error && (
          <p role="alert" className="mt-2 text-[13px]">
            <ApiError message={error} />
          </p>
        )}
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ed-press mt-2 -ml-3 inline-flex h-11 cursor-pointer items-center rounded-full px-3 text-[13.5px] font-semibold text-(--ink-2) underline decoration-(--hair-2) underline-offset-4 active:bg-(--wash) [@media(hover:hover)]:hover:text-(--ink)"
      >
        Decide differently
      </button>
    );
  }

  return (
    <form
      className="mt-3 rounded-(--r-inner) bg-(--wash) p-3.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) void send("POST");
      }}
    >
      <fieldset>
        <legend className="text-[14px] font-semibold">Your decision</legend>
        <div className="mt-2 flex gap-2">
          {(["pay", "hold"] as const).map((d) => (
            <label
              key={d}
              className={`ed-press inline-flex h-11 cursor-pointer items-center rounded-full px-4 text-[14px] font-semibold ring-1 has-focus-visible:ring-2 has-focus-visible:ring-(--ink) ${
                decision === d ? "bg-(--ink) text-white ring-(--ink)" : "bg-(--card) text-(--ink) ring-(--hair-2)"
              }`}
            >
              <input type="radio" name={`${id}-d`} value={d} checked={decision === d} onChange={() => setDecision(d)} className="sr-only" />
              {d === "pay" ? "Pay" : "Hold"}
            </label>
          ))}
        </div>
      </fieldset>
      <label htmlFor={`${id}-r`} className="mt-3 block text-[14px] font-semibold">
        Why
      </label>
      <textarea
        id={`${id}-r`}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        required
        minLength={3}
        maxLength={500}
        rows={2}
        placeholder="e.g. The product is on screen, but behind a sticker for most of it"
        className="mt-1.5 block w-full resize-none rounded-(--r-ctl) bg-(--card) px-3 py-2.5 text-[16px] leading-snug ring-1 ring-(--hair-2) outline-none field-sizing-content placeholder:text-(--ink-3) focus:ring-2 focus:ring-(--ink)"
      />
      <p className="mt-1 text-[12.5px] text-(--ink-3)">Kept with the report, beside Screen-Time&rsquo;s own result.</p>
      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={busy || reason.trim().length < 3}
          aria-busy={busy}
          className="ed-press inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-full bg-(--ink) px-4 text-[14px] font-semibold text-white active:bg-black/85 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy && <Spinner className="size-3.5" />}
          Save decision
        </button>
        <button type="button" onClick={() => setOpen(false)} className="ed-press h-11 cursor-pointer rounded-full px-3 text-[14px] font-semibold text-(--ink-2) active:bg-(--card)">
          Cancel
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-[13px]">
          <ApiError message={error} />
        </p>
      )}
    </form>
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
    <button type="button" onClick={() => void share()} className={ACTION_TILE} aria-live="polite">
      {state === "copied" ? <Check className="size-4" strokeWidth={3} aria-hidden /> : state === "failed" ? <Link2 className="size-4" aria-hidden /> : <Share className="size-4" aria-hidden />}
      {state === "copied" ? (
        "Link copied"
      ) : state === "failed" ? (
        "Copy the address bar"
      ) : (
        <>
          <span className="sm:hidden">Share</span>
          <span className="hidden sm:inline">Share report</span>
        </>
      )}
    </button>
  );
}
