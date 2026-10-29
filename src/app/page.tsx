import { ArrowRight, ArrowUpRight, AudioLines, FileCheck2, ScanSearch, ShieldCheck } from "lucide-react";
import { loadShowcase, type Showcased } from "@/lib/campaign/showcase";
import { LiveReplay } from "@/components/ed/live-replay";
import { PendingLink } from "@/components/ed/pending-link";
import { TopBar } from "@/components/ed/top-bar";
import { Wordmark } from "@/components/ed/bits";

export const dynamic = "force-dynamic";

const REPO = "https://github.com/aldot311/screen-time";

const STEPS = [
  {
    icon: ScanSearch,
    model: "Meta SAM 3.1",
    title: "Track",
    text: "Finds every can, cup or sneaker in every frame from a two-word prompt.",
    extra: "If the word finds nothing, Muse Spark looks at the video and suggests a better one.",
  },
  {
    icon: ShieldCheck,
    model: "Muse Spark",
    title: "Verify",
    text: "Looks at crops of each object and throws out anything that is not your exact product.",
  },
  {
    icon: AudioLines,
    model: "Muse Voice Transcribe",
    title: "Listen",
    text: "Marks the second the creator says your brand name out loud.",
  },
  {
    icon: FileCheck2,
    model: "Muse Spark + rules",
    title: "Check",
    text: "Turns contract terms written in plain English into rules, and checks each one to the frame.",
  },
];

// A sample of docs/ACCURACY.md, the weakest rows included on purpose.
const SAMPLE = [
  { clip: "clip02", product: "Alani Nu can", truth: "12.0", measured: "12.0", precision: "100%", recall: "100%" },
  { clip: "clip12", product: "Alani Nu can, tumbler beside it", truth: "9.8", measured: "10.3", precision: "95%", recall: "100%" },
  { clip: "clip07", product: "Stanley tumbler", truth: "11.0", measured: "11.3", precision: "96%", recall: "99%" },
  { clip: "clip01", product: "Alani Nu can leaving the frame", truth: "4.0", measured: "4.9", precision: "79%", recall: "97%", weak: "Weakest precision" },
  { clip: "clip15", product: "Stanley tumbler", truth: "3.4", measured: "2.6", precision: "97%", recall: "75%", weak: "Weakest recall" },
  { clip: "clip08", product: "New Balance sneaker", truth: "1.6", measured: "1.5", precision: "100%", recall: "92%" },
  { clip: "clip05", product: "Look-alike can, must not count", truth: "0.0", measured: "0.0", precision: "–", recall: "–" },
];

const btnPrimary =
  "inline-flex h-14 items-center justify-center gap-2 rounded-full bg-(--ink) px-7 text-[16px] font-semibold text-white shadow-(--sh-2) hover:bg-black active:bg-black/80 lg:px-6";
const btnSecondary =
  "inline-flex h-14 items-center justify-center gap-2 rounded-full bg-(--card) px-7 text-[16px] font-semibold shadow-(--sh-1) ring-1 ring-(--hair) hover:ring-(--hair-2) active:bg-(--wash) lg:px-6";
const navLink =
  "ed-press hidden h-10 items-center rounded-full px-3.5 text-[14px] font-semibold text-(--ink-2) hover:bg-(--wash) hover:text-(--ink) active:bg-(--hair) md:inline-flex";

