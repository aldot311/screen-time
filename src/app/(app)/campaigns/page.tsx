import type { Metadata } from "next";
import { ChevronRight, Plus } from "lucide-react";
import { listCampaigns, listVideos } from "@/lib/campaign/store";
import type { Campaign } from "@/lib/campaign/types";
import { seconds, verdictOf } from "@/components/format";
import { TopBar } from "@/components/ed/top-bar";
import { PendingLink } from "@/components/ed/pending-link";
import { CampaignThumb, DISPLAY, plural, shortName } from "@/components/ed/campaign-ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Campaigns" };

type Card = Awaited<ReturnType<typeof summarize>>;

async function summarize(c: Campaign) {
  const videos = await listVideos(c.id);
  const done = videos.filter((v) => v.status === "done");
  const verdicts = done.map((v) => verdictOf(v.report));
  return {
    c,
    thumbs: videos.map((v) => v.thumbUrl).filter((u): u is string => u !== undefined),
    total: videos.length,
    done: done.length,
    delivered: verdicts.filter((v) => v === "delivered").length,
    short: verdicts.filter((v) => v === "short").length,
    review: verdicts.filter((v) => v === "review").length,
    running: videos.filter((v) => v.status === "running" || (v.status === "uploaded" && !v.consent)).length,
    waiting: videos.filter((v) => v.status === "uploaded" && v.consent).length,
    stopped: videos.filter((v) => v.status === "failed").length,
    // Exact per-video values summed once and floored only for display, exactly as the roll-up does.
    seconds: done.reduce((s, v) => s + (v.report?.metrics.secondsOnScreen ?? 0), 0),
  };
}

