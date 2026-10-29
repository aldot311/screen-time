// The campaign's story rail (grafted from the Feed comp): one ring per creator, coloured by verdict, in one swipe.
// Ordered delivered → needs review → fell short → in progress → stopped, so the first impression is the real mix, not a
// row of identical red rings. Fell short is a solid red ring plus an X badge, so it never relies on solid-vs-dashed.
import { AlertTriangle, Check, CircleHelp, X } from "lucide-react";
import { PendingLink, Spinner } from "./pending-link";
import { CampaignThumb } from "./campaign-ui";
import type { Row } from "./campaign-list";

type Kind = "delivered" | "review" | "short" | "running" | "stopped";

const RING: Record<Kind, { bg: string; badge: string; label: string }> = {
  delivered: { bg: "var(--pass)", badge: "bg-(--pass) text-white", label: "Delivered" },
  review: {
    bg: "repeating-conic-gradient(var(--review) 0 16deg, transparent 16deg 26deg)",
    badge: "bg-(--review) text-white",
    label: "Needs review",
  },
  short: { bg: "var(--short)", badge: "bg-(--short) text-white", label: "Fell short" },
  running: { bg: "var(--hair-2)", badge: "bg-(--card) text-(--ink) ring-1 ring-(--hair-2)", label: "Checking" },
  stopped: { bg: "var(--hair-2)", badge: "bg-(--short-soft) text-(--short) ring-1 ring-(--short)/25", label: "Stopped" },
};
const ORDER: Kind[] = ["delivered", "review", "short", "running", "stopped"];

const kindOf = (r: Row): Kind =>
  r.status === "failed"
    ? "stopped"
    : r.status !== "done"
      ? "running"
      : r.verdict === "delivered"
        ? "delivered"
        : r.verdict === "short"
          ? "short"
          : "review";

export function CampaignRail({ rows }: { rows: Row[] }) {
  if (rows.length < 2) return null;
  const items = rows.map((r) => ({ r, k: kindOf(r) })).sort((a, b) => ORDER.indexOf(a.k) - ORDER.indexOf(b.k));
  return (
    <section aria-label="Creators at a glance">
      <ul className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-2 overflow-x-auto overscroll-x-contain px-4 pt-1 pb-2 [scrollbar-width:none] sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:mx-0 lg:px-0 lg:[mask-image:linear-gradient(to_right,black_90%,transparent)] [&::-webkit-scrollbar]:hidden">
        {items.map(({ r, k }, i) => {
          const t = RING[k];
          return (
            <li key={r.id} className="shrink-0 snap-start">
              <PendingLink
                href={r.href}
                hint="cover"
                aria-label={`${r.primary}, ${r.secondary}: ${t.label}`}
                className="relative flex w-[80px] flex-col items-center rounded-[20px] px-1 pt-1 pb-1.5 active:bg-(--wash)"
              >
                <span className="relative block rounded-[22px] p-[3px]" style={{ background: t.bg }}>
                  <span className="block rounded-[19px] bg-(--paper) p-[2.5px]">
                    <CampaignThumb src={r.thumbUrl} eager={i < 5} className="w-[62px] rounded-[16px]" />
                  </span>
                  <span
                    className={`absolute -right-1 -bottom-1 grid size-[22px] place-items-center rounded-full ring-[2.5px] ring-(--paper) ${t.badge}`}
                    aria-hidden
                  >
                    {k === "delivered" && <Check className="size-3.5" strokeWidth={3.25} />}
                    {k === "short" && <X className="size-3.5" strokeWidth={3.25} />}
                    {k === "review" && <CircleHelp className="size-3.5" strokeWidth={2.75} />}
                    {k === "running" && <Spinner className="size-3" />}
                    {k === "stopped" && <AlertTriangle className="size-3" strokeWidth={2.75} />}
                  </span>
                </span>
                <span className="mt-1.5 w-full truncate text-center text-[12.5px] leading-tight font-semibold">{r.primary}</span>
                <span className="w-full truncate text-center text-[11.5px] text-(--ink-3) tabular">
                  {r.seconds !== null ? `${r.seconds.toFixed(1)} s` : t.label}
                </span>
              </PendingLink>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
