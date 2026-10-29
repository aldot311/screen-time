"use client";

// The creators in a campaign: a segmented filter (count above label) over cards.
// - The filter lives in the URL (?show=short) so Back restores it; it is a real radiogroup (arrow keys, one tab stop),
//   and a tap scrolls the list's top under the header so the change is always visible.
// - Each finished/running/stopped card is ONE link with a cover spinner. A video a creator sent through a request link
//   waits for the brand, so its card is not a link but carries the "Run analysis" action.
import { useRef, type KeyboardEvent } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, ChevronRight, CircleHelp, Inbox, X } from "lucide-react";
import type { Mention, Segment } from "@/lib/types";
import type { Verdict } from "@/components/format";
import { tenths, timecode } from "@/components/format";
import { Figure, VerdictPill } from "./bits";
import { PendingLink, Spinner } from "./pending-link";
import { Strip } from "./strip";
import { CampaignThumb } from "./campaign-ui";
import { CampaignRunButton } from "./campaign-run-button";
import { usd } from "@/lib/campaign/money";

export interface Row {
  id: string;
  campaignId: string;
  href: string;
  /** The creator handle, or the clip title when every video shares one handle (the header says the handle once). */
  title: string;
  /** The clip title as mono metadata; absent when the title already is the clip. */
  meta?: string;
  creator: string;
  thumbUrl?: string;
  verdict: Verdict;
  /** See videoPhase: "waiting" (a creator's link upload) and "uploaded" (a run that never started) wait for the brand;
   *  "starting" is a fresh upload whose run is about to start. */
  status: "uploaded" | "starting" | "waiting" | "running" | "done" | "failed";
  stepLabel?: string;
  error?: string;
  seconds: number | null;
  durationSec: number | null;
  firstSeenSec: number | null;
  passed: number;
  terms: number;
  /** Failed terms in the report's own words ("Mentioned 0 times (needs 1 time)."). */
  misses: { term: string; detail: string }[];
  /** Terms that could not be checked. */
  unsure: string[];
  segments: Segment[];
  mentions: Mention[];
  rejected: Segment[];
  /** The fee for this creator's video, when one is set: shown as what the verdict pays or holds. */
  fee?: number | null;
}

type Filter = "all" | "delivered" | "short" | "review";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "delivered", label: "Delivered" },
  { id: "short", label: "Fell short" },
  { id: "review", label: "Needs review" },
];
const isFilter = (s: string | null): s is Filter => FILTERS.some((f) => f.id === s);

