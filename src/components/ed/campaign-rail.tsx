// The campaign's story rail (grafted from the Feed comp), on every size as a quick visual scan: one ring per video, in
// the SAME order as the grid below, labelled by clip as everywhere, so "who fell short" reads in one swipe. Every
// fell-short ring carries a solid red cross; needs review is a dashed amber ring.
import { AlertTriangle, Check, CircleHelp, Inbox, X } from "lucide-react";
import { seconds } from "@/components/format";
import { PendingLink, Spinner } from "./pending-link";
import { CampaignThumb } from "./campaign-ui";
import type { Row } from "./campaign-list";

type Kind = "delivered" | "review" | "short" | "running" | "waiting" | "stopped";

const RING: Record<Kind, { bg: string; badge: string; label: string }> = {
  delivered: { bg: "var(--pass)", badge: "bg-(--pass) text-white", label: "Delivered" },
  review: {
    bg: "repeating-conic-gradient(var(--review) 0 16deg, transparent 16deg 26deg)",
    badge: "bg-(--review) text-white",
    label: "Needs review",
  },
  short: { bg: "var(--short)", badge: "bg-(--short) text-white", label: "Fell short" },
  running: { bg: "var(--hair-2)", badge: "bg-(--card) text-(--ink) ring-1 ring-(--hair-2)", label: "Checking" },
  waiting: { bg: "var(--ink-3)", badge: "bg-(--ink) text-white", label: "Waiting for you" },
  stopped: { bg: "var(--hair-2)", badge: "bg-(--wash) text-(--ink-2) ring-1 ring-(--hair-2)", label: "Stopped" },
};

const kindOf = (r: Row): Kind =>
  r.status === "failed"
    ? "stopped"
    : r.status === "waiting" || r.status === "uploaded"
      ? "waiting"
      : r.status !== "done"
        ? "running"
        : r.verdict === "delivered"
          ? "delivered"
          : r.verdict === "short"
            ? "short"
            : "review";

export function CampaignRail({ rows }: { rows: Row[] }) {
  if (rows.length < 2) return null;
  return (
    <section aria-label="Every video at a glance">
      <p className="mb-1.5 flex items-baseline justify-between text-[12.5px] font-semibold text-(--ink-3)">
        <span>Every video, in list order</span>
        {rows.length > 4 && <span className="font-medium">
            <span className="lg:hidden">Swipe</span>
            <span className="hidden lg:inline">Scroll</span> for all {rows.length} →
          </span>}
      </p>
      {/* A visual scan only: the tiles are out of the tab order (the list below is the keyboard path), the scrollbar is
          hidden, and the right edge fades so the row reads as "more to the right". */}
      <div className="-mx-4 sm:-mx-6 lg:mx-0">
        <ul className="flex [mask-image:linear-gradient(to_right,black_calc(100%-48px),transparent)] snap-x snap-mandatory scroll-px-4 gap-2 overflow-x-auto overscroll-x-contain px-4 pt-1 pb-2 [scrollbar-width:none] sm:scroll-px-6 sm:px-6 lg:scroll-px-0 lg:px-0 [&::-webkit-scrollbar]:hidden">
          {rows.map((r, i) => {
            const k = kindOf(r);
            const t = RING[k];
            const inner = (
              <>
                <span className="relative block rounded-[22px] p-[3px]" style={{ background: t.bg }}>
                  <span className="block rounded-[19px] bg-(--paper) p-[2.5px]">
                    <CampaignThumb src={r.thumbUrl} eager={i < 12} className="w-[62px] rounded-[16px]" />
                  </span>
                  <span
                    className={`absolute -right-1 -bottom-1 grid size-[22px] place-items-center rounded-full ring-[2.5px] ring-(--paper) ${t.badge}`}
                    aria-hidden
                  >
                    {k === "delivered" && <Check className="size-3.5" strokeWidth={3.25} />}
                    {k === "short" && <X className="size-3.5" strokeWidth={3.5} />}
                    {k === "review" && <CircleHelp className="size-3.5" strokeWidth={2.75} />}
                    {k === "running" && <Spinner className="size-3" />}
                    {k === "waiting" && <Inbox className="size-3" strokeWidth={2.75} />}
                    {k === "stopped" && <AlertTriangle className="size-3" strokeWidth={2.75} />}
                  </span>
                </span>
                <span className="mt-1.5 w-full truncate text-center text-[12.5px] leading-tight font-semibold">{r.meta ?? r.title}</span>
                <span className="w-full truncate text-center text-[11.5px] text-(--ink-3) tabular">
                  {r.seconds !== null ? seconds(r.seconds) : t.label}
                </span>
              </>
            );
            const cls = "relative flex w-[80px] flex-col items-center rounded-[20px] px-1 pt-1 pb-1.5";
            return (
              <li key={r.id} className="shrink-0 snap-start">
                {k === "waiting" ? (
                  <a href={`#v-${r.id}`} tabIndex={-1} className={`ed-press ${cls} active:bg-(--wash)`} aria-label={`${r.title}: ${t.label}`}>
                    {inner}
                  </a>
                ) : (
                  <PendingLink href={r.href} hint="cover" tabIndex={-1} aria-label={`${r.title}${r.meta ? `, ${r.meta}` : ""}: ${t.label}`} className={`${cls} active:bg-(--wash)`}>
                    {inner}
                  </PendingLink>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