export default async function Landing() {
  const { hero, lookalike } = await loadShowcase();
  const verdicts = [
    ...(hero ? hero.video.report.tracks.map((t) => ({ show: hero, track: t })) : []),
    ...(lookalike ? lookalike.video.report.tracks.map((t) => ({ show: lookalike, track: t })) : []),
  ];

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
        <section className="mx-auto grid w-full max-w-[1200px] items-center gap-x-14 gap-y-9 px-4 pt-7 pb-14 sm:px-6 lg:grid-cols-[minmax(0,1fr)_600px] lg:px-8 lg:pt-14 lg:pb-24">
          <div className="min-w-0">
            <h1 className="ed-display max-w-[11ch] text-[46px] leading-[0.96] sm:text-[72px] lg:text-[84px]">
              Proof your product was{" "}
              <span className="relative inline-block">
                {/* The one brand use of lime: the word that means "on screen", marked the way the strip marks it. */}
                <span className="absolute inset-x-[-0.05em] top-[0.18em] bottom-[0.02em] rounded-[0.12em] bg-(--signal)" aria-hidden />
                <span className="relative">seen.</span>
              </span>
            </h1>
            <p className="mt-5 max-w-[48ch] text-[17px] leading-[1.6] text-(--ink-2) sm:mt-6 sm:text-[19px]">
              Brands pay creators for screen time they cannot check. Screen-Time watches every frame of a sponsored video
              with Meta SAM 3.1, rejects look-alikes with Muse Spark, hears your brand with Muse Voice Transcribe, and
              checks the contract to the second.
            </p>
            <div className="mt-7 grid gap-3 sm:mt-8 sm:flex sm:flex-wrap">
              <PendingLink href={hero?.href ?? "/campaigns"} className={btnPrimary}>
                Open a real report <ArrowRight className="size-[18px]" strokeWidth={2.25} aria-hidden />
              </PendingLink>
              <PendingLink href="/campaigns" className={btnSecondary}>
                See every campaign
              </PendingLink>
            </div>
            <p className="mt-6 text-[14px] text-(--ink-3)">
              <a href="#accuracy" className="ed-press -mx-2 inline-flex min-h-11 items-center rounded-full px-2 hover:text-(--ink) active:bg-(--wash)">
                <span>
                  <span className="font-semibold text-(--ink) tabular">97.7%</span> precision ·{" "}
                  <span className="font-semibold text-(--ink) tabular">95.6%</span> recall per frame on real test clips
                </span>
              </a>
            </p>
          </div>

          {hero && (
            <figure className="-mx-1.5 min-w-0 sm:mx-0">
              <LiveReplay
                report={hero.video.report}
                videoUrl={hero.video.videoUrl}
                cropUrls={hero.video.cropUrls}
                names={hero.names}
              />
              <figcaption className="mt-4 px-2.5 text-[13px] leading-[1.55] text-(--ink-3) sm:px-1">
                A real run on Meta&rsquo;s API, replayed. Lime fills only while the Alani can is on screen; the Stanley
                tumbler beside it is boxed, dashed and never counted.
              </figcaption>
            </figure>
          )}
        </section>

        <section id="how" className="scroll-mt-20 border-t border-(--hair) bg-(--card)">
          <div className="mx-auto w-full max-w-[1200px] px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
            <div className="grid gap-x-14 gap-y-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-end">
              <h2 className="ed-display max-w-[20ch] text-[34px] leading-[1.04] sm:text-[44px]">
                Three Meta models, four checks, one verdict per creator.
              </h2>
              <div className="space-y-3 text-[16px] leading-[1.6] text-(--ink-2)">
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
                    <p className="mt-1 text-[13px] font-semibold text-(--voice)">{s.model}</p>
                    <p className="mt-2 text-[15px] leading-[1.55] text-(--ink-2)">{s.text}</p>
                    {s.extra && (
                      <p className="mt-2 text-[14px] leading-[1.5] text-(--ink-3)">
                        <span className="font-semibold text-(--ink-2)">Prompt recovery.</span> {s.extra}
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
            <h2 className="ed-display max-w-[22ch] text-[34px] leading-[1.04] sm:text-[44px]">Measured frame by frame against hand-checked labels.</h2>
            <p className="mt-5 max-w-[40ch] text-[21px] leading-[1.4] text-(--ink-2) sm:text-[24px]">
              <span className="ed-num text-(--ink)">97.7%</span> precision and <span className="ed-num text-(--ink)">95.6%</span>{" "}
              recall per frame across 23 clip and product targets, at <span className="ed-num text-(--ink)">$0.20</span> per
              1,000 frames tracked.
            </p>

            {/* Phone: one row per clip, measured against labelled, no sideways scrolling. */}
            <ul className="mt-10 divide-y divide-(--hair) rounded-(--r-card) bg-(--paper) px-4 ring-1 ring-(--hair) md:hidden">
              {SAMPLE.map((r) => (
                <li key={r.clip} className="py-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0">
                      <span className="ed-tc text-[13px] text-(--ink-3)">{r.clip}</span>
                      <span className="block text-[15px] font-semibold leading-snug">{r.product}</span>
                    </span>
                    {r.weak && <WeakTag label={r.weak} />}
                  </div>
                  <dl className="mt-3 grid grid-cols-4 gap-2 text-[12px] text-(--ink-3)">
                    <Stat label="Labelled" value={`${r.truth} s`} />
                    <Stat label="Measured" value={`${r.measured} s`} />
                    <Stat label="Precision" value={r.precision} />
                    <Stat label="Recall" value={r.recall} />
                  </dl>
                </li>
              ))}
            </ul>

            {/* Wider screens: the table. */}
            <div className="mt-12 hidden overflow-hidden rounded-(--r-card) bg-(--paper) ring-1 ring-(--hair) md:block">
              <table className="w-full text-left text-[15px]">
                <thead className="border-b border-(--hair) text-[13px] text-(--ink-3)">
                  <tr>
                    <th className="px-5 py-3.5 font-medium">Clip</th>
                    <th className="px-5 py-3.5 font-medium">Product</th>
                    <th className="px-5 py-3.5 text-right font-medium">Labelled</th>
                    <th className="px-5 py-3.5 text-right font-medium">Measured</th>
                    <th className="px-5 py-3.5 text-right font-medium">Precision</th>
                    <th className="px-5 py-3.5 text-right font-medium">Recall</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-(--hair)">
                  {SAMPLE.map((r) => (
                    <tr key={r.clip}>
                      <td className="ed-tc px-5 py-3.5 text-[13px] text-(--ink-3)">{r.clip}</td>
                      <td className="px-5 py-3.5">
                        <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="font-medium">{r.product}</span>
                          {r.weak && <WeakTag label={r.weak} />}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right tabular">{r.truth} s</td>
                      <td className="px-5 py-3.5 text-right font-semibold tabular">{r.measured} s</td>
                      <td className={`px-5 py-3.5 text-right tabular ${r.weak === "Weakest precision" ? "font-semibold text-(--review)" : ""}`}>{r.precision}</td>
                      <td className={`px-5 py-3.5 text-right tabular ${r.weak === "Weakest recall" ? "font-semibold text-(--review)" : ""}`}>{r.recall}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-6 max-w-[72ch] text-[15px] leading-[1.6] text-(--ink-2)">
              21 vertical clips: 15 filmed with real products, 6 stock, including a look-alike can that must be rejected and
              a clip with no product at all. Both scored 0 seconds, as they should.{" "}
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
          <div className="mx-auto flex w-full max-w-[1200px] flex-col items-start gap-8 px-4 py-16 sm:px-6 lg:flex-row lg:items-end lg:justify-between lg:px-8 lg:py-20">
            <div>
              <h2 className="ed-display max-w-[18ch] text-[34px] leading-[1.04] sm:text-[48px]">See it on real creator videos.</h2>
              <p className="mt-3 max-w-[48ch] text-[16px] leading-[1.6] text-white/70">
                Twelve creator clips in one campaign, each with its verdict, its seconds on screen and the moment that proves
                every term.
              </p>
            </div>
            <PendingLink
              href={hero ? `/campaigns/${hero.video.campaignId}` : "/campaigns"}
              className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-white px-7 text-[16px] font-semibold text-(--ink) shadow-(--sh-2) hover:bg-(--paper) active:bg-(--wash) sm:w-auto"
            >
              {hero ? "Open the Alani Nu campaign" : "Open the app"} <ArrowRight className="size-[18px]" strokeWidth={2.25} aria-hidden />
            </PendingLink>
          </div>
        </section>
      </main>

      <footer className="border-t border-(--hair) pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-4 py-8 text-[14px] text-(--ink-3) sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Wordmark />
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className="mt-0.5 text-[15px] font-semibold text-(--ink) tabular">{value}</dd>
    </div>
  );
}

function WeakTag({ label }: { label: string }) {
  return (
    <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-(--review-soft) px-2.5 text-[12px] font-semibold whitespace-nowrap text-(--review)">
      {label}
    </span>
  );
}

function VerdictCard({ show, track }: { show: Showcased; track: Showcased["video"]["report"]["tracks"][number] }) {
  const match = track.verdict === "match";
  const crop = show.video.cropUrls?.[track.objectId];
  const label = match ? "Counted" : track.verdict === "lookalike" ? "Not counted" : "Unclear, not counted";
  return (
    <li>
      <PendingLink
        href={show.href}
        hint="cover"
        className="ed-press-soft group relative grid h-full grid-cols-[112px_minmax(0,1fr)] gap-4 overflow-hidden rounded-(--r-card) bg-(--card) p-3 shadow-(--sh-1) ring-1 ring-(--hair) hover:shadow-(--sh-2) active:bg-(--wash) sm:block sm:p-0"
      >
        <span className="relative block aspect-[4/5] overflow-hidden rounded-[14px] bg-(--wash) sm:rounded-none">
          {crop && (
            // eslint-disable-next-line @next/next/no-img-element -- stored stills, already small JPEGs
            <img
              src={crop}
              alt={show.names[track.objectId] ?? ""}
              className="size-full object-cover transition-transform duration-500 ease-(--ease-out) group-hover:scale-[1.03]"
            />
          )}
          <span
            className={[
              "absolute top-2.5 left-2.5 hidden h-7 items-center rounded-full px-3 text-[12.5px] font-semibold shadow-(--sh-1) sm:inline-flex",
              match ? "bg-(--signal) text-(--signal-ink)" : "bg-white text-(--reject) outline-[1.5px] -outline-offset-[1.5px] outline-(--reject) outline-dashed",
            ].join(" ")}
          >
            {label}
          </span>
        </span>
        <span className="block min-w-0 py-1 sm:p-5">
          <span
            className={[
              "mb-2 inline-flex h-6 items-center rounded-full px-2.5 text-[12px] font-semibold sm:hidden",
              match ? "bg-(--signal) text-(--signal-ink)" : "bg-(--reject-soft) text-(--reject)",
            ].join(" ")}
          >
            {label}
          </span>
          <span className="block text-[16px] font-semibold">{show.names[track.objectId] ?? "Tracked object"}</span>
          <span className="mt-1.5 block text-[14px] leading-[1.5] text-(--ink-2)">
            <span className="font-medium text-(--ink-3)">Muse Spark: </span>&ldquo;{track.reason}&rdquo;
          </span>
          <span className="mt-3 hidden items-center gap-1 text-[13px] font-semibold text-(--ink) sm:inline-flex">
            Open {show.video.id} <ArrowRight className="size-3.5" strokeWidth={2.5} aria-hidden />
          </span>
        </span>
      </PendingLink>
    </li>
  );
}