export function CampaignList({ rows }: { rows: Row[] }) {
  const params = useSearchParams();
  const top = useRef<HTMLDivElement>(null);
  const group = useRef<HTMLDivElement>(null);

  const count = (id: Filter) => (id === "all" ? rows.length : rows.filter((r) => r.status === "done" && r.verdict === id).length);
  // Empty segments are noise ("Needs review 0"); All always stays.
  const segments = FILTERS.filter((f) => f.id === "all" || count(f.id) > 0);
  const asked = params.get("show");
  const active: Filter = isFilter(asked) && segments.some((s) => s.id === asked) ? asked : "all";
  const shown = active === "all" ? rows : rows.filter((r) => r.status === "done" && r.verdict === active);

  function choose(id: Filter, focus = false) {
    if (id !== active) {
      const next = new URLSearchParams(params.toString());
      if (id === "all") next.delete("show");
      else next.set("show", id);
      const q = next.toString();
      window.history.pushState(null, "", q ? `?${q}` : location.pathname);
    }
    if (focus) group.current?.querySelector<HTMLButtonElement>(`[data-id="${id}"]`)?.focus();
    // Bring the top of the list under the header, so the result of the tap is on screen.
    requestAnimationFrame(() => {
      const el = top.current;
      if (!el) return;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
    });
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const i = segments.findIndex((s) => s.id === active);
    const to =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? (i + 1) % segments.length
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? (i - 1 + segments.length) % segments.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? segments.length - 1
              : -1;
    if (to < 0) return;
    e.preventDefault();
    choose(segments[to].id, true);
  }

  return (
    <div ref={top} className="scroll-mt-[calc(env(safe-area-inset-top)+64px)]">
      {/* Under three videos the cards are the whole story; a filter would only add chrome. From three up it sticks under
          the header so it stays in reach while scrolling a long list. */}
      {rows.length >= 3 && segments.length > 1 && (
        <div className="sticky top-[calc(env(safe-area-inset-top)+56px)] z-20 -mx-4 bg-(--paper) px-4 pt-2 pb-2 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
        <div
          ref={group}
          role="radiogroup"
          aria-label="Filter creators by verdict"
          onKeyDown={onKey}
          className="flex gap-1 rounded-[20px] bg-(--wash) p-1 shadow-[inset_0_0_0_1px_var(--hair)] sm:inline-flex"
        >
          {segments.map((f) => {
            const on = active === f.id;
            return (
              <button
                key={f.id}
                data-id={f.id}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                onClick={() => choose(f.id)}
                className={[
                  "ed-press flex h-[60px] min-w-0 flex-1 cursor-pointer flex-col items-center justify-center rounded-[16px] px-1 sm:min-w-[108px] sm:flex-none sm:px-4",
                  on ? "bg-(--card) text-(--ink) shadow-(--sh-1)" : "text-(--ink-2) active:bg-(--hair) [@media(hover:hover)]:hover:text-(--ink)",
                ].join(" ")}
              >
                <span className={`ed-num text-[21px] leading-none ${on ? "" : "opacity-80"}`}>{count(f.id)}</span>
                <span className="mt-1 max-w-full truncate text-[12.5px] font-semibold">{f.label}</span>
              </button>
            );
          })}
        </div>
        </div>
      )}

      <p className="sr-only" aria-live="polite">
        {active === "all" ? `Showing all ${rows.length}` : `Showing ${shown.length} ${FILTERS.find((f) => f.id === active)?.label}`}
      </p>
      <ul key={active} className="mt-2 grid gap-3 md:grid-cols-2">
        {shown.map((r, i) => (
          <li key={r.id} id={`v-${r.id}`} className="scroll-mt-[calc(env(safe-area-inset-top)+72px)]">{r.status === "waiting" || r.status === "uploaded" ? <WaitingCard r={r} /> : <CreatorCard r={r} eager={i < 12} />}</li>
        ))}
      </ul>
    </div>
  );
}

const CARD =
  "relative grid h-full grid-cols-[84px_1fr] gap-3.5 rounded-(--r-card) bg-(--card) p-2.5 pr-3 shadow-(--sh-1) ring-1 ring-(--hair) sm:grid-cols-[92px_1fr] sm:gap-4";

function Heading({ r, chevron = true }: { r: Row; chevron?: boolean }) {
  return (
    <span className="flex items-start justify-between gap-2">
      <span className="min-w-0">
        <span className="block truncate text-[16px] leading-tight font-semibold">{r.title}</span>
        {r.meta && <span className="ed-tc mt-1 block truncate text-[12px] text-(--ink-3)">{r.meta}</span>}
      </span>
      {chevron && <ChevronRight className="mt-0.5 size-5 shrink-0 text-(--ink-3)" strokeWidth={2.25} aria-hidden />}
    </span>
  );
}

