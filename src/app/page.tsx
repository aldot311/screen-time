import { ArrowRight, ArrowUpRight, AudioLines, ChevronRight, FileCheck2, ScanSearch, ShieldCheck } from "lucide-react";
import { loadShowcase, SHOWCASE_CAMPAIGN, type Showcased } from "@/lib/campaign/showcase";
import { LiveReplay } from "@/components/ed/live-replay";
import { PendingLink } from "@/components/ed/pending-link";
import { TrySample } from "@/components/ed/try-sample";
import { TopBar } from "@/components/ed/top-bar";
import { Wordmark } from "@/components/ed/bits";
import { getCampaign, getVideo } from "@/lib/campaign/store";
import { tenths } from "@/components/format";

export const dynamic = "force-dynamic";

const REPO = "https://github.com/aldot311/screen-time";

const STEPS = [
  {
    icon: ScanSearch,
    model: "Meta SAM 3.1",
    title: "Track",
    text: "Finds every can, cup or sneaker in every frame from a two-word prompt.",
    extra: "If the word finds nothing, Muse Spark looks at the video and suggests a better one.",
    extraLabel: "Prompt recovery.",
  },
  {
    icon: ShieldCheck,
    model: "Muse Spark",
    title: "Verify",
    text: "Looks at crops of each object and throws out anything that is not your exact product.",
    extra: "Add a product photo and it compares each find with the photo too, not only your description.",
    extraLabel: "Product photo.",
  },
  {
    icon: AudioLines,
    model: "Muse Voice Transcribe",
    title: "Listen",
    text: "Marks the second the creator says your brand name out loud, and whether they said it’s an ad.",
  },
  {
    icon: FileCheck2,
    model: "Muse Spark + rules",
    title: "Check",
    text: "Turns contract terms written in plain English into rules, and checks each one to the frame.",
  },
];

// A sample of docs/ACCURACY.md, the weakest rows included on purpose. Each row is one product check (a target) and
// opens the report it came from, named the way the report names it. "Measured" is read from that stored report and
// floored to tenths like every figure in the app; the values here are the fallback when a store lacks the run.
const SAMPLE = [
  { clip: "clip02", target: "Alani Nu can", campaign: "alani-nu-test-runs", truth: "12.0", measured: "12.0", precision: "100%", recall: "100%" },
  { clip: "clip12", target: "Alani Nu can", note: "A Stanley tumbler beside it", campaign: "alani-nu-test-runs", truth: "9.8", measured: "10.2", precision: "95%", recall: "100%" },
  { clip: "clip07", target: "Stanley tumbler", note: "Stanley test run, with the 3-term contract", campaign: "stanley-test-runs", truth: "11.0", measured: "11.3", precision: "96%", recall: "99%" },
  { clip: "clip01", target: "Alani Nu can", note: "The can leaves the frame", campaign: "alani-nu-test-runs", truth: "4.0", measured: "4.8", precision: "79%", recall: "97%", weak: "precision" },
  { clip: "clip15", target: "Stanley tumbler", note: "An Alani can in the same shot", campaign: "stanley-test-runs", truth: "3.4", measured: "2.6", precision: "97%", recall: "75%", weak: "recall" },
  { clip: "clip08", target: "New Balance sneaker", campaign: "new-balance-test-runs", truth: "1.6", measured: "1.4", precision: "100%", recall: "92%" },
  { clip: "clip05", target: "Alani Nu can", note: "Only a look-alike in shot, must count 0", campaign: "alani-nu-test-runs", truth: "0.0", measured: "0.0", precision: "–", recall: "–" },
] as const;

const btnPrimary =
  "inline-flex h-14 items-center justify-center gap-2 rounded-full bg-(--ink) px-7 text-[16px] font-semibold text-white shadow-(--sh-2) hover:bg-black active:bg-black/80 lg:px-6";
// A text link on a phone (so the replay stays on the first screen), a button from sm up.
const btnSecondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full text-[15px] font-semibold text-(--ink) underline decoration-(--hair-2) decoration-2 underline-offset-4 active:bg-(--wash) sm:h-14 sm:bg-(--card) sm:px-7 sm:text-[16px] sm:no-underline sm:shadow-(--sh-1) sm:ring-1 sm:ring-(--hair) sm:hover:ring-(--hair-2) lg:px-6";
const navLink =
  "ed-press hidden h-10 items-center rounded-full px-3.5 text-[14px] font-semibold text-(--ink-2) hover:bg-(--wash) hover:text-(--ink) active:bg-(--hair) md:inline-flex";

