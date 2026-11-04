import type { CSSProperties } from "react";
import { ArrowRight, ArrowUpRight, AudioLines, ChevronRight, FileCheck2, ScanSearch, ShieldCheck } from "lucide-react";
import data from "@/lib/accuracy-data.json";
import { loadShowcase, type Showcased } from "@/lib/campaign/showcase";
import { SAM_USD_PER_FRAME } from "@/lib/meta/cost-guard";
import { LiveReplay } from "@/components/ed/live-replay";
import { PendingLink } from "@/components/ed/pending-link";
import { TrySample } from "@/components/ed/try-sample";
import { TopBar } from "@/components/ed/top-bar";
import { Wordmark } from "@/components/ed/bits";
import { DemoNote } from "@/components/ed/demo-note";
import { clipLabel, clipVideoId, labelProvenance, pct, pct0, sampleRows, sparkChanges, summarize, targetName, type SampleRow } from "@/components/ed/accuracy-summary";
import { lookalikeCards, type VerdictCardData } from "@/components/ed/showcase-cards";
import { demoMedia } from "@/components/ed/demo-media";
import { CASES, CONTACT_EMAIL, JUDGE_HREF, LACROIX, OWN_VIDEO_HREF, campaignHref, reportHref } from "@/components/ed/judge-path";
import { getCampaign, getVideo, listVideos } from "@/lib/campaign/store";
import { handleKey } from "@/lib/campaign/handle";
import { tenths } from "@/components/format";

export const dynamic = "force-dynamic";

const REPO = "https://github.com/aldot311/screen-time";

const STEPS = [
  {
    icon: ScanSearch,
    model: "Meta SAM 3.1",
    title: "Track",
    role: "tracks the product in every frame",
    text: "Finds every can, cup or sneaker in every frame from a two-word prompt.",
    extra: "If the word finds nothing, Muse Spark looks at the video and suggests a better one.",
    extraLabel: "Prompt recovery.",
  },
  {
    icon: ShieldCheck,
    model: "Muse Spark",
    title: "Verify",
    role: "rejects look-alikes",
    text: "Looks at crops of each object and throws out anything that is not your exact product.",
    extra: "Add a product photo and it compares each find with the photo too, not only your description.",
    extraLabel: "Product photo.",
  },
  {
    icon: AudioLines,
    model: "Muse Voice Transcribe",
    title: "Listen",
    role: "hears the brand name and the ad disclosure",
    // Voice Transcribe times whole turns and a brand name is placed by its word position, so spoken times are approximate.
    text: "Hears when the creator says your brand name, and whether they say it’s an ad.",
  },
  {
    icon: FileCheck2,
    model: "Muse Spark + rules",
    title: "Check",
    role: "checks each contract term",
    text: "Turns contract terms written in plain English into rules, and checks screen-time terms to the frame.",
  },
];

/** The demo video's script, step by step, each linked to the live page it shows (docs/DEMO.md has the full script). */
const DEMO_SCRIPT: { title: string; text: string; href?: string }[] = [
  { title: "The problem", text: "Brands pay creators for screen time. Screen-Time measures it against the contract." },
  { title: "The creator link", text: "Aldo, who built Screen-Time, sends his own Reel through his creator link: no account, no password.", href: campaignHref },
  {
    title: "The live run",
    text: "SAM 3.1 tracks the can, Muse Spark checks each find against the product photo, Voice Transcribe listens, and every term of the contract is checked: a Poppi on the table is rejected as a look-alike. Tap a term to play the moment that proves it.",
    href: reportHref(CASES.live),
  },
  { title: "Look-alikes", text: "Aldo’s can (the builder’s own clip) is the wrong flavor: Muse Spark rejects it, nothing counts, and the fee is held.", href: reportHref(CASES.hold) },
  { title: "The follow-up agent", text: "Muse Spark drafts the note and a re-cut request; nothing is sent until you approve.", href: reportHref(CASES.agent) },
  { title: "The re-cut", text: "Ash’s first upload never says LaCroix; her other take, sent after it, replaces it and pays.", href: reportHref(CASES.firstTake) },
  { title: "The campaign", text: "Pay or hold for every creator, with dollar totals and a CSV for finance. Screen-Time never moves money.", href: campaignHref },
  { title: "Accuracy, in one line", text: "Precision with and without Muse Spark, measured frame by frame.", href: "/accuracy" },
  { title: "Built during the hackathon", text: "The pipeline, the contract checker, the follow-up agent and the accuracy harness, all open source." },
];

