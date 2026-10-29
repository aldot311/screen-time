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
    seconds: done.reduce((s, v) => s + (v.report?.metrics.secondsOnScreen ?? 0), 0),
  };
}

export default async function CampaignsPage() {
  const cards = await Promise.all((await listCampaigns()).map(summarize));

  // Campaigns that share a brand sit together under the brand; single-campaign brands follow, each card naming its brand.
  const byBrand = new Map<string, Card[]>();
  for (const k of cards) byBrand.set(k.c.brand, [...(byBrand.get(k.c.brand) ?? []), k]);
  const groups = [...byBrand.entries()].filter(([, ks]) => ks.length > 1);
  const singles = [...byBrand.values()].filter((ks) => ks.length === 1).flat();

  return (
    <>
      <TopBar />
      <main className="mx-auto w-full max-w-[1200px] px-4 pt-6 pb-10 sm:px-6 md:pb-24 lg:px-8 lg:pt-12">
        <header className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className={`${DISPLAY} text-[38px] leading-none sm:text-[56px]`}>Campaigns</h1>
            <p className="mt-2 max-w-[60ch] text-[15px] text-(--ink-2)">One product brief, checked across every creator video it paid for.</p>
          </div>
          {/* Phones have New in the tab bar; the header offers it from md up. */}
          <PendingLink
            href="/campaigns/new"
            className="hidden h-11 shrink-0 items-center gap-1.5 rounded-full bg-(--ink) pr-4 pl-3.5 text-[15px] font-semibold text-white shadow-(--sh-2) active:bg-black/85 md:inline-flex [@media(hover:hover)]:hover:bg-black"
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

        {groups.map(([brand, ks], gi) => (
          <section key={brand} aria-labelledby={`brand-${gi}`} className="mt-8">
            <h2 id={`brand-${gi}`} className={`${DISPLAY} flex items-baseline gap-2 text-[22px]`}>
              {brand}
              <span className="font-(family-name:--font-body) text-[14px] font-medium! tracking-normal! text-(--ink-3)">{plural(ks.length, "campaign")}</span>
            </h2>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
              {ks.map((k, i) => (
                <li key={k.c.id}>
                  <CampaignCard k={k} eager={gi === 0 && i < 4} showBrand={false} />
                </li>
              ))}
            </ul>
          </section>
        ))}

        {singles.length > 0 && (
          <section aria-label={groups.length ? "Other brands" : "All campaigns"} className={groups.length ? "mt-10" : "mt-7"}>
            {groups.length > 0 && <h2 className={`${DISPLAY} text-[22px]`}>Other brands</h2>}
            <ul className={`grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3 ${groups.length ? "mt-3" : ""}`}>
              {singles.map((k, i) => (
                <li key={k.c.id}>
                  <CampaignCard k={k} eager={!groups.length && i < 4} showBrand />
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}

function CampaignCard({ k, eager, showBrand }: { k: Card; eager: boolean; showBrand: boolean }) {
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
            {showBrand && <span className="block truncate text-[13px] font-semibold text-(--ink-3)">{k.c.brand}</span>}
            <span className={`${DISPLAY} block truncate text-[21px] leading-tight`}>{shortName(k.c)}</span>
          </span>
          <ChevronRight className="mt-1 size-5 shrink-0 text-(--ink-3)" strokeWidth={2.25} aria-hidden />
        </span>
        {k.c.synthetic && (
          <span className="mt-1.5 inline-flex h-6 w-fit items-center rounded-full bg-(--review-soft) px-2.5 text-[12px] font-semibold text-(--review)">
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
              <span className="ed-num">{k.delivered}</span> of <span className="ed-num">{k.done}</span> delivered
            </span>
          )}
        </span>
        {k.done > 0 && <MixBar delivered={k.delivered} short={k.short} review={k.review} />}
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

/**
 * The verdict mix. With at least one delivery it is a split bar (pass, fail, review in proportion). With none it is an
 * empty neutral track ending in a red (or amber) cap, so "0 of N" differs from "N of N" in shape, not only colour.
 */
function MixBar({ delivered, short, review }: { delivered: number; short: number; review: number }) {
  const label = `${delivered} delivered, ${short} fell short, ${review} need review`;
  if (delivered === 0)
    return (
      <span className="mt-2 flex h-2 items-center gap-[3px]" role="img" aria-label={label}>
        <span className="h-full flex-1 rounded-l-full bg-(--wash) shadow-[inset_0_0_0_1px_var(--hair)]" />
        {review > 0 && <span className="h-full w-3 bg-(--review) last:rounded-r-full" />}
        {short > 0 && <span className="h-full w-5 rounded-r-full bg-(--short)" />}
      </span>
    );
  const parts = [
    { n: delivered, c: "bg-(--pass)" },
    { n: short, c: "bg-(--short)" },
    { n: review, c: "bg-(--review)" },
  ].filter((p) => p.n > 0);
  return (
    <span className="mt-2 flex h-2 gap-[3px] overflow-hidden rounded-full" role="img" aria-label={label}>
      {parts.map((p) => (
        <span key={p.c} className={`h-full ${p.c}`} style={{ flex: p.n }} />
      ))}
    </span>
  );
}

/** Up to three creator stills fanned out; the slot is sized to what it holds, so a single still leaves no gap. */
function ThumbCluster({ thumbs, eager }: { thumbs: string[]; eager: boolean }) {
  const shown = thumbs.slice(0, 3);
  const extra = thumbs.length - shown.length;
  if (!shown.length) return <CampaignThumb className="w-[70px] rounded-[13px]" />;
  const step = 14;
  return (
    <span className="relative block shrink-0" style={{ width: 70 + step * (shown.length - 1) + (shown.length > 1 ? 8 : 0) }} aria-hidden>
      {shown
        .map((t, i) => (
          <span
            key={t}
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
