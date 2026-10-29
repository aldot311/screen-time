"use client";

// The creators in a campaign: a segmented filter (count above label) over cards. Each card is ONE link that sinks on
// press and shows a spinner over itself from the tap until the report commits. Running rows show the live pipeline
// step; stopped rows show the reason in a manager's words.
import { useState } from "react";
import { AlertTriangle, ChevronRight } from "lucide-react";
import type { Mention, Segment } from "@/lib/types";
import type { Verdict } from "@/components/format";
import { timecode } from "@/components/format";
import { Figure, VerdictPill } from "./bits";
import { PendingLink, Spinner } from "./pending-link";
import { Strip } from "./strip";
import { CampaignThumb } from "./campaign-ui";

export interface Row {
  id: string;
  href: string;
  /** What leads the card: the clip title when creators share a handle, otherwise the handle. */
  primary: string;
  secondary: string;
  thumbUrl?: string;
  verdict: Verdict;
  status: "uploaded" | "running" | "done" | "failed";
  /** Live pipeline step, for running rows. */
  stepLabel?: string;
  /** Friendly error, for stopped rows. */
  error?: string;
  seconds: number | null;
  durationSec: number | null;
  firstSeenSec: number | null;
  passed: number;
  terms: number;
  segments: Segment[];
  mentions: Mention[];
  rejected: Segment[];
}

type Filter = "all" | "delivered" | "short" | "review";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "delivered", label: "Delivered" },
  { id: "short", label: "Fell short" },
  { id: "review", label: "Needs review" },
];

export function CampaignList({ rows }: { rows: Row[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const count = (id: Filter) => (id === "all" ? rows.length : rows.filter((r) => r.status === "done" && r.verdict === id).length);
  // Empty segments are noise ("Needs review 0"); All always stays.
  const segments = FILTERS.filter((f) => f.id === "all" || count(f.id) > 0);
  const active = segments.some((s) => s.id === filter) ? filter : "all";
  const shown = active === "all" ? rows : rows.filter((r) => r.status === "done" && r.verdict === active);

  return (
    <div>
      {segments.length > 1 && (
        <div
          role="radiogroup"
          aria-label="Filter creators by verdict"
          className="flex gap-1 rounded-[20px] bg-(--wash) p-1 shadow-[inset_0_0_0_1px_var(--hair)] sm:inline-flex"
        >
          {segments.map((f) => {
            const on = active === f.id;
            return (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setFilter(f.id)}
                className={[
                  "ed-press flex h-[60px] min-w-0 flex-1 cursor-pointer flex-col items-center justify-center rounded-[16px] px-1 sm:min-w-[108px] sm:flex-none sm:px-4",
                  on
                    ? "bg-(--card) text-(--ink) shadow-(--sh-1)"
                    : "text-(--ink-2) active:bg-(--hair) [@media(hover:hover)]:hover:text-(--ink)",
                ].join(" ")}
              >
                <span className={`ed-num text-[21px] leading-none ${on ? "" : "opacity-80"}`}>{count(f.id)}</span>
                <span className="mt-1 max-w-full truncate text-[12.5px] font-semibold">{f.label}</span>
              </button>
            );
          })}
        </div>
      )}

      <ul className="mt-4 grid gap-3 md:grid-cols-2" aria-live="polite">
        {shown.map((r, i) => (
          <li key={r.id}>
            <CreatorCard r={r} eager={i < 4} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function CreatorCard({ r, eager }: { r: Row; eager: boolean }) {
  const label = `${r.primary}, ${r.secondary}`;
  return (
    <PendingLink
      href={r.href}
      hint="cover"
      aria-label={label}
      className="ed-press-soft relative grid h-full grid-cols-[84px_1fr] gap-3.5 rounded-(--r-card) bg-(--card) p-2.5 pr-3 shadow-(--sh-1) ring-1 ring-(--hair) active:bg-(--wash) [@media(hover:hover)]:hover:ring-(--hair-2) sm:grid-cols-[92px_1fr] sm:gap-4"
    >
      <CampaignThumb src={r.thumbUrl} eager={eager} className="rounded-[14px]" />
      <span className="flex min-w-0 flex-col py-1">
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="block truncate text-[16px] leading-tight font-semibold">{r.primary}</span>
            <span className="mt-0.5 block truncate text-[13px] text-(--ink-3)">{r.secondary}</span>
          </span>
          <ChevronRight className="mt-0.5 size-5 shrink-0 text-(--ink-3)" strokeWidth={2.25} aria-hidden />
        </span>

        {r.status === "done" && (
          <>
            <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
              <VerdictPill verdict={r.verdict} />
              {r.terms > 0 && (
                <span className="text-[12.5px] font-medium whitespace-nowrap text-(--ink-2) tabular">
                  {r.passed} of {r.terms} terms met
                </span>
              )}
            </span>
            <span className="mt-auto pt-3">
              <span className="flex items-baseline gap-1.5">
                <span className="ed-num text-[28px] leading-none">{r.seconds === null ? "–" : <Figure value={r.seconds} />}</span>
                {r.seconds !== null && r.durationSec !== null && (
                  <span className="text-[13px] whitespace-nowrap text-(--ink-2)">
                    s on screen of <span className="tabular">{r.durationSec.toFixed(1)}</span>
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

        {(r.status === "running" || r.status === "uploaded") && (
          <span className="mt-auto pt-3">
            <span className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-full bg-(--wash) px-2.5 text-[12.5px] font-semibold text-(--ink-2)">
              <Spinner className="size-3.5 shrink-0" />
              <span className="truncate">{r.status === "running" ? (r.stepLabel ?? "Starting") : "Waiting to start"}</span>
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