function CreatorCard({ r, eager }: { r: Row; eager: boolean }) {
  return (
    <PendingLink
      href={r.href}
      hint="cover"
      aria-label={[r.title, r.meta].filter(Boolean).join(", ")}
      className={`ed-press-soft ${CARD} active:bg-(--wash) [@media(hover:hover)]:hover:ring-(--hair-2)`}
    >
      <CampaignThumb src={r.thumbUrl} eager={eager} className="rounded-[14px]" />
      <span className="flex min-w-0 flex-col py-1">
        <Heading r={r} />

        {r.status === "done" && (
          <>
            <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
              <VerdictPill verdict={r.verdict} />
              {r.fee != null && r.verdict !== "pending" && (
                <span className="text-[12.5px] font-semibold whitespace-nowrap text-(--ink) tabular">
                  {r.verdict === "delivered" ? "Pay" : r.verdict === "short" ? "Hold" : "Review"} {usd(r.fee)}
                </span>
              )}
              {r.verdict === "delivered" && r.terms > 0 && (
                <span className="text-[12.5px] font-medium whitespace-nowrap text-(--ink-2) tabular">
                  All {r.terms} terms met
                </span>
              )}
            </span>
            {r.misses.length > 0 && (
              <span className="mt-2 block space-y-1">
                {r.misses.slice(0, 2).map((m) => (
                  <span key={m.term} className="flex gap-1.5 text-[12.5px] leading-snug text-(--ink)">
                    <X className="mt-[3px] size-3 shrink-0 text-(--short)" strokeWidth={3.25} aria-hidden />
                    <span className="line-clamp-2">{m.detail.replace(/\.$/, "")}</span>
                  </span>
                ))}
                {r.misses.length > 2 && <span className="block pl-[18px] text-[12px] text-(--ink-3)">and {r.misses.length - 2} more</span>}
              </span>
            )}
            {r.misses.length === 0 && r.unsure.length > 0 && (
              <span className="mt-2 flex gap-1.5 text-[12.5px] leading-snug text-(--ink-2)">
                <CircleHelp className="mt-[2px] size-3.5 shrink-0 text-(--review)" strokeWidth={2.5} aria-hidden />
                <span className="line-clamp-2">Could not check: {r.unsure[0]}</span>
              </span>
            )}
            <span className="mt-auto pt-3">
              <span className="flex items-baseline gap-1.5">
                <span className="ed-num text-[28px] leading-none">{r.seconds === null ? "–" : <Figure value={Math.floor(r.seconds * 10 + 1e-6) / 10} />}</span>
                {r.seconds !== null && r.durationSec !== null && (
                  <span className="text-[13px] whitespace-nowrap text-(--ink-2)">
                    s on screen of <span className="tabular">{tenths(r.durationSec)}</span>
                  </span>
                )}
              </span>
              <span className="mt-2 block">
                {r.durationSec ? (
                  <Strip durationSec={r.durationSec} segments={r.segments} mentions={r.mentions} rejected={r.rejected} size="mini" />
                ) : (
                  <span className="block h-2 rounded-full bg-(--wash)" />
                )}
              </span>
              <span className="mt-1.5 block text-[12px] text-(--ink-3)">
                {r.firstSeenSec === null ? (
                  "Never on screen"
                ) : (
                  <>
                    First seen <span className="ed-tc">{timecode(r.firstSeenSec)}</span>
                  </>
                )}
              </span>
            </span>
          </>
        )}

        {(r.status === "running" || r.status === "starting") && (
          <span className="mt-auto pt-3">
            <span className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-full bg-(--wash) px-2.5 text-[12.5px] font-semibold text-(--ink-2)">
              <Spinner className="size-3.5 shrink-0" />
              <span className="truncate">{r.status === "running" ? (r.stepLabel ?? "Starting") : "Starting"}</span>
            </span>
            <span className="mt-2 block text-[12.5px] text-(--ink-3)">Checking now. This card updates by itself.</span>
          </span>
        )}

        {r.status === "failed" && (
          <span className="mt-auto pt-3">
            <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-(--short-soft) px-2.5 text-[12.5px] font-semibold text-(--short)">
              <AlertTriangle className="size-3.5" strokeWidth={2.5} aria-hidden />
              Stopped
            </span>
            {r.error && <span className="mt-2 line-clamp-3 block text-[12.5px] leading-snug text-(--ink-2)">{r.error}</span>}
          </span>
        )}
      </span>
    </PendingLink>
  );
}

// A video waiting for the brand, with one clear action and no link (nothing to open yet): a creator's submission, or
// the brand's own upload whose run never started.
function WaitingCard({ r }: { r: Row }) {
  const sent = r.status === "waiting";
  return (
    <div className={CARD}>
      <CampaignThumb src={r.thumbUrl} className="rounded-[14px]" />
      <div className="flex min-w-0 flex-col py-1">
        <Heading r={r} chevron={false} />
        <p className="mt-2 inline-flex h-7 w-fit max-w-full items-center gap-1.5 rounded-full bg-(--wash) px-2.5 text-[12.5px] font-semibold text-(--ink-2)">
          <Inbox className="size-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
          <span className="truncate">{sent ? `Sent by ${r.creator} · waiting for you` : "Uploaded · not started"}</span>
        </p>
        <p className="mt-2 text-[12.5px] leading-snug text-(--ink-3)">
          {sent ? "The creator agreed to the check. Nothing runs until you start it." : "The analysis did not start. Start it when you are ready."}
        </p>
        <div className="mt-auto pt-3">
          <CampaignRunButton campaignId={r.campaignId} videoId={r.id} />
        </div>
      </div>
    </div>
  );
}
