import Link from "next/link";
import { ArrowRight, AudioLines, FileCheck2, ScanSearch, ShieldCheck } from "lucide-react";
import { loadShowcase, type Showcased } from "@/lib/campaign/showcase";
import { LiveDemo } from "@/components/live-demo";
import { Wordmark } from "@/components/wordmark";

export const dynamic = "force-dynamic";

const REPO = "https://github.com/aldot311/screen-time";

const STEPS = [
  {
    icon: ScanSearch,
    model: "SAM 3.1",
    title: "Track",
    text: "Finds every can, cup or sneaker in every frame from a two-word prompt. If the word misses, Muse Spark looks at the video and suggests a better one.",
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

// A sample of docs/ACCURACY.md, weakest rows included.
const SAMPLE = [
  { clip: "clip02", product: "Alani Nu can", truth: "12.0", measured: "12.0", precision: "100%", recall: "100%" },
  { clip: "clip12", product: "Alani Nu can, tumbler beside it", truth: "9.8", measured: "10.3", precision: "95%", recall: "100%" },
  { clip: "clip07", product: "Stanley tumbler", truth: "11.0", measured: "11.3", precision: "96%", recall: "99%" },
  { clip: "clip15", product: "Stanley tumbler (weakest recall)", truth: "3.4", measured: "2.6", precision: "97%", recall: "75%" },
  { clip: "clip08", product: "New Balance sneaker", truth: "1.6", measured: "1.5", precision: "100%", recall: "92%" },
  { clip: "clip05", product: "Look-alike can, must not count", truth: "0.0", measured: "0.0", precision: "–", recall: "–" },
];

export default async function Landing() {
  const { hero, lookalike } = await loadShowcase();
  const verdicts = [
    ...(hero ? hero.video.report.tracks.map((t) => ({ show: hero, track: t })) : []),
    ...(lookalike ? lookalike.video.report.tracks.map((t) => ({ show: lookalike, track: t })) : []),
  ];

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="mx-auto flex h-16 w-full max-w-[1180px] items-center gap-6 px-5 sm:px-8">
        <Link href="/" className="rounded-[4px]">
          <Wordmark size="lg" />
        </Link>
        <nav className="ml-auto hidden items-center gap-1 text-ink-2 md:flex">
          <a href="#how" className="rounded-[6px] px-2.5 py-1.5 hover:bg-sunken hover:text-ink">How it works</a>
          <a href="#accuracy" className="rounded-[6px] px-2.5 py-1.5 hover:bg-sunken hover:text-ink">Accuracy</a>
          <a href={REPO} className="rounded-[6px] px-2.5 py-1.5 hover:bg-sunken hover:text-ink">GitHub</a>
        </nav>
        <Link
          href="/campaigns"
          className="ml-auto inline-flex items-center gap-1.5 rounded-[8px] bg-ink px-3.5 py-2 font-medium text-white shadow-1 hover:bg-ink/90 md:ml-0"
        >
          Open the app
        </Link>
      </header>

      <main className="flex-1">
        <section className="mx-auto grid max-w-[1180px] items-center gap-x-14 gap-y-10 px-5 pt-10 pb-20 sm:px-8 lg:grid-cols-[1fr_560px] lg:pt-16">
          <div>
            <h1 className="max-w-[14ch] text-[44px] leading-[1.02] font-semibold tracking-[-0.035em] text-balance sm:text-[60px]">
              Proof your product was{" "}
              <span className="relative inline-block">
                {/* The one brand use of lime: the word that means "on screen", marked the way the strip marks it. */}
                <span className="absolute inset-x-[-0.06em] top-[0.2em] bottom-[0.04em] rounded-[2px] bg-lime" aria-hidden />
                <span className="relative">seen.</span>
              </span>
            </h1>
            <p className="mt-6 max-w-[52ch] text-[17px] leading-[1.6] text-ink-2">
              Brands pay creators for screen time they cannot check. Screen-Time uses Meta SAM 3.1, Muse Spark and Muse
              Voice Transcribe to watch every frame of a sponsored video, box your product, reject look-alikes, hear
              your brand name, and check the contract to the second.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href={hero?.href ?? "/campaigns"}
                className="inline-flex items-center gap-2 rounded-[10px] bg-ink px-5 py-3 text-[15px] font-medium text-white shadow-1 hover:bg-ink/90"
              >
                Open a real report <ArrowRight className="size-4" aria-hidden />
              </Link>
              <Link
                href="/campaigns"
                className="inline-flex items-center rounded-[10px] border border-line bg-surface px-5 py-3 text-[15px] font-medium shadow-1 hover:border-line-strong"
              >
                See every campaign
              </Link>
            </div>
            <p className="mt-6 text-[13px] text-ink-3">
              <a href="#accuracy" className="hover:text-ink">
                <span className="font-medium text-ink-2 tabular">97.7%</span> precision ·{" "}
                <span className="font-medium text-ink-2 tabular">95.6%</span> recall per frame on real test clips
              </a>
            </p>
          </div>

          {hero ? (
            <figure>
              <LiveDemo
                report={hero.video.report}
                videoUrl={hero.video.videoUrl}
                poster={hero.video.thumbUrl}
                cropUrls={hero.video.cropUrls}
                names={hero.names}
              />
              <figcaption className="mt-3 text-[12px] text-ink-3">
                A real run on Meta&rsquo;s API, replayed. The lime strip fills only while the Alani can is on screen; the
                Stanley tumbler next to it is boxed but never counted.
              </figcaption>
            </figure>
          ) : null}
        </section>

        <section id="how" className="scroll-mt-6 border-y border-line bg-surface">
          <div className="mx-auto max-w-[1180px] px-5 py-20 sm:px-8">
            <h2 className="max-w-[24ch] text-[30px] leading-[1.15] font-semibold tracking-[-0.025em]">
              Three Meta models, four checks, one verdict per creator.
            </h2>
            <p className="mt-3 max-w-[60ch] text-[15px] text-ink-2">
              Upload a creator&rsquo;s video and say what you are looking for. Every number in the report links to the
              second that proves it.
            </p>
            <ol className="relative mt-12 grid gap-8 lg:grid-cols-4 lg:gap-10">
              {/* The hairline that joins the steps: down the left on a phone, across the top on a wide screen. */}
              <span className="absolute top-3 bottom-3 left-3 w-px bg-line lg:top-3 lg:right-0 lg:bottom-auto lg:left-3 lg:h-px lg:w-auto" aria-hidden />
              {STEPS.map((s, i) => (
                <li key={s.title} className="relative grid grid-cols-[24px_1fr] gap-x-4 lg:block">
                  <span className="relative grid size-6 place-items-center rounded-full border border-line bg-sunken text-[12px] font-semibold text-ink-2 tabular">
                    {i + 1}
                  </span>
                  <span className="lg:mt-5 lg:block">
                    <h3 className="flex items-center gap-2 text-[17px] font-semibold tracking-[-0.01em]">
                      <s.icon className="size-4 text-ink-3" aria-hidden /> {s.title}
                    </h3>
                    <p className="mt-0.5 text-[12px] font-medium text-ink-3">{s.model}</p>
                    <p className="mt-2 text-ink-2">{s.text}</p>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {verdicts.length > 0 && (
          <section className="mx-auto max-w-[1180px] px-5 py-20 sm:px-8">
            <div className="grid gap-x-14 gap-y-10 lg:grid-cols-[360px_1fr]">
              <div>
                <h2 className="text-[30px] leading-[1.15] font-semibold tracking-[-0.025em]">
                  It knows your can from the one next to it.
                </h2>
                <p className="mt-3 text-[15px] text-ink-2">
                  Counting every can in the shot would pay a creator for someone else&rsquo;s product. Muse Spark checks
                  each object SAM finds against your product description and says why, in words a brand manager can
                  check.
                </p>
              </div>
              <ul className="grid gap-4 sm:grid-cols-3">
                {verdicts.map(({ show, track }) => (
                  <VerdictCard key={`${show.video.id}-${track.objectId}`} show={show} track={track} />
                ))}
              </ul>
            </div>
          </section>
        )}

        <section id="accuracy" className="scroll-mt-6 border-t border-line bg-surface">
          <div className="mx-auto max-w-[1180px] px-5 py-20 sm:px-8">
            <h2 className="max-w-[26ch] text-[30px] leading-[1.15] font-semibold tracking-[-0.025em]">
              Measured frame by frame against hand-checked labels.
            </h2>
            <p className="mt-4 max-w-[62ch] text-[20px] leading-[1.45] text-ink-2">
              <span className="font-semibold text-ink tabular">97.7%</span> precision and{" "}
              <span className="font-semibold text-ink tabular">95.6%</span> recall per frame across 23 clip and product
              targets, at <span className="font-semibold text-ink tabular">$0.20</span> per 1,000 frames tracked.
            </p>
            <div className="mt-10 overflow-x-auto rounded-[10px] border border-line shadow-1">
              <table className="w-full min-w-[620px] text-left">
                <thead className="border-b border-line bg-ground text-[12px] text-ink-3">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Clip</th>
                    <th className="px-4 py-2.5 font-medium">Product</th>
                    <th className="px-4 py-2.5 text-right font-medium">Labelled</th>
                    <th className="px-4 py-2.5 text-right font-medium">Measured</th>
                    <th className="px-4 py-2.5 text-right font-medium">Precision</th>
                    <th className="px-4 py-2.5 text-right font-medium">Recall</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {SAMPLE.map((r) => (
                    <tr key={r.clip}>
                      <td className="px-4 py-2.5 text-ink-2">{r.clip}</td>
                      <td className="px-4 py-2.5">{r.product}</td>
                      <td className="px-4 py-2.5 text-right tabular">{r.truth} s</td>
                      <td className="px-4 py-2.5 text-right tabular">{r.measured} s</td>
                      <td className="px-4 py-2.5 text-right tabular">{r.precision}</td>
                      <td className="px-4 py-2.5 text-right tabular">{r.recall}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-6 max-w-[70ch] text-ink-2">
              21 vertical clips: 15 filmed with real products, 6 stock, including a look-alike can that must be rejected
              and a clip with no product at all. Both scored 0 seconds, as they should.{" "}
              <a href={`${REPO}/blob/main/docs/ACCURACY.md`} className="font-medium text-ink underline decoration-line-strong hover:decoration-ink">
                All 23 results
              </a>
              .
            </p>
          </div>
        </section>

        <section className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-6 px-5 py-16 sm:px-8">
          <h2 className="text-[24px] font-semibold tracking-[-0.02em]">See it on real creator videos.</h2>
          <Link
            href={hero ? `/campaigns/${hero.video.campaignId}` : "/campaigns"}
            className="inline-flex items-center gap-2 rounded-[10px] bg-ink px-5 py-3 text-[15px] font-medium text-white shadow-1 hover:bg-ink/90"
          >
            {hero ? "Open the Alani Nu campaign" : "Open the app"} <ArrowRight className="size-4" aria-hidden />
          </Link>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-4 px-5 py-6 text-[13px] text-ink-3 sm:px-8">
          <span>Screen-Time by Aetrai · Meta Global AI Developer Hackathon 2026</span>
          <a href={REPO} className="hover:text-ink">Source on GitHub</a>
        </div>
      </footer>
    </div>
  );
}

function VerdictCard({ show, track }: { show: Showcased; track: Showcased["video"]["report"]["tracks"][number] }) {
  const match = track.verdict === "match";
  const crop = show.video.cropUrls?.[track.objectId];
  return (
    <li className="overflow-hidden rounded-[12px] border border-line bg-surface shadow-1">
      <Link href={show.href} className="group block">
        <span className="relative block aspect-[4/5] overflow-hidden bg-sunken">
          {crop && (
            // eslint-disable-next-line @next/next/no-img-element -- stored stills, already small JPEGs
            <img src={crop} alt={show.names[track.objectId] ?? ""} className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
          )}
          <span
            className={[
              "absolute top-3 left-3 rounded-full px-2 py-0.5 text-[12px] font-semibold",
              match ? "bg-pass-soft text-pass" : "bg-fail-soft text-fail",
            ].join(" ")}
          >
            {match ? "Counted" : track.verdict === "lookalike" ? "Not counted" : "Unclear, not counted"}
          </span>
        </span>
        <span className="block p-4">
          <span className="block font-medium">{show.names[track.objectId] ?? "Tracked object"}</span>
          <span className="mt-1 block text-[13px] leading-[1.5] text-ink-2">&ldquo;{track.reason}&rdquo;</span>
        </span>
      </Link>
    </li>
  );
}
