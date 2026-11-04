import type { CSSProperties } from "react";
import { ArrowRight, ArrowUpRight, AudioLines, FileCheck2, ScanSearch, ShieldCheck } from "lucide-react";
import data from "@/lib/accuracy-data.json";
import { loadShowcase, type Showcased } from "@/lib/campaign/showcase";
import { SAM_USD_PER_FRAME } from "@/lib/meta/cost-guard";
import { LiveReplay } from "@/components/ed/live-replay";
import { HowItWorks } from "@/components/ed/how-it-works";
import { PendingLink } from "@/components/ed/pending-link";
import { TrySample } from "@/components/ed/try-sample";
import { TopBar } from "@/components/ed/top-bar";
import { Wordmark } from "@/components/ed/bits";
import { DemoNote } from "@/components/ed/demo-note";
import { clipLabel, clipVideoId, labelProvenance, pct, sampleRows, sparkChanges, summarize } from "@/components/ed/accuracy-summary";
import { CheckAccuracy, type CheckReelView, type CheckRow } from "@/components/ed/check-player";
import { packBoxes } from "@/components/ed/check-player-data";
import { CHECK_REELS } from "@/components/ed/check-player-sources";
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
  { title: "The problem", text: "Brand deals come with rules: three seconds on screen, say the name, disclose the ad. By hand, someone scrubs every Reel, or nobody checks." },
  { title: "The creator link", text: "Aldo, who built Screen-Time, sends his own Reel through his creator link: no account, no password.", href: campaignHref },
  {
    title: "The live run",
    text: "SAM 3.1 tracks the can, Muse Spark checks each find against the product photo, Voice Transcribe listens, and every term of the contract is checked: a Poppi on the table is rejected as a look-alike.",
    href: reportHref(CASES.live),
  },
  { title: "Pay $300", text: "21.7 s on screen, LaCroix said, “this is an ad” out loud: all three terms met. Tap a term to play the moment that proves it.", href: reportHref(CASES.live) },
  { title: "A can nobody can confirm", text: "George’s can is tiny and blurred: Muse Spark can’t confirm it’s the right one, so nothing counts and the report asks a person to look.", href: reportHref("george") },
  { title: "The follow-up agent", text: "Peter never says it’s an ad. Muse Spark with tools drafts the note and a re-cut request; nothing is sent until you approve.", href: reportHref(CASES.agent) },
  { title: "The other take", text: "Ash’s first take never says LaCroix, so the fee is held; her other take says it, is checked again, and pays.", href: reportHref(CASES.firstTake) },
  { title: "The campaign", text: "Pay or hold for every creator, with dollar totals and a CSV for finance. Screen-Time never moves money.", href: campaignHref },
  { title: "Check it yourself", text: "Precision and recall per frame against labels a person checked, with the labels and Screen-Time’s count playing side by side.", href: "/accuracy" },
  { title: "Built during the hackathon", text: "The pipeline, the contract checker, the follow-up agent and the accuracy harness, all open source, at cents a Reel." },
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
  const [heroCampaign, lacroix, check, lacroixVideos] = await Promise.all([
    !hero ? null : hero.video.campaignId === LACROIX ? lacroixRead : getCampaign(hero.video.campaignId).catch(() => null),
    lacroixRead,
    checkData(),
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
            {/* Desktop: rides beside the steps, centred in the viewport below the 57px header (never higher than 24px under it). */}
            <figure className="min-w-0 lg:sticky lg:top-[max(81px,calc(50vh-140px))] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
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

            <div className="mt-12 lg:mt-14">
              <HowItWorks />
            </div>
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
            {/* Left: the claim and where the labels came from. Right: the figures, read top to bottom. Every number is
                computed from accuracy-data.json, the cost guard or the hero run's own report. */}
            <div className="grid gap-x-16 gap-y-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)] lg:items-start">
              <div>
                <h2 className="ed-display max-w-[16ch] text-[34px] leading-[1.04] sm:text-[44px]">Measured frame by frame on {acc.clips} test Reels.</h2>
                <p className="mt-5 max-w-[40ch] text-[19px] leading-[1.45] text-(--ink-2) sm:text-[21px]">
                  Screen-Time&rsquo;s count against the labels, per frame, on the {acc.clips} Reels as delivered on this site.
                  {acc.multiProductClips > 0 && ` ${acc.multiProductClips} of the videos show more than one product, and each product is checked on its own.`}
                </p>
                {labelLine && <p className="mt-4 max-w-[52ch] text-[15px] leading-[1.6] text-(--ink-3)">{labelLine}</p>}
                <PendingLink href="/accuracy" className={`${textLink} mt-4 text-[15px]`}>
                  How it was measured, and where it is wrong <ArrowRight className="size-4" strokeWidth={2.25} aria-hidden />
                </PendingLink>
              </div>

              <div className="rounded-(--r-card) bg-(--paper) ring-1 ring-(--hair)">
                <dl className="grid grid-cols-2 gap-4 px-5 pt-6 pb-5 sm:px-7 sm:pt-7">
                  <div>
                    <dt className="text-[13px] font-medium text-(--ink-3)">Precision per frame</dt>
                    <dd className="ed-num mt-1 text-[44px] leading-none sm:text-[56px]">{pct(acc.verified.precision)}</dd>
                  </div>
                  <div>
                    <dt className="text-[13px] font-medium text-(--ink-3)">Recall per frame</dt>
                    <dd className="ed-num mt-1 text-[44px] leading-none sm:text-[56px]">{pct(acc.verified.recall)}</dd>
                  </div>
                </dl>

                <div className="border-t border-(--hair) px-5 py-5 sm:px-7">
                  <table className="w-full text-[14px] tabular-nums">
                    <caption className="mb-2 text-left text-[13px] font-semibold text-(--ink)">SAM 3.1 alone vs + Muse Spark</caption>
                    <thead>
                      <tr className="text-[12px] text-(--ink-3)">
                        <th scope="col" className="py-1 text-left font-medium">
                          <span className="sr-only">Score</span>
                        </th>
                        <th scope="col" className="py-1 text-right font-medium">SAM 3.1 alone</th>
                        <th scope="col" className="py-1 pl-4 text-right font-medium">+ Muse Spark</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-(--hair)">
                      <tr>
                        <th scope="row" className="py-2 text-left font-medium text-(--ink-2)">Precision</th>
                        <td className="py-2 text-right text-(--ink-2)">{pct(acc.sam.precision)}</td>
                        <td className="py-2 pl-4 text-right font-semibold">{pct(acc.verified.precision)}</td>
                      </tr>
                      <tr>
                        <th scope="row" className="py-2 text-left font-medium text-(--ink-2)">Recall</th>
                        <td className="py-2 text-right text-(--ink-2)">{pct(acc.sam.recall)}</td>
                        <td className="py-2 pl-4 text-right font-semibold">{pct(acc.verified.recall)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <p className="mt-3 text-[14px] leading-[1.55] text-(--ink-2)">
                    Alone, a look-alike counts as the brand&rsquo;s product.
                    {unconfirmed.length > 0 &&
                      ` Recall is lower with Muse Spark because on ${unconfirmed.map((c) => `${clipLabel(c.clip)}’s Reel`).join(" and ")} it could not confirm the product SAM 3.1 tracked, so it was not counted and the report flags it.`}
                  </p>
                </div>

                <div className="border-t border-(--hair) px-5 pt-5 pb-6 sm:px-7">
                  <p className="text-[13px] font-semibold text-(--ink)">What a check costs</p>
                  {hero && (
                    <p className="mt-2 text-[14px] leading-[1.55] text-(--ink-2)">
                      <span className="ed-num mr-1.5 text-[24px] leading-none text-(--ink)">${hero.video.report.cost.usd.toFixed(3)}</span>
                      for the whole check of {possessive(hero.video.creator)} {heroSec}-second Reel, with Muse Spark and Voice Transcribe (
                      {hero.video.report.cost.samFrames} frames).
                    </p>
                  )}
                  <p className="mt-2 text-[14px] leading-[1.55] font-medium text-(--ink)">
                    The demo is free. Checking one video costs about $0.10–0.25 in Meta API fees.
                  </p>
                  <p className="mt-1 text-[13px] leading-[1.55] text-(--ink-3)">
                    SAM 3.1 tracking costs ${(SAM_USD_PER_FRAME * 1000).toFixed(2)} per 1,000 frames.
                  </p>
                </div>
              </div>
            </div>

            <h3 className="mt-16 text-[20px] leading-tight font-semibold sm:text-[22px]">Check it yourself</h3>
            <p className="mt-2 max-w-[64ch] text-[15px] leading-[1.6] text-(--ink-2)">
              Play a Reel and watch the person&rsquo;s labels and Screen-Time&rsquo;s count run side by side, frame by frame. Pick any row
              below to load its Reel.
            </p>
            <CheckAccuracy reels={check.reels} rows={check.rows} initialClip={CHECK_FIRST} />

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
            A campaign can run Verify on Muse Spark Open, Meta&rsquo;s open-weight model, served by Together through OpenRouter.
          </p>
        </section>
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-4 pt-8 pb-4 text-[14px] text-(--ink-3) sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="text-(--ink)">
              <Wordmark />
            </span>
            <span>Screen-Time by Aldo Tile · built Oct 28 – Nov 4, 2026 for the Meta Global AI Developer Hackathon</span>
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

/** The sample rows, each linked to its report when the clip is a video in the LaCroix campaign, and the check player's
 *  Reels for those rows: the per-frame marks from the label file and the scored run (built at build time), the stored
 *  normalized video and still, and SAM's boxes when the stored report is that same run. A missing video leaves the
 *  Reel playable as strips over its still; a missing store leaves the rows as they were. */
async function checkData(): Promise<{ rows: CheckRow[]; reels: CheckReelView[] }> {
  const sampled = await Promise.all(
    sampleRows(data).map(async (r) => {
      const id = clipVideoId(r.clip);
      const v = id ? await getVideo(LACROIX, id).catch(() => null) : null;
      return { row: { ...r, href: v?.status === "done" ? reportHref(v.id) : undefined }, video: v };
    }),
  );
  const reels = sampled.flatMap(({ row, video }) => {
    const reel = CHECK_REELS.find((c) => c.clip === row.clip && c.target === row.target);
    if (!reel) return [];
    const ready = video?.status === "done" && video.videoUrl ? video : null;
    const sameRun = !!ready?.report && ready.report.receipt?.runId === reel.runId;
    return [
      {
        clip: reel.clip,
        target: reel.target,
        marks: reel.marks,
        precision: reel.precision,
        recall: reel.recall,
        videoUrl: ready?.videoUrl,
        poster: video?.thumbUrl,
        width: ready?.report?.info.width ?? 540,
        height: ready?.report?.info.height ?? 960,
        boxes: sameRun ? packBoxes(ready!.report!.detections) : [],
      } satisfies CheckReelView,
    ];
  });
  return { rows: sampled.map((s) => s.row), reels };
}

/** The Reel the check player opens on: Michael's, the weakest precision, so its over-count is the first thing shown. */
const CHECK_FIRST = "lacroix/lc-1-michael";

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