export default async function Landing() {
  const { hero, lookalike } = await loadShowcase();
  // The campaign with money, the product photo and receipts, when this store has it; else the hero's own campaign.
  const showcaseCampaign = (await getCampaign(SHOWCASE_CAMPAIGN).catch(() => null)) ? SHOWCASE_CAMPAIGN : hero?.video.campaignId;
  // Lead with the clear case (another brand's tumbler in clip12), then the counted can, then the blurred can Muse
  // Spark judged a different Alani flavor.
  const verdicts = [
    ...(hero ? hero.video.report.tracks.map((t) => ({ show: hero, track: t })) : []),
    ...(lookalike ? lookalike.video.report.tracks.map((t) => ({ show: lookalike, track: t })) : []),
  ].sort((a, b) => rank(a) - rank(b));
  const rows = await measuredRows();

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
            <h1 className="ed-display max-w-[11ch] text-[42px] leading-[0.96] sm:text-[72px] lg:text-[84px]">
              Proof your product was{" "}
              <span className="relative inline-block">
                {/* The one brand use of lime: the word that means "on screen", marked the way the strip marks it. */}
                <span className="absolute inset-x-[-0.05em] top-[0.18em] bottom-[0.02em] rounded-[0.12em] bg-(--signal)" aria-hidden />
                <span className="relative">seen.</span>
              </span>
            </h1>
            <p className="mt-4 max-w-[48ch] text-[16px] leading-[1.55] text-(--ink-2) sm:mt-6 sm:text-[19px] sm:leading-[1.6]">
              <span className="hidden sm:inline">Brands pay creators for screen time they cannot check. </span>
              Screen-Time watches every frame of a sponsored video with Meta SAM 3.1, rejects look-alikes with Muse Spark,
              hears your brand with Muse Voice Transcribe, and checks the contract to the second.
            </p>
          </div>


          <div className="min-w-0 lg:col-start-1 lg:row-start-2 lg:self-start lg:pt-8">
            <div className="flex flex-col items-stretch gap-1 sm:flex-row sm:flex-wrap sm:gap-3">
              <TrySample className={btnPrimary} label="Run it on a sample video" />
              <PendingLink href={hero?.href ?? "/campaigns"} className={btnSecondary}>
                Open a real report
              </PendingLink>
            </div>
            <p className="mt-2 text-[13px] text-(--ink-3)">The real pipeline, live, on a 12-second Reel. No password needed.</p>
            <p className="mt-5 hidden text-[14px] text-(--ink-3) sm:block">
              <a href="#accuracy" className="ed-press -mx-2 inline-flex min-h-11 items-center rounded-full px-2 hover:text-(--ink) active:bg-(--wash)">
                <span>
                  <span className="font-semibold text-(--ink) tabular">97.7%</span> precision ·{" "}
                  <span className="font-semibold text-(--ink) tabular">95.6%</span> recall per frame on real test videos
                </span>
              </a>
            </p>
          </div>

          {hero && (
            <figure className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center">
              <LiveReplay
                report={hero.video.report}
                videoUrl={hero.video.videoUrl}
                poster={hero.video.thumbUrl}
                cropUrls={hero.video.cropUrls}
                names={hero.names}
              />
              <figcaption className="mt-4 px-1 text-[13px] leading-[1.55] text-(--ink-3)">
                A real run on Meta&rsquo;s API, replayed. Lime fills only while the Alani can is on screen; the Stanley
                tumbler beside it is boxed, dashed and never counted.
              </figcaption>
            </figure>
          )}
        </section>

        <section id="how" className="scroll-mt-20 border-t border-(--hair) bg-(--card)">
          <div className="mx-auto w-full max-w-[1200px] px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
            <div className="grid gap-x-14 gap-y-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-start">
              <h2 className="ed-display max-w-[20ch] text-[34px] leading-[1.04] sm:text-[44px]">
                Three Meta models, four checks, one verdict per creator.
              </h2>
              <div className="space-y-3 text-[16px] leading-[1.6] text-(--ink-2) lg:pt-1.5">
                <p>Add a creator&rsquo;s video and say what your product looks like. Every number in the report links to the second that proves it.</p>
                <p className="text-[14.5px] text-(--ink-3)">
                  Brands upload the file the creator delivered, or ask the creator to send it. Platforms don&rsquo;t let
                  third parties download creator videos.
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

        {verdicts.length > 0 && (
          <section className="border-t border-(--hair)">
            <div className="mx-auto w-full max-w-[1200px] px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
              <div className="grid gap-x-14 gap-y-10 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start">
                <div className="lg:sticky lg:top-24">
                  <h2 className="ed-display max-w-[16ch] text-[34px] leading-[1.04] sm:text-[44px]">It knows your can from the one next to it.</h2>
                  <p className="mt-4 max-w-[58ch] text-[16px] leading-[1.6] text-(--ink-2)">
                    Counting every can in the shot would pay a creator for someone else&rsquo;s product. Muse Spark checks
                    each object SAM finds against your description, and says why in words you can check.
                  </p>
                </div>
                <ul className="grid gap-4 sm:grid-cols-3">
                  {verdicts.map(({ show, track }) => (
                    <VerdictCard key={`${show.video.id}-${track.objectId}`} show={show} track={track} />
                  ))}
                </ul>
              </div>
            </div>
          </section>
        )}

        <section id="accuracy" className="scroll-mt-20 border-t border-(--hair) bg-(--card)">
          <div className="mx-auto w-full max-w-[1200px] px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
            <h2 className="ed-display max-w-[22ch] text-[34px] leading-[1.04] sm:text-[44px]">Measured frame by frame against checked labels.</h2>
            <p className="mt-5 max-w-[44ch] text-[21px] leading-[1.4] text-(--ink-2) sm:text-[24px]">
              <span className="ed-num text-(--ink)">97.7%</span> precision and <span className="ed-num text-(--ink)">95.6%</span>{" "}
              recall per frame, over 23 product checks on 20 labeled test videos.
            </p>
            <p className="mt-3 max-w-[64ch] text-[15px] leading-[1.6] text-(--ink-3)">
              Three of the videos show two products, and each product is checked on its own. SAM 3.1 tracking costs
              $0.20 per 1,000 frames; a whole check of a 12-second Reel, with Muse Spark and Voice Transcribe, costs about
              $0.10 (clip12: 174 frames, $0.105). Priced at $2–5 per verified video, the model cost is under 5% of the price.
            </p>
            <p className="mt-3 max-w-[64ch] text-[15px] leading-[1.6] text-(--ink-2)">
              Without Muse Spark, SAM 3.1 alone scores 89.0% precision: a can of a different flavor counts as the brand&rsquo;s. With it, 97.7%,
              and the average error per video falls from 0.91 s to 0.33 s.{" "}
              <PendingLink
                href="/accuracy"
                className="ed-press inline-flex min-h-11 items-center gap-1 rounded-full font-semibold text-(--ink) underline decoration-(--hair-2) decoration-2 hover:decoration-(--ink) active:opacity-70"
              >
                How it was measured, and where it is wrong <ArrowRight className="size-4" strokeWidth={2.25} aria-hidden />
              </PendingLink>
            </p>

            <div className="mt-10 overflow-hidden rounded-(--r-card) bg-(--paper) ring-1 ring-(--hair)">
              <div
                className="hidden grid-cols-[minmax(0,1fr)_96px_96px_96px_96px_32px] gap-4 border-b border-(--hair) px-5 py-3.5 text-[13px] font-medium text-(--ink-3) md:grid"
                aria-hidden
              >
                <span>Product check</span>
                <span className="text-right">Labeled</span>
                <span className="text-right">Measured</span>
                <span className="text-right">Precision</span>
                <span className="text-right">Recall</span>
                <span />
              </div>
              <ul className="divide-y divide-(--hair)">
                {rows.map((r) => (
                  <li key={`${r.clip}-${r.target}`}>
                    <PendingLink
                      href={`/campaigns/${r.campaign}/videos/${r.clip}`}
                      hint="cover"
                      className="ed-press-soft relative grid grid-cols-[minmax(0,1fr)_24px] items-center gap-x-3 gap-y-3 px-4 py-4 hover:bg-(--wash)/60 active:bg-(--wash) md:grid-cols-[minmax(0,1fr)_96px_96px_96px_96px_32px] md:gap-x-4 md:px-5 md:py-3.5"
                    >
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="text-[15px] font-semibold">
                            <span className="font-medium text-(--ink-3) tabular">{r.clip}</span> · {r.target} target
                          </span>
                          {"weak" in r && <WeakTag label={`Weakest ${r.weak}`} />}
                        </span>
                        {"note" in r && <span className="mt-0.5 block text-[13px] text-(--ink-3)">{r.note}</span>}
                      </span>
                      <ChevronRight className="size-5 self-center text-(--ink-3) md:order-last" strokeWidth={2.25} aria-hidden />
                      <dl className="col-span-2 grid grid-cols-4 gap-2 text-[12px] text-(--ink-3) md:col-span-4 md:col-start-2 md:row-start-1 md:grid-cols-subgrid md:gap-4">
                        <Stat label="Labeled" value={`${r.truth} s`} />
                        <Stat label="Measured" value={`${r.measured} s`} strong />
                        <Stat label="Precision" value={r.precision} strong={"weak" in r && r.weak === "precision"} />
                        <Stat label="Recall" value={r.recall} strong={"weak" in r && r.weak === "recall"} />
                      </dl>
                    </PendingLink>
                  </li>
                ))}
              </ul>
            </div>

            <p className="mt-6 max-w-[72ch] text-[15px] leading-[1.6] text-(--ink-2)">
              The test videos: 15 filmed with real products and 5 stock, including a look-alike can that must be rejected
              (clip05) and a video with no product at all (clip09). Both scored 0 seconds, as they should.{" "}
              <a
                href={`${REPO}/blob/main/docs/ACCURACY.md`}
                className="ed-press inline-flex min-h-11 items-center gap-1 rounded-full font-semibold text-(--ink) underline decoration-(--hair-2) decoration-2 hover:decoration-(--ink) active:opacity-70"
              >
                All 23 results <ArrowUpRight className="size-4" strokeWidth={2.25} aria-hidden />
              </a>
            </p>
          </div>
        </section>

        <section className="bg-(--ink) text-white">
          <div className="mx-auto w-full max-w-[1200px] px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
            <h2 className="ed-display max-w-[20ch] text-[34px] leading-[1.04] sm:text-[48px]">See it on twelve real test videos.</h2>
            <p className="mt-3 max-w-[52ch] text-[16px] leading-[1.6] text-white/70">
              One Alani Nu campaign with a $300 fee and the product photo: every video with its verdict, what it pays or
              holds, its seconds on screen and the moment that proves every
              term.
            </p>
            <PendingLink
              href={showcaseCampaign ? `/campaigns/${showcaseCampaign}` : "/campaigns"}
              className="mt-8 inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-white px-7 text-[16px] font-semibold text-(--ink) shadow-(--sh-2) hover:bg-(--paper) active:bg-(--wash) sm:w-auto"
            >
              {showcaseCampaign ? "Open the Alani Nu campaign" : "Open the app"} <ArrowRight className="size-[18px]" strokeWidth={2.25} aria-hidden />
            </PendingLink>
          </div>
        </section>
      </main>

      <footer className="border-t border-(--hair) pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-4 py-8 text-[14px] text-(--ink-3) sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="text-(--ink)">
              <Wordmark />
            </span>
            <span>Screen-Time by Aetrai · Meta Global AI Developer Hackathon 2026</span>
          </span>
          <a
            href={REPO}
            className="ed-press -mx-3 inline-flex h-11 items-center gap-1 self-start rounded-full px-3 font-semibold text-(--ink-2) hover:bg-(--wash) hover:text-(--ink) active:bg-(--hair) sm:self-auto"
          >
            Source on GitHub <ArrowUpRight className="size-4" strokeWidth={2.25} aria-hidden />
          </a>
        </div>
      </footer>
    </>
  );
}