const btnPrimary =
  "inline-flex h-14 items-center justify-center gap-2 rounded-full bg-(--ink) px-7 text-[16px] font-semibold text-white shadow-(--sh-2) hover:bg-black active:bg-black/80 lg:px-6";
// A text link on a phone (so the replay stays on the first screen), a button from sm up.
const btnSecondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full text-[15px] font-semibold text-(--ink) underline decoration-(--hair-2) decoration-2 underline-offset-4 active:bg-(--wash) sm:h-14 sm:bg-(--card) sm:px-7 sm:text-[16px] sm:no-underline sm:shadow-(--sh-1) sm:ring-1 sm:ring-(--hair) sm:hover:ring-(--hair-2) lg:px-6";
const navLink =
  "ed-press hidden h-10 items-center rounded-full px-3.5 text-[14px] font-semibold text-(--ink-2) hover:bg-(--wash) hover:text-(--ink) active:bg-(--hair) md:inline-flex";
const textLink =
  "ed-press inline-flex min-h-11 items-center gap-1 rounded-full font-semibold text-(--ink) underline decoration-(--hair-2) decoration-2 hover:decoration-(--ink) active:opacity-70";
const footLink =
  "ed-press -mx-3 inline-flex h-11 items-center gap-1 self-start rounded-full px-3 font-semibold text-(--ink-2) hover:bg-(--wash) hover:text-(--ink) active:bg-(--hair) sm:self-auto";

