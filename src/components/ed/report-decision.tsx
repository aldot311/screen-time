"use client";

// What to do about the verdict. The report judges delivery; paying is the manager's call, so this card is worded and
// drawn as a recommendation: pay, hold and ask for a fix (with the missed terms in plain words and a note to send), or
// review first. A take a re-cut replaced says so instead, and points to the re-cut. Plus Share report: the page URL,
// which anyone with the link can open.
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleHelp, Copy, Eye, Hand, Link2, Redo2, Share, Undo2 } from "lucide-react";
import type { TermResult } from "@/lib/types";
import type { VideoEntry } from "@/lib/campaign/types";
import { ApiError } from "@/components/api-error";
import { PendingLink, Spinner } from "./pending-link";
import type { Verdict } from "@/components/format";
import { useFlash } from "./use-flash";
import { ACTION_TILE } from "./action-style";
import { decisionOf, usd, type Decision } from "@/lib/campaign/money";

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

const VERDICT_TEXT: Record<Verdict, string> = { delivered: "text-(--pass)", short: "text-(--short)", review: "text-(--review)", pending: "text-(--ink-2)" };

/** The contract check in a line: "Fell short · 1 of 3 terms missed". */
function contractLine(verdict: Verdict, terms: TermResult[]): string {
  const n = terms.length;
  const missed = terms.filter((t) => t.pass === false).length;
  const unsure = terms.filter((t) => t.pass === null).length;
  if (verdict === "delivered") return n ? `Delivered · ${n === 1 ? "the term" : `all ${n} terms`} met` : "Delivered";
  if (verdict === "short") return `Fell short · ${missed} of ${n} ${n === 1 ? "term" : "terms"} missed`;
  return n ? `Needs review · ${unsure} of ${n} ${n === 1 ? "term" : "terms"} not checkable` : "Needs review · no terms set";
}