/** What Muse Spark actually said about the blurred can in clip05: a different Alani flavor, not the Peach can. */
const CARD_NAMES: Record<string, string> = { "clip05-0": "Different Alani flavor (not Peach)" };

function rank({ show, track }: { show: Showcased; track: Showcased["video"]["report"]["tracks"][number] }): number {
  if (show.video.id === "clip12") return track.verdict === "match" ? 1 : 0;
  return 2;
}

/** The sample rows with "Measured" read from each stored report (floored to tenths), falling back to the doc values. */
async function measuredRows() {
  return Promise.all(
    SAMPLE.map(async (r) => {
      const v = await getVideo(r.campaign, r.clip).catch(() => null);
      const sec = v?.status === "done" ? v.report?.metrics.secondsOnScreen : undefined;
      return { ...r, measured: sec === undefined ? r.measured : tenths(sec) };
    }),
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

function VerdictCard({ show, track }: { show: Showcased; track: Showcased["video"]["report"]["tracks"][number] }) {
  const match = track.verdict === "match";
  const crop = show.video.cropUrls?.[track.objectId];
  const name = CARD_NAMES[`${show.video.id}-${track.objectId}`] ?? show.names[track.objectId] ?? "Tracked object";
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
                ? "bg-(--signal) text-(--signal-ink)"
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