export default async function Landing() {
  const showcase = await loadShowcase();
  const { hero } = showcase;
  const cards = lookalikeCards(showcase);
  const lacroixRead = getCampaign(LACROIX).catch(() => null);
  const [heroCampaign, lacroix, rows, lacroixVideos] = await Promise.all([
    !hero ? null : hero.video.campaignId === LACROIX ? lacroixRead : getCampaign(hero.video.campaignId).catch(() => null),
    lacroixRead,
    linkedRows(),
    listVideos(LACROIX).catch(() => []),
  ]);
  // Creators with a checked Reel in the showcase campaign (a re-cut is the same creator), counted, never typed in.
  const checkedCreators = new Set(lacroixVideos.filter((v) => v.status === "done").map((v) => handleKey(v.creator))).size;
  const acc = summarize(data);
  const unconfirmed = sparkChanges(data).filter((c) => c.kind === "unconfirmed");
  const labelLine = labelProvenance(data)?.line;
  const heroSec = hero ? Math.round(hero.video.report.info.durationSec) : null;
  const demo = demoMedia(hero?.video.thumbUrl);
  const reportLink = hero?.href ?? campaignHref;

  return (
    <>
      <TopBar
        appNav={false}
        right={
          <>
            <a href="#how" className={navLink}>
              How it works
            </a>
            <a href="#accuracy" className={navLink}>
              Accuracy
            </a>
            <a href={REPO} className={`${navLink} mr-2`}>
              GitHub
            </a>
            <PendingLink
              href="/campaigns"
              className="inline-flex h-11 items-center gap-2 rounded-full bg-(--ink) px-4 text-[14px] font-semibold text-white shadow-(--sh-1) hover:bg-black active:bg-black/80"
            >
              Open the app
            </PendingLink>
          </>
        }
      />

      <main className="flex-1">
        {/* Phone: headline, intro, the primary action, then the replay, whose top still lands on the first screen.
            Desktop: copy and actions on the left, the replay beside them. */}
        <section className="mx-auto grid w-full max-w-[1200px] gap-x-14 gap-y-5 px-4 pt-5 pb-14 sm:gap-y-9 sm:px-6 sm:pt-8 lg:grid-cols-[minmax(0,1fr)_600px] lg:grid-rows-[auto_auto] lg:gap-y-0 lg:px-8 lg:pt-14 lg:pb-24">
          <div className="min-w-0 lg:col-start-1 lg:row-start-1 lg:self-end">
            <h1 className="ed-display ed-rise max-w-[11ch] text-[42px] leading-[0.96] sm:text-[72px] lg:text-[84px]">
              Proof your product was{" "}
              <span className="relative inline-block">
                {/* The one brand use of lime: the word that means "on screen", marked the way the strip marks it. */}
                <span
                  className="ed-mark absolute inset-x-[-0.05em] top-[0.18em] bottom-[0.02em] rounded-[0.12em] bg-(--signal)"
                  style={{ "--d": "420ms" } as CSSProperties}
                  aria-hidden
                />
                <span className="relative">seen.</span>
              </span>
            </h1>
            <p
              className="ed-rise mt-4 max-w-[48ch] text-[16px] leading-[1.55] text-(--ink-2) sm:mt-6 sm:text-[19px] sm:leading-[1.6]"
              style={{ "--d": "90ms" } as CSSProperties}
            >
              <span className="hidden sm:inline">Brands pay creators for screen time. Screen-Time measures it against the contract. </span>
              Meta SAM 3.1 tracks your product in every frame of a sponsored video, Muse Spark rejects look-alikes, Muse Voice
              Transcribe hears your brand, and Screen-Time checks each on-screen term frame by frame.
            </p>
          </div>

          <div className="ed-rise min-w-0 lg:col-start-1 lg:row-start-2 lg:self-start lg:pt-8" style={{ "--d": "180ms" } as CSSProperties}>
            <div className="flex flex-col items-stretch gap-1 sm:flex-row sm:flex-wrap sm:gap-3">
              <TrySample className={btnPrimary} label="Run it on a sample video" />
              {/* Phone: two text links side by side. From sm up the wrapper drops out, "Try your own video" joins the row as
                  the one secondary button, and the report link moves down beside the judge link. */}
              <div className="flex flex-wrap gap-x-6 sm:contents">
                <PendingLink href={OWN_VIDEO_HREF} className={btnSecondary}>
                  Try your own video
                </PendingLink>
                <PendingLink href={reportLink} className={`${btnSecondary} sm:hidden`}>
                  Open a real report
                </PendingLink>
              </div>
            </div>
            <p className="mt-2 max-w-[56ch] text-[13px] leading-[1.5] text-(--ink-3)">
              The sample runs the real pipeline, live{heroSec ? ` on a ${heroSec}-second Reel` : ""}. No password needed to run the
              sample or open the example reports; checking your own video needs the demo password.
            </p>
            <p className="mt-1 flex flex-wrap gap-x-6 text-[14px]">
              <PendingLink
                href={reportLink}
                className="ed-press hidden min-h-11 items-center gap-1 rounded-full font-semibold text-(--ink) underline decoration-(--hair-2) decoration-2 hover:decoration-(--ink) active:opacity-70 sm:inline-flex"
              >
                Open a real report <ArrowRight className="size-4" strokeWidth={2.25} aria-hidden />
              </PendingLink>
              <PendingLink href={JUDGE_HREF} className={textLink}>
                How to judge this in 5 minutes <ArrowRight className="size-4" strokeWidth={2.25} aria-hidden />
              </PendingLink>
            </p>
            <p className="mt-3 hidden text-[14px] text-(--ink-3) sm:block">
              <a href="#accuracy" className="ed-press -mx-2 inline-flex min-h-11 items-center rounded-full px-2 hover:text-(--ink) active:bg-(--wash)">
                <span>
                  <span className="font-semibold text-(--ink) tabular">{pct(acc.verified.precision)}</span> precision ·{" "}
                  <span className="font-semibold text-(--ink) tabular">{pct(acc.verified.recall)}</span> recall per frame on labelled test videos
                </span>
              </a>
            </p>
          </div>

          {hero && (
            <figure className="ed-rise min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center" style={{ "--d": "140ms" } as CSSProperties}>
              <LiveReplay
                report={hero.video.report}
                videoUrl={hero.video.videoUrl}
                poster={hero.video.thumbUrl}
                cropUrls={hero.video.cropUrls}
                names={hero.names}
              />
              <figcaption className="mt-4 px-1 text-[13px] leading-[1.55] text-(--ink-3)">{heroCaption(hero, heroCampaign?.brand)}</figcaption>
            </figure>
          )}
        </section>

        <section id="demo" aria-labelledby="demo-h" className="scroll-mt-20 border-t border-(--hair)">
          {/* Phone: heading, the video, then its steps. Desktop: heading and steps on the left, the video beside them. */}
          <div className="mx-auto grid w-full max-w-[1200px] gap-x-14 gap-y-8 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,600px)] lg:items-start lg:gap-y-0 lg:px-8 lg:py-20">
            <div className="min-w-0 lg:col-start-1 lg:row-start-1">
              <h2 id="demo-h" className="ed-display max-w-[16ch] text-[34px] leading-[1.04] text-balance sm:text-[44px]">
                Watch the <span className="whitespace-nowrap">3-minute</span> demo
              </h2>
              <p className="mt-4 max-w-[52ch] text-[16px] leading-[1.6] text-(--ink-2)">
                {demo
                  ? "One LaCroix test campaign, start to finish. Every step below is live on this site."
                  : "The recorded demo is not up yet. It follows the steps below, and each one is live on this site now."}
              </p>
            </div>
            <figure className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1">
              {demo ? (
                <video
                  controls
                  playsInline
                  preload="metadata"
                  poster={demo.poster}
                  className="aspect-video w-full rounded-(--r-card) bg-black shadow-(--sh-2)"
                >
                  <source src={demo.src} type="video/mp4" />
                  {demo.captions && <track kind="captions" src={demo.captions} srcLang="en" label="English" default />}
                </video>
              ) : (
                // Clearly not a player: no play button, no fake frame. public/demo.mp4 replaces it on the next request.
                <div className="grid aspect-video w-full place-items-center rounded-(--r-card) border-[1.5px] border-dashed border-(--hair-2) bg-(--wash)/60 p-6 text-center">
                  <p>
                    <span className="block text-[13px] font-semibold tracking-[0.02em] text-(--ink-3) uppercase">Video placeholder</span>
                    <span className="mt-1 block text-[15px] text-(--ink-2)">The 3-minute demo video goes here.</span>
                  </p>
                </div>
              )}
            </figure>
            <ol className="min-w-0 divide-y divide-(--hair) border-y border-(--hair) lg:col-start-1 lg:row-start-2 lg:mt-5">
              {DEMO_SCRIPT.map((s, i) => (
                <li key={s.title} className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-3 py-3">
                  <span className="pt-px text-[14px] font-semibold text-(--ink-3) tabular">{i + 1}</span>
                  <p className="text-[15px] leading-[1.5] text-(--ink-2)">
                    {s.href ? (
                      // Inline, with vertical padding that widens the tap target to 44px without moving the line.
                      <PendingLink href={s.href} className="-mx-1 rounded-[8px] px-1 py-3 font-semibold text-(--ink) underline decoration-(--hair-2) decoration-2 underline-offset-4 hover:decoration-(--ink) active:opacity-70">
                        {s.title}
                      </PendingLink>
                    ) : (
                      <span className="font-semibold text-(--ink)">{s.title}</span>
                    )}
                    {/* Under the title on a phone; after it, as one sentence, from sm up. */}
                    <span className="block sm:inline">
                      <span className="hidden sm:inline">. </span>
                      {s.text}
                    </span>
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="how" className="scroll-mt-20 border-t border-(--hair) bg-(--card)">
          <div className="mx-auto w-full max-w-[1200px] px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
            <div className="grid gap-x-14 gap-y-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-start">
              <h2 className="ed-display max-w-[20ch] text-[34px] leading-[1.04] sm:text-[44px]">
                Three Meta models, four checks, one verdict per creator.
              </h2>
              <div className="space-y-3 text-[16px] leading-[1.6] text-(--ink-2) lg:pt-1.5">
                <p>Add a creator&rsquo;s video and say what your product looks like. Every number in the report links to the moment that proves it.</p>
                <p className="text-[14.5px] text-(--ink-3)">
                  Brands upload the file the creator delivered, or ask the creator to send it. Platform terms bar downloading
                  other people&rsquo;s videos without permission, so the brand checks the file the creator delivers.
                </p>
              </div>
            </div>

            <ol className="relative mt-12 grid gap-9 sm:grid-cols-2 lg:mt-14 lg:grid-cols-4 lg:gap-8">
              {/* The rule that joins the steps: down the left on a phone, across the icons on a wide screen. */}
              <span className="absolute top-5 bottom-5 left-5 w-px bg-(--hair-2) sm:hidden lg:right-5 lg:bottom-auto lg:block lg:h-px lg:w-auto" aria-hidden />
              {STEPS.map((s) => (
                <li key={s.title} className="relative grid grid-cols-[40px_minmax(0,1fr)] gap-x-4 lg:block">
                  <span className="relative grid size-10 place-items-center rounded-[12px] bg-(--paper) text-(--ink) ring-1 ring-(--hair-2)">
                    <s.icon className="size-[19px]" strokeWidth={2} aria-hidden />
                  </span>
                  <div className="min-w-0 lg:mt-5">
                    <h3 className="ed-display text-[22px] leading-tight">{s.title}</h3>
                    <p className="mt-1 text-[13px] font-medium text-(--ink-3)">{s.model}</p>
                    <p className="mt-2 text-[15px] leading-[1.55] text-(--ink-2)">{s.text}</p>
                    {"extra" in s && (
                      <p className="mt-2 text-[14px] leading-[1.5] text-(--ink-3)">
                        <span className="font-semibold text-(--ink-2)">{s.extraLabel}</span> {s.extra}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {cards.length > 0 && (
          <section className="border-t border-(--hair)">
            <div className="mx-auto w-full max-w-[1200px] px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
              <div className="grid gap-x-14 gap-y-10 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start">
                <div className="lg:sticky lg:top-24">
                  <h2 className="ed-display max-w-[16ch] text-[34px] leading-[1.04] sm:text-[44px]">It knows your can from the one next to it.</h2>
                  <p className="mt-4 max-w-[58ch] text-[16px] leading-[1.6] text-(--ink-2)">
                    Counting every can in the shot would pay a creator for someone else&rsquo;s product. Muse Spark checks
                    each object SAM 3.1 finds against your description and product photo, and says why in words you can check.
                  </p>
                </div>
                <ul className="grid gap-4 sm:grid-cols-3">
                  {cards.map((c) => (
                    <VerdictCard key={`${c.show.video.campaignId}-${c.show.video.id}-${c.track.objectId}`} card={c} />
                  ))}
                </ul>
              </div>
            </div>
          </section>
        )}

        <section id="accuracy" className="scroll-mt-20 border-t border-(--hair) bg-(--card)">
          <div className="mx-auto w-full max-w-[1200px] px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
            <h2 className="ed-display max-w-[22ch] text-[34px] leading-[1.04] sm:text-[44px]">Measured frame by frame on {acc.clips} test Reels.</h2>
            <p className="mt-5 max-w-[44ch] text-[21px] leading-[1.4] text-(--ink-2) sm:text-[24px]">
              <span className="ed-num text-(--ink)">{pct(acc.verified.precision)}</span> precision and{" "}
              <span className="ed-num text-(--ink)">{pct(acc.verified.recall)}</span> recall per frame, on the {acc.clips} Reels as delivered on this
              site.
            </p>
            {labelLine && <p className="mt-3 max-w-[64ch] text-[15px] leading-[1.6] text-(--ink-3)">{labelLine}</p>}
            <p className="mt-3 max-w-[64ch] text-[15px] leading-[1.6] text-(--ink-3)">
              {acc.multiProductClips > 0 && `${acc.multiProductClips} of the videos show more than one product, and each product is checked on its own. `}
              SAM 3.1 tracking costs ${(SAM_USD_PER_FRAME * 1000).toFixed(2)} per 1,000 frames
              {hero
                ? `; the whole check of ${possessive(hero.video.creator)} ${heroSec}-second Reel, with Muse Spark and Voice Transcribe, cost $${hero.video.report.cost.usd.toFixed(3)} (${hero.video.report.cost.samFrames} frames).`
                : "."}
            </p>
            <p className="mt-3 max-w-[64ch] text-[15px] leading-[1.6] font-medium text-(--ink)">
              The demo is free. Checking one video costs about $0.10–0.25 in Meta API fees.
            </p>
            <p className="mt-3 max-w-[64ch] text-[15px] leading-[1.6] text-(--ink-2)">
              Without Muse Spark, SAM 3.1 alone scores {pct(acc.sam.precision)} precision and {pct(acc.sam.recall)} recall: a look-alike counts as
              the brand&rsquo;s product. With it, {pct(acc.verified.precision)} and {pct(acc.verified.recall)}.
              {unconfirmed.length > 0 &&
                ` Recall is lower with it because on ${unconfirmed.map((c) => `${clipLabel(c.clip)}’s Reel`).join(" and ")} Muse Spark could not confirm the product SAM 3.1 tracked, so it was not counted and the report flags it.`}{" "}
              <PendingLink href="/accuracy" className={textLink}>
                How it was measured, and where it is wrong <ArrowRight className="size-4" strokeWidth={2.25} aria-hidden />
              </PendingLink>
            </p>

            <div className="mt-10 overflow-hidden rounded-(--r-card) bg-(--paper) ring-1 ring-(--hair)">
              <div
                className="hidden grid-cols-[minmax(0,1fr)_96px_96px_96px_96px_32px] gap-4 border-b border-(--hair) px-5 py-3.5 text-[13px] font-medium text-(--ink-3) md:grid"
                aria-hidden
              >
                <span>Product check</span>
                <span className="text-right">Labelled</span>
                <span className="text-right">Measured</span>
                <span className="text-right">Precision</span>
                <span className="text-right">Recall</span>
                <span />
              </div>
              <ul className="divide-y divide-(--hair)">
                {rows.map((r) => (
                  <li key={`${r.clip}-${r.target}`}>
                    {r.href ? (
                      <PendingLink
                        href={r.href}
                        hint="cover"
                        className={`ed-press-soft relative hover:bg-(--wash)/60 active:bg-(--wash) ${ROW_GRID}`}
                      >
                        <RowBody r={r} linked />
                      </PendingLink>
                    ) : (
                      <div className={ROW_GRID}>
                        <RowBody r={r} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <p className="mt-6 max-w-[72ch] text-[15px] leading-[1.6] text-(--ink-2)">
              {testSetLine(acc)}{" "}
              <PendingLink href="/accuracy" className={textLink}>
                All {acc.targets} results <ArrowRight className="size-4" strokeWidth={2.25} aria-hidden />
              </PendingLink>
            </p>
          </div>
        </section>

        <section className="bg-(--ink) text-white">
          <div className="mx-auto w-full max-w-[1200px] px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
            <h2 className="ed-display max-w-[20ch] text-[34px] leading-[1.04] sm:text-[48px]">
              {lacroix && checkedCreators > 0 ? `See ${checkedCreators} creators’ Reels checked.` : "See it on real campaigns."}
            </h2>
            {lacroix && (
              <p className="mt-3 max-w-[52ch] text-[16px] leading-[1.6] text-white/70">
                One {lacroix.brand} test campaign{lacroix.fee ? ` with a $${lacroix.fee.toLocaleString("en-US")} fee` : ""}
                {lacroix.productImageUrl ? " and the product photo" : ""}: every Reel with its verdict, what it pays or holds, its
                seconds on screen and the moment that proves every term.
              </p>
            )}
            <PendingLink
              href={lacroix ? campaignHref : "/campaigns"}
              className="mt-8 inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-white px-7 text-[16px] font-semibold text-(--ink) shadow-(--sh-2) hover:bg-(--paper) active:bg-(--wash) sm:w-auto"
            >
              {lacroix ? `Open the ${lacroix.brand} campaign` : "Open the app"} <ArrowRight className="size-[18px]" strokeWidth={2.25} aria-hidden />
            </PendingLink>
          </div>
        </section>
      </main>

      <footer className="border-t border-(--hair) pb-[env(safe-area-inset-bottom)]">
        <section aria-labelledby="tools-h" className="mx-auto w-full max-w-[1200px] px-4 pt-10 sm:px-6 lg:px-8">
          <h2 id="tools-h" className="text-[13px] font-semibold text-(--ink-3)">
            Meta tools used
          </h2>
          {/* The same roles as "How it works", one line each; every one is measured on /accuracy. */}
          <ul className="mt-2 grid gap-x-10 sm:grid-cols-2">
            {STEPS.map((s) => (
              <li key={s.title}>
                <PendingLink
                  href="/accuracy"
                  className="-mx-2 inline-flex min-h-11 items-center rounded-(--r-ctl) px-2 py-1.5 text-[14.5px] leading-snug text-(--ink-2) hover:bg-(--wash) active:bg-(--hair)"
                >
                  <span>
                    <span className="font-semibold text-(--ink)">{s.title}</span> · {s.model} {s.role}
                  </span>
                </PendingLink>
              </li>
            ))}
          </ul>
          <p className="mt-1 max-w-[72ch] text-[13.5px] leading-[1.55] text-(--ink-3)">
            A campaign can run Verify on Muse Spark Open, Meta&rsquo;s open-weight model, served by Fireworks.
          </p>
        </section>
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-4 pt-8 pb-4 text-[14px] text-(--ink-3) sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="text-(--ink)">
              <Wordmark />
            </span>
            <span>Screen-Time by Aetrai · built Oct 28 – Nov 4, 2026 for the Meta Global AI Developer Hackathon</span>
          </span>
          <span className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3">
            <PendingLink href={JUDGE_HREF} className={footLink}>
              How to judge this in 5 minutes
            </PendingLink>
            <a href={`mailto:${CONTACT_EMAIL}`} className={footLink}>
              Contact: {CONTACT_EMAIL}
            </a>
            <a href={REPO} className={footLink}>
              Source on GitHub <ArrowUpRight className="size-4" strokeWidth={2.25} aria-hidden />
            </a>
          </span>
        </div>
        <div className="mx-auto w-full max-w-[1200px] px-4 pb-8 sm:px-6 lg:px-8">
          <DemoNote />
        </div>
      </footer>
    </>
  );
}

/** "Ash’s", "@maya.films’s". */
const possessive = (name: string) => `${name}’s`;

/** What the hero replay shows, from its own report: whose Reel, how long, what lime and violet mark, and any object
 *  Muse Spark rejected beside the product. */
function heroCaption(hero: Showcased, brand: string | undefined): string {
  const { report } = hero.video;
  const name = (t: (typeof report.tracks)[number]) => hero.names[t.objectId];
  const product = report.tracks.filter((t) => t.verdict === "match").map(name).find(Boolean);
  const rejected = report.tracks.filter((t) => t.verdict !== "match").map(name).find(Boolean);
  const reel = `${possessive(hero.video.creator)} ${Math.round(report.info.durationSec)}-second ${brand ? `${brand} ` : ""}Reel`;
  const parts = [
    `Lime fills only while ${product ? `the ${product}` : brand ? `the ${brand} product` : "the product"} is on screen`,
    report.metrics.mentions.length && brand ? `violet marks roughly when “${brand}” is said out loud` : null,
    rejected ? `the ${rejected} beside it is boxed, dashed and never counted` : null,
  ].filter(Boolean);
  return `A real run on Meta’s API, replayed: ${reel}. ${parts.join("; ")}.`;
}

/** Where the test videos came from and how the must-be-zero clips scored, from the measured data. */
function testSetLine(acc: ReturnType<typeof summarize>): string {
  const zero = [
    acc.lookalikeClips ? `${acc.lookalikeClips === 1 ? "a clip" : `${acc.lookalikeClips} clips`} with only a look-alike in shot` : null,
    acc.emptyClips ? `${acc.emptyClips === 1 ? "a clip" : `${acc.emptyClips} clips`} with no product at all` : null,
  ].filter(Boolean);
  const stock = acc.stockClips ? ` (${acc.stockClips} of them stock footage)` : "";
  if (!zero.length) return `The test set: ${acc.clips} labelled vertical videos${stock}.`;
  return `The test set: ${acc.clips} labelled vertical videos${stock}, including ${zero.join(" and ")}, which must count 0 seconds. Screen-Time counted ${tenths(acc.verified.falseSecondsOnEmptyClips)} s on them.`;
}

/** The sample rows, each linked to its report when the clip is a video in the LaCroix campaign; else not linked. */
async function linkedRows(): Promise<(SampleRow & { href?: string })[]> {
  return Promise.all(
    sampleRows(data).map(async (r) => {
      const id = clipVideoId(r.clip);
      const v = id ? await getVideo(LACROIX, id).catch(() => null) : null;
      return { ...r, href: v?.status === "done" ? reportHref(v.id) : undefined };
    }),
  );
}

const ROW_GRID =
  "grid grid-cols-[minmax(0,1fr)_24px] items-center gap-x-3 gap-y-3 px-4 py-4 md:grid-cols-[minmax(0,1fr)_96px_96px_96px_96px_32px] md:gap-x-4 md:px-5 md:py-3.5";

function RowBody({ r, linked = false }: { r: SampleRow; linked?: boolean }) {
  return (
    <>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-[15px] font-semibold">
            <span className="font-medium text-(--ink-3)">{clipLabel(r.clip)}</span> · {targetName(r.target)}
          </span>
          {r.weak && <WeakTag label={`Weakest ${r.weak}`} />}
        </span>
        {r.note && <span className="mt-0.5 block text-[13px] text-(--ink-3)">{r.note}</span>}
      </span>
      {linked ? <ChevronRight className="size-5 self-center text-(--ink-3) md:order-last" strokeWidth={2.25} aria-hidden /> : <span className="md:order-last" aria-hidden />}
      <dl className="col-span-2 grid grid-cols-4 gap-2 text-[12px] text-(--ink-3) md:col-span-4 md:col-start-2 md:row-start-1 md:grid-cols-subgrid md:gap-4">
        <Stat label="Labelled" value={`${tenths(r.truthSec)} s`} />
        <Stat label="Measured" value={`${tenths(r.predictedSec)} s`} strong />
        <Stat label="Precision" value={pct0(r.precision)} strong={r.weak === "precision"} />
        <Stat label="Recall" value={pct0(r.recall)} strong={r.weak === "recall"} />
      </dl>
    </>
  );
}

function Stat({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="md:text-right">
      <dt className="md:sr-only">{label}</dt>
      <dd className={`mt-0.5 text-[15px] text-(--ink) tabular md:mt-0 ${strong ? "font-semibold" : ""}`}>{value}</dd>
    </div>
  );
}

/** The weakest rows are called out in ink, not amber: amber means "needs review" everywhere else. */
function WeakTag({ label }: { label: string }) {
  return (
    <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-(--paper) px-2.5 text-[12px] font-semibold whitespace-nowrap text-(--ink) ring-1 ring-(--ink) ring-inset">
      {label}
    </span>
  );
}

function VerdictCard({ card: { show, track, name } }: { card: VerdictCardData }) {
  const match = track.verdict === "match";
  const crop = show.video.cropUrls?.[track.objectId];
  const label = match ? "Counted" : "Not counted";
  return (
    <li>
      <PendingLink
        href={show.href}
        hint="cover"
        className="ed-press-soft group relative grid h-full grid-cols-[104px_minmax(0,1fr)] gap-4 rounded-(--r-card) bg-(--card) p-3 shadow-(--sh-1) ring-1 ring-(--hair) hover:shadow-(--sh-2) active:bg-(--wash) sm:flex sm:flex-col sm:gap-0"
      >
        {/* The same frames as the report: a lime ring for the counted product, a dashed red frame for a look-alike. */}
        <span
          className={[
            "relative block aspect-[4/5] overflow-hidden rounded-[14px] bg-(--wash)",
            match ? "ring-[3px] ring-(--signal)" : "outline-2 outline-offset-2 outline-(--reject) outline-dashed",
          ].join(" ")}
        >
          {crop && (
            // eslint-disable-next-line @next/next/no-img-element -- stored stills, already small JPEGs
            <img src={crop} alt={name} className="size-full object-cover transition-transform duration-500 ease-(--ease-out) group-hover:scale-[1.03]" />
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col py-1 sm:px-2 sm:pt-4 sm:pb-1">
          <span
            className={[
              "inline-flex h-6 w-fit items-center rounded-full px-2.5 text-[12px] font-semibold",
              match
                ? "bg-(--ink) text-white"
                : "bg-(--card) text-(--reject) outline-[1.5px] -outline-offset-[1.5px] outline-(--reject) outline-dashed",
            ].join(" ")}
          >
            {label}
          </span>
          <span className="mt-2 block text-[16px] font-semibold">{name}</span>
          <span className="mt-1.5 block text-[14px] leading-[1.5] text-(--ink-2)">
            <span className="font-medium text-(--ink-3)">Muse Spark: </span>&ldquo;{track.reason}&rdquo;
          </span>
          <span className="mt-auto inline-flex items-center gap-1 pt-4 text-[13px] font-semibold text-(--ink)">
            See it in the report <ArrowRight className="size-3.5" strokeWidth={2.5} aria-hidden />
          </span>
        </span>
      </PendingLink>
    </li>
  );
}