function Step({ label, icon, warn = false, children }: { label: string; icon?: React.ReactNode; warn?: boolean; children: React.ReactNode }) {
  return (
    <div className={`grid gap-0.5 py-2.5 sm:grid-cols-[132px_1fr] sm:gap-3 ${warn ? "text-(--review)" : ""}`}>
      <dt className={`flex items-center gap-1.5 text-[12.5px] font-semibold ${warn ? "" : "text-(--ink-3)"}`}>
        {icon}
        {label}
      </dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

export function PayOrHold({
  verdict,
  creator,
  terms,
  fee = null,
  flags = [],
  override,
  overrideEndpoint,
  agentCall,
  replacedBy,
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
  /** The follow-up agent's pay/hold call, once it has made one. */
  agentCall?: { decision: "pay" | "hold" | "review"; reason: string };
  /** Set when a newer take from this creator replaced this one: that take decides pay or hold, so this one pays or holds
   *  nothing. A call saved here before the re-cut arrived can still be undone. */
  replacedBy?: { href: string };
}) {
  const [copied, flash] = useFlash();
  if (verdict === "pending") return null;
  const missed = terms.filter((t) => t.pass === false);
  const unsure = terms.filter((t) => t.pass === null);
  const amount = fee === null ? "" : ` ${usd(fee)}`;
  const recommended = decisionOf(verdict) ?? "review";

  const tone = {
    delivered: { chip: "bg-(--pass-soft) text-(--pass)", Icon: Check, title: flags.length ? `Pay${amount}, after a look` : `Recommendation: pay${amount}` },
    short: {
      chip: "bg-(--short-soft) text-(--short)",
      Icon: Hand,
      title: `Hold${amount}: ask ${creator} to fix ${missed.length === 1 ? "one thing" : `${missed.length} things`}`,
    },
    review: { chip: "bg-(--review-soft) text-(--review)", Icon: CircleHelp, title: `Review before paying${amount}` },
  }[verdict];
  const chip = replacedBy ? "bg-(--wash) text-(--ink-2)" : tone.chip;
  const Icon = replacedBy ? Redo2 : tone.Icon;
  // Paying anyway after a miss: asking for a fix is still possible, but no longer the next step.
  const paidAnyway = override?.decision === "pay";

  return (
    <section aria-labelledby="pay-h" className="rounded-(--r-card) bg-(--card) p-4 shadow-(--sh-1) ring-1 ring-(--hair) sm:p-5">
      <div className="flex items-start gap-3">
        <span className={`grid size-10 shrink-0 place-items-center rounded-full ${chip}`} aria-hidden>
          <Icon className="size-[18px]" strokeWidth={2.5} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-semibold text-(--ink-3)">
            {replacedBy ? "Pay or hold" : override ? "Your decision" : "Pay or hold · a recommendation, you decide"}
          </p>
          <h2 id="pay-h" className="ed-display mt-0.5 scroll-mt-28 text-[21px] leading-tight sm:text-[23px]">
            {replacedBy ? `Replaced by ${creator}’s re-cut` : override ? `${override.decision === "pay" ? "Pay" : "Hold"}${amount}` : tone.title}
          </h2>
          {/* Under every recommendation, whatever the verdict or the call: the app never moves money. */}
          <p className="mt-1 text-[13.5px] leading-snug text-(--ink-3)">Nothing here moves money; you pay as you normally do.</p>
          {replacedBy ? (
            <p className="mt-1.5 max-w-[60ch] text-[14.5px] leading-[1.5] text-(--ink-2)">
              The re-cut decides pay or hold, so this take pays or holds nothing.{" "}
              <PendingLink href={replacedBy.href} className="-my-2 inline-flex min-h-11 items-center font-semibold text-(--ink) underline decoration-(--hair-2) underline-offset-4">
                Decide on the re-cut
              </PendingLink>
            </p>
          ) : (
            <>
              {verdict === "delivered" && (
                <p className="mt-1.5 max-w-[60ch] text-[14.5px] leading-[1.5] text-(--ink-2)">Every contract term was met, each with the second that proves it below.</p>
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
                    className={`ed-press mt-3 inline-flex h-11 cursor-pointer items-center gap-2 rounded-full px-4 text-[14px] font-semibold ${
                      paidAnyway
                        ? "text-(--ink) ring-1 ring-(--hair-2) active:bg-(--wash) [@media(hover:hover)]:hover:ring-(--ink-3)"
                        : "bg-(--ink) text-white shadow-(--sh-1) active:bg-black/85 [@media(hover:hover)]:hover:bg-black"
                    }`}
                  >
                    {copied ? <Check className="size-4" strokeWidth={3} aria-hidden /> : <Copy className="size-4" aria-hidden />}
                    {copied ? "Revision request copied" : paidAnyway ? "Still ask for a fix" : "Copy revision request"}
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
            </>
          )}
          {/* How the decision was reached, always in this order: what the check found, what to look at, Screen-Time's
              recommendation (a row of its own once the manager's call or a re-cut has replaced it as the headline), what
              the agent said, and the manager's own call, which is the one that counts. */}
          <dl className="mt-4 divide-y divide-(--hair) rounded-(--r-inner) bg-(--wash)/70 px-3.5 text-[13.5px] leading-[1.45] ring-1 ring-(--hair)" aria-label="How the decision was reached">
            <Step label="Contract check">
              <span className={`font-semibold ${VERDICT_TEXT[verdict]}`}>{contractLine(verdict, terms)}</span>
            </Step>
            {flags.length > 0 && !replacedBy && (
              <Step label="Worth a look" icon={<Eye className="size-3.5" strokeWidth={2.5} aria-hidden />} warn>
                <ul className="space-y-0.5">
                  {flags.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </Step>
            )}
            {(override || replacedBy) && (
              <Step label="Recommendation">
                <span className="text-(--ink-2)">{replacedBy ? `${decisionWord(verdict)}${amount} on this take, before the re-cut` : tone.title}</span>
              </Step>
            )}
            {agentCall && (
              <Step label="Follow-up agent">
                <span className="font-semibold text-(--ink)">{cap(agentCall.decision)}</span>
                {agentCall.reason && <span className="text-(--ink-2)"> · {agentCall.reason}</span>}
              </Step>
            )}
            <Step label="Your call">
              {override ? (
                <span className="font-semibold text-(--ink)">
                  {override.decision === "pay" ? "Pay" : "Hold"}
                  {amount} <span className="font-normal text-(--ink-2)">· &ldquo;{override.reason}&rdquo;</span>
                  {replacedBy && <span className="font-normal text-(--ink-3)"> · not counted: the re-cut decides</span>}
                </span>
              ) : (
                <span className="text-(--ink-3)">
                  {replacedBy ? "Made on the re-cut" : overrideEndpoint ? "Not made yet · the recommendation above stands" : "Made outside Screen-Time"}
                </span>
              )}
            </Step>
          </dl>
          {/* A replaced take takes no new call (the server refuses one), but a call saved before the re-cut can be undone. */}
          {overrideEndpoint && (!replacedBy || override) && <Override endpoint={overrideEndpoint} override={override} recommended={recommended} fee={fee} />}
        </div>
      </div>
    </section>
  );
}

/** The override form in words: whether Save is allowed (a decision picked and a reason written), and the before → after
 *  line shown once a decision is picked, so nothing is saved without seeing what changes. Picking the recommendation
 *  itself is allowed: it signs it off as the manager's own call. */
export function overrideDraft(
  recommended: Decision,
  decision: "pay" | "hold" | null,
  reason: string,
  fee: number | null,
): { canSave: boolean; line: string | null } {
  const words = (d: Decision) => (d === "review" ? "Review" : `${d === "pay" ? "Pay" : "Hold"}${fee === null ? "" : ` ${usd(fee)}`}`);
  const length = reason.trim().length;
  const canSave = decision !== null && length >= 3 && length <= 500;
  if (!decision) return { canSave, line: null };
  return {
    canSave,
    line: decision === recommended ? `You sign off on the recommendation: ${words(decision)}` : `Recommendation: ${words(recommended)} → Your decision: ${words(decision)}`,
  };
}

/** A manager's own decision with a written reason, shown beside the recommendation and kept with the report. Nothing
 *  changes on screen until the server has saved it. */
function Override({ endpoint, override, recommended, fee }: { endpoint: string; override?: VideoEntry["override"]; recommended: Decision; fee: number | null }) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  // Nothing is picked when the form opens: the manager chooses pay or hold on purpose.
  const [decision, setDecision] = useState<"pay" | "hold" | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const first = useRef<HTMLInputElement>(null);
  const refocus = useRef(false);
  const pending = busy || refreshing;
  const draft = overrideDraft(recommended, decision, reason, fee);

  // Focus moves into the form when it opens, and back to the button that opened it when it closes.
  useEffect(() => {
    if (open) first.current?.focus();
    else if (refocus.current) trigger.current?.focus();
    refocus.current = false;
  }, [open]);

  function reset() {
    setOpen(false);
    setDecision(null);
    setReason("");
    setError(null);
  }

  function cancel() {
    if (pending) return;
    refocus.current = true;
    reset();
  }

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
      // The saved call shows only once the page has it back from the server; until then the form stays as it was.
      startRefresh(() => {
        router.refresh();
        reset();
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  if (override) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-[12.5px] text-(--ink-3)">
          Decided{" "}
          {new Date(override.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" })} UTC · the report
          below is unchanged
        </p>
        <button
          type="button"
          onClick={() => void send("DELETE")}
          disabled={pending}
          aria-busy={pending}
          className="ed-press inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[13.5px] font-semibold text-(--ink) ring-1 ring-(--hair-2) active:bg-(--wash) disabled:cursor-wait"
        >
          {pending ? <Spinner className="size-3.5" /> : <Undo2 className="size-3.5" strokeWidth={2.5} aria-hidden />}
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
        ref={trigger}
        type="button"
        onClick={() => setOpen(true)}
        className="ed-press mt-3 ml-0 inline-flex h-11 cursor-pointer items-center rounded-full px-4 text-[14px] font-semibold text-(--ink) ring-1 ring-(--hair-2) active:bg-(--wash) sm:ml-2 [@media(hover:hover)]:hover:ring-(--ink-3)"
      >
        {recommended === "review" ? "Make your call" : "Decide differently"}
      </button>
    );
  }

  return (
    <form
      className="mt-3 rounded-(--r-inner) bg-(--wash) p-3.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!pending && draft.canSave) void send("POST");
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          cancel();
        }
      }}
    >
      <fieldset disabled={pending}>
        <legend className="text-[14px] font-semibold">Your decision</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {(["pay", "hold"] as const).map((d, i) => (
            <label
              key={d}
              className={`ed-press inline-flex h-11 cursor-pointer items-center rounded-full px-4 text-[14px] font-semibold ring-1 has-focus-visible:ring-2 has-focus-visible:ring-(--ink) ${
                decision === d ? "bg-(--ink) text-white ring-(--ink)" : "bg-(--card) text-(--ink) ring-(--hair-2)"
              }`}
            >
              <input
                ref={i === 0 ? first : undefined}
                type="radio"
                name={`${id}-d`}
                value={d}
                checked={decision === d}
                onChange={() => setDecision(d)}
                className="sr-only"
              />
              {d === "pay" ? "Pay" : "Hold"}
              {d === recommended && <span className="font-medium opacity-70">&nbsp;· recommended</span>}
            </label>
          ))}
        </div>
      </fieldset>
      <p aria-live="polite" className={`mt-2.5 text-[14px] leading-snug tabular ${draft.line ? "font-semibold text-(--ink)" : "text-(--ink-3)"}`}>
        {draft.line ?? "Pick pay or hold. Nothing is selected for you."}
      </p>
      <label htmlFor={`${id}-r`} className="mt-3 block text-[14px] font-semibold">
        Why
      </label>
      <textarea
        id={`${id}-r`}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        disabled={pending}
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
          disabled={pending || !draft.canSave}
          aria-busy={pending}
          className="ed-press inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-full bg-(--ink) px-4 text-[14px] font-semibold text-white active:bg-black/85 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending && <Spinner className="size-3.5" />}
          Save decision
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={pending}
          className="ed-press h-11 cursor-pointer rounded-full px-3 text-[14px] font-semibold text-(--ink-2) active:bg-(--card) disabled:cursor-wait"
        >
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