export default async function CampaignsPage() {
  const cards = await Promise.all((await listCampaigns()).map(summarize));

  // Sorted by brand. Brands with one campaign share one grid; a brand with 2+ campaigns gets a quiet label over its own.
  const sorted = [...cards].sort((a, b) => a.c.brand.localeCompare(b.c.brand) || shortName(a.c).localeCompare(shortName(b.c)));
  const count = new Map<string, number>();
  for (const k of sorted) count.set(k.c.brand, (count.get(k.c.brand) ?? 0) + 1);
  const runs: { brand: string | null; cards: Card[] }[] = [];
  for (const k of sorted) {
    const brand = (count.get(k.c.brand) ?? 0) > 1 ? k.c.brand : null;
    const last = runs.at(-1);
    if (last && last.brand === brand) last.cards.push(k);
    else runs.push({ brand, cards: [k] });
  }
  let n = 0;

  return (
    <>
      <TopBar />
      <main className="mx-auto w-full max-w-[1200px] px-4 pt-6 pb-10 sm:px-6 md:pb-24 lg:px-8 lg:pt-12">
        <header className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className={`${DISPLAY} text-[38px] leading-none sm:text-[56px]`}>Campaigns</h1>
            <p className="mt-2 max-w-[60ch] text-[15px] text-(--ink-2)">One product brief, checked across every creator video it paid for.</p>
          </div>
          {/* Phones have New in the tab bar and tablets in the top bar; the big button is for desktop. */}
          <PendingLink
            href="/campaigns/new"
            className="hidden h-11 shrink-0 items-center gap-1.5 rounded-full bg-(--ink) pr-4 pl-3.5 text-[15px] font-semibold text-white shadow-(--sh-2) active:bg-black/85 lg:inline-flex [@media(hover:hover)]:hover:bg-black"
          >
            <Plus className="size-[18px]" strokeWidth={2.5} aria-hidden />
            New campaign
          </PendingLink>
        </header>

        {cards.length === 0 && (
          <div className="mt-8 rounded-(--r-card) bg-(--card) p-8 text-center shadow-(--sh-1) ring-1 ring-(--hair)">
            <p className={`${DISPLAY} text-[22px]`}>No campaigns yet</p>
            <p className="mx-auto mt-2 max-w-[40ch] text-(--ink-2)">Describe the product and the contract once, then add each creator&rsquo;s video.</p>
            <PendingLink
              href="/campaigns/new"
              className="mt-5 inline-flex h-12 items-center gap-2 rounded-full bg-(--ink) px-5 font-semibold text-white active:bg-black/85"
            >
              <Plus className="size-[18px]" strokeWidth={2.5} aria-hidden /> Create the first one
            </PendingLink>
          </div>
        )}

        <div className="mt-7 space-y-7">
          {runs.map((run, ri) => (
            <section key={`${run.brand ?? "solo"}-${ri}`} aria-label={run.brand ? `${run.brand} campaigns` : undefined}>
              {run.brand && (
                <h2 className="mb-2.5 text-[13px] font-semibold text-(--ink-3)">
                  {run.brand} · {plural(run.cards.length, "campaign")}
                </h2>
              )}
              <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
                {run.cards.map((k) => (
                  <li key={k.c.id}>
                    <CampaignCard k={k} eager={n++ < 6} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </main>
    </>
  );
}

function CampaignCard({ k, eager }: { k: Card; eager: boolean }) {
  return (
    <PendingLink
      href={`/campaigns/${k.c.id}`}
      hint="cover"
      className="ed-press-soft relative flex h-full gap-4 rounded-(--r-card) bg-(--card) p-3 pr-3.5 shadow-(--sh-1) ring-1 ring-(--hair) active:bg-(--wash) [@media(hover:hover)]:hover:ring-(--hair-2)"
    >
      <ThumbCluster thumbs={k.thumbs} eager={eager} />
      <span className="flex min-w-0 flex-1 flex-col py-0.5">
        <span className="flex items-start gap-2">
          <span className="min-w-0 flex-1">
            <span className={`${DISPLAY} block truncate text-[21px] leading-tight`}>{k.c.brand}</span>
            <span className="mt-0.5 block truncate text-[14px] text-(--ink-2)">{shortName(k.c)}</span>
          </span>
          <ChevronRight className="mt-1 size-5 shrink-0 text-(--ink-3)" strokeWidth={2.25} aria-hidden />
        </span>
        {k.c.synthetic && (
          <span className="mt-1.5 inline-flex h-6 w-fit items-center rounded-full bg-(--wash) px-2.5 text-[12px] font-semibold text-(--ink-2) ring-1 ring-(--hair)">
            Preview data
          </span>
        )}
        <span className="mt-auto pt-3 text-[14.5px] leading-snug">
          {k.total === 0 ? (
            <span className="text-(--ink-2)">No videos yet</span>
          ) : k.done === 0 ? (
            <span className="text-(--ink-2)">{plural(k.total, "video")}, none checked yet</span>
          ) : (
            <span className="font-semibold">
              <span className="ed-num">{k.delivered}</span> of <span className="ed-num">{k.total}</span> delivered
            </span>
          )}
        </span>
        {k.total > 0 && <MixBar k={k} />}
        <span className="mt-1.5 flex flex-wrap gap-x-3 text-[12.5px] text-(--ink-2) tabular">
          {k.done > 0 && <span className="text-(--ink-3)">{seconds(k.seconds)} on screen</span>}
          {k.short > 0 && <span>{k.short} fell short</span>}
          {k.review > 0 && <span>{k.review} to review</span>}
          {k.running > 0 && <span className="text-(--ink-3)">{k.running} in progress</span>}
          {k.waiting > 0 && <span className="font-semibold text-(--ink)">{k.waiting} waiting for you</span>}
          {k.stopped > 0 && <span className="text-(--short)">{k.stopped} stopped</span>}
        </span>
      </span>
    </PendingLink>
  );
}

/** Every video in proportion: delivered green, fell short red, needs review amber, anything not judged yet neutral. */
function MixBar({ k }: { k: Card }) {
  const other = k.total - k.delivered - k.short - k.review;
  const parts = [
    { n: k.delivered, c: "bg-(--pass)", key: "d" },
    { n: k.short, c: "bg-(--short)", key: "s" },
    { n: k.review, c: "bg-(--review)", key: "r" },
    { n: other, c: "bg-(--hair-2)", key: "o" },
  ].filter((p) => p.n > 0);
  return (
    <span
      className="mt-2 flex h-2 gap-[3px] overflow-hidden rounded-full"
      role="img"
      aria-label={`${k.delivered} delivered, ${k.short} fell short, ${k.review} need review${other ? `, ${other} not judged yet` : ""}`}
    >
      {parts.map((p) => (
        <span key={p.key} className={`h-full ${p.c}`} style={{ flex: p.n }} />
      ))}
    </span>
  );
}

/** Up to three creator stills fanned out; the slot is sized to what it holds, so a single still leaves no gap. */
function ThumbCluster({ thumbs, eager }: { thumbs: string[]; eager: boolean }) {
  const shown = thumbs.slice(0, 3);
  const extra = thumbs.length - shown.length;
  const step = 14;
  // One slot width for every card (room for a three-still fan), so titles start at the same edge on every card.
  const slot = 70 + step * 2 + 8;
  if (!shown.length) {
    return (
      <span className="block shrink-0" style={{ width: slot }} aria-hidden>
        <CampaignThumb className="w-[70px] rounded-[13px]" />
      </span>
    );
  }
  return (
    <span className="relative block shrink-0" style={{ width: slot }} aria-hidden>
      {shown
        .map((t, i) => (
          <span
            key={`${i}-${t}`}
            className="absolute top-0 block overflow-hidden rounded-[13px] shadow-(--sh-1) ring-2 ring-(--card)"
            style={{ left: `${i * step}px`, transform: `rotate(${i * 3}deg)`, transformOrigin: "bottom left", zIndex: 3 - i }}
          >
            <CampaignThumb src={t} eager={eager} className="w-[70px]" />
          </span>
        ))
        .reverse()}
      <span className="invisible block aspect-[9/16] w-[70px]" />
      {extra > 0 && (
        <span className="absolute right-0 bottom-0 z-10 rounded-full bg-(--ink) px-1.5 py-0.5 text-[11px] font-semibold text-white tabular">+{extra}</span>
      )}
    </span>
  );
}
