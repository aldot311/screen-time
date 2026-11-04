import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ArrowDown, ChevronDown, Film } from "lucide-react";
import accuracy from "@/lib/accuracy-data.json";
import contractEval from "@/lib/contract-eval-data.json";
import openWeight from "@/lib/open-weight-data.json";
import { TopBar } from "@/components/ed/top-bar";
import { DISPLAY } from "@/components/ed/campaign-ui";
import { TrySample } from "@/components/ed/try-sample";
import { CheckAccuracy, WatchReelButton } from "@/components/ed/check-player";
import { loadCheckData } from "@/components/ed/check-player-load";
import {
  clipLabel,
  contractEvalSummary,
  labelProvenance,
  objectRows,
  payHoldSummary,
  pct,
  pctRange,
  pctRange0,
  sampleRows,
  setLine,
  sparkStory,
  spokenSummary,
  summarize,
  targetName,
  whereWrong,
  type AccuracyData,
  type ContractEval,
} from "@/components/ed/accuracy-summary";
import { tenths } from "@/components/format";

export const metadata: Metadata = {
  title: "Accuracy",
  description: "How often Screen-Time is right, measured frame by frame on 11 test Reels as delivered, with and without Muse Spark, and where it is wrong.",
};

// The player's Reels and stills come from the store at request time; the figures are bundled JSON.
export const dynamic = "force-dynamic";

const data = accuracy as AccuracyData;

/** The Reel the player opens on, as on the landing page. */
const CHECK_FIRST = "lacroix/lc-1-michael";

const CARD = "rounded-(--r-card) bg-(--card) shadow-(--sh-1) ring-1 ring-(--hair)";
const PROSE = "max-w-[62ch] text-[15px] leading-[1.6] text-(--ink-2)";
const NOTE = "max-w-[62ch] text-[13.5px] leading-[1.55] text-(--ink-3)";
const indexLink =
  "ed-press inline-flex min-h-10 items-center rounded-full px-3 text-[14px] font-semibold text-(--ink-2) ring-1 ring-(--hair) hover:bg-(--wash) hover:text-(--ink) active:bg-(--hair)";

export default async function AccuracyPage() {
  const acc = summarize(data);
  const { sam, verified, targets, clips } = acc;
  const set = setLine(data);
  const labels = labelProvenance(data);
  const story = sparkStory(data);
  const objects = objectRows(data, openWeight.hosted.model);
  const payHold = payHoldSummary(data);
  const spoken = spokenSummary(data);
  const misses = whereWrong(data);
  const evalSummary = contractEvalSummary(contractEval as ContractEval | null);
  const ci = data.intervals?.verified;
  const products = [...new Set(verified.rows.map((r) => r.target))];
  const oneProduct = products.length === 1;
  // Every scored Reel is in the player, so any row (and every "Where it is wrong" card) can be watched.
  const check = await loadCheckData(sampleRows(data, verified.rows.length));
  const reelOf = (clip: string, target: string) => check.reels.find((r) => r.clip === clip && r.target === target);

  const index = [
    { id: "muse-spark", label: "What Muse Spark adds" },
    objects.length > 0 && data.objects ? { id: "objects", label: "Object by object" } : null,
    payHold ? { id: "pay-hold", label: "Pay or hold" } : null,
    { id: "wrong", label: "Where it is wrong" },
    evalSummary ? { id: "contract", label: "Contract reading" } : null,
    { id: "method", label: "How it was measured" },
  ].filter((x): x is { id: string; label: string } => x !== null);

  return (
    <>
      <TopBar back={{ href: "/", label: "Home" }} />
      <main className="mx-auto w-full max-w-[1200px] px-4 pt-6 pb-24 sm:px-6 lg:px-8 lg:pt-14">
        {/* Left: the claim and where the labels came from. Right: the figures in one panel. Every number is computed
            from accuracy-data.json; nothing here is typed in. */}
        <header className="grid gap-x-16 gap-y-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,540px)] lg:items-start">
          <div>
            <h1 className={`${DISPLAY} text-[38px] leading-[1.02] sm:text-[56px]`}>Measured, not claimed.</h1>
            <p className="mt-5 max-w-[44ch] text-[18px] leading-[1.5] text-(--ink-2) sm:text-[20px]">
              Screen-Time&rsquo;s own reports for {clips} test Reels, as delivered on this site, compared frame by frame with labels of where
              the product is on screen.
            </p>
            <p className="mt-4 text-[14px] leading-[1.55] text-(--ink-3) tabular">
              {set ? `${set}. ` : ""}Measured {data.measuredAt}.
            </p>
            {labels && (
              <p className="mt-4 max-w-[54ch] text-[15px] leading-[1.6] text-(--ink-2)">
                {labels.line}
                {labels.resolution && ` ${labels.resolution}`}
              </p>
            )}
            <a
              href="#check"
              className="ed-press mt-5 inline-flex min-h-11 items-center gap-1.5 rounded-full text-[15px] font-semibold text-(--ink) underline decoration-(--hair-2) decoration-2 underline-offset-4 hover:decoration-(--ink) active:opacity-70"
            >
              Watch the labels against the count <ArrowDown className="size-4" strokeWidth={2.25} aria-hidden />
            </a>
          </div>

          <section aria-label="Overall, with Muse Spark" className="rounded-(--r-card) bg-(--card) ring-1 ring-(--hair)">
            <dl className="grid grid-cols-2 gap-x-5 gap-y-4 px-5 pt-6 pb-5 sm:px-7 sm:pt-7">
              {[
                { label: "Precision per frame", value: verified.precision, ci: ci?.precision, gloss: "of the seconds it counted, the share that really showed the product" },
                { label: "Recall per frame", value: verified.recall, ci: ci?.recall, gloss: "of the seconds the product really showed, the share it counted" },
              ].map((h) => (
                <div key={h.label} className="min-w-0">
                  <dt className="text-[13px] font-medium text-(--ink-3)">{h.label}</dt>
                  <dd className="ed-num mt-1 text-[40px] leading-none sm:text-[56px]">{pct(h.value)}</dd>
                  {pctRange(h.ci) && <dd className="mt-2 text-[13px] text-(--ink-3) tabular">95% interval {pctRange(h.ci)}</dd>}
                  <dd className="mt-1.5 text-[13.5px] leading-[1.45] text-(--ink-2)">{h.gloss}</dd>
                </div>
              ))}
            </dl>
            <p className="border-t border-(--hair) px-5 py-3 text-[14px] text-(--ink-2) tabular sm:px-7">
              <span className="font-semibold text-(--ink)">F1 {pct(verified.f1)}</span>
              {pctRange(ci?.f1) && <span className="text-(--ink-3)"> · 95% interval {pctRange(ci?.f1)}</span>}
              <span className="text-(--ink-3)"> · the two in one figure</span>
            </p>

            <div className="border-t border-(--hair) px-5 py-5 sm:px-7">
              <table className="w-full text-[14px] tabular-nums">
                <caption className="mb-2 text-left text-[13px] font-semibold text-(--ink)">SAM 3.1 alone vs + Muse Spark</caption>
                <thead>
                  <tr className="text-[12px] text-(--ink-3)">
                    <th scope="col" className="py-1 text-left font-medium">
                      <span className="sr-only">Score, per frame</span>
                    </th>
                    <th scope="col" className="py-1 text-right font-medium">SAM 3.1 alone</th>
                    <th scope="col" className="py-1 pl-4 text-right font-medium">+ Muse Spark</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-(--hair)">
                  {[
                    { label: "Precision", a: sam.precision, b: verified.precision },
                    { label: "Recall", a: sam.recall, b: verified.recall },
                    { label: "F1", a: sam.f1, b: verified.f1 },
                  ].map((m) => (
                    <tr key={m.label}>
                      <th scope="row" className="py-2 text-left font-medium text-(--ink-2)">
                        {m.label}
                      </th>
                      <td className="py-2 text-right text-(--ink-2)">{pct(m.a)}</td>
                      <td className="py-2 pl-4 text-right font-semibold">{pct(m.b)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {data.intervals && (
              <p className="border-t border-(--hair) px-5 pt-4 pb-5 text-[13px] leading-[1.55] text-(--ink-3) sm:px-7">
                The intervals come from resampling whole Reels ({data.intervals.resamples.toLocaleString("en-US")} draws, seed {data.intervals.seed}):
                they show how much the figures depend on which Reels are in the set, not how wrong the labels might be.
                {verified.rows.some((r) => r.recall === 0) && " Recall’s is wide because a Reel where the product was on screen counted nothing (see Where it is wrong)."}
              </p>
            )}
          </section>
        </header>

        <nav aria-label="On this page" className="mt-10 flex flex-col gap-3 border-t border-(--hair) pt-5 sm:flex-row sm:items-baseline sm:gap-5">
          <p className="shrink-0 text-[13px] font-semibold text-(--ink-3)">On this page</p>
          <ul className="flex flex-wrap gap-2">
            {index.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className={indexLink}>
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <section id="check" aria-labelledby="check-h" className="mt-14 scroll-mt-20">
          <h2 id="check-h" className="ed-display text-[26px] leading-tight sm:text-[30px]">
            Check it yourself
          </h2>
          <p className={`mt-2 ${PROSE}`}>
            Play a Reel and watch the person&rsquo;s labels and Screen-Time&rsquo;s count run side by side, frame by frame. Pick any of the {targets}{" "}
            rows below to load its Reel.
          </p>
          <CheckAccuracy reels={check.reels} rows={check.rows} initialClip={CHECK_FIRST} />
        </section>

        <Section
          id="muse-spark"
          title="What Muse Spark adds"
          intro={
            <p>
              The same runs, scored twice: once counting every object SAM 3.1 tracked for the prompt, once counting only the objects Muse Spark
              confirmed as the brand&rsquo;s product. No model was run again for this.
            </p>
          }
        >
          <div className={CARD}>
            <table className="w-full text-left text-[13.5px] tabular sm:text-[14px]">
              <thead className="text-[12px] text-(--ink-3) sm:text-[12.5px]">
                <tr className="border-b border-(--hair)">
                  <th className="px-3 py-2.5 font-semibold sm:px-4">Per frame</th>
                  <th className="px-2 py-2.5 text-right font-semibold sm:px-4">SAM 3.1 alone</th>
                  <th className="px-3 py-2.5 text-right font-semibold sm:px-4">+ Muse Spark</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--hair)">
                {[
                  { label: "Precision", a: pct(sam.precision), b: pct(verified.precision) },
                  { label: "Recall", a: pct(sam.recall), b: pct(verified.recall) },
                  { label: "F1", a: pct(sam.f1), b: pct(verified.f1) },
                  { label: "Avg. error per Reel", a: `${tenths(sam.meanAbsErrorSec)} s`, b: `${tenths(verified.meanAbsErrorSec)} s` },
                  { label: "Seconds on Reels without the product", a: `${tenths(sam.falseSecondsOnEmptyClips)} s`, b: `${tenths(verified.falseSecondsOnEmptyClips)} s` },
                ].map((m) => (
                  <tr key={m.label} className="text-(--ink-2)">
                    <th scope="row" className="px-3 py-2.5 font-semibold text-(--ink) sm:px-4">
                      {m.label}
                    </th>
                    <td className="px-2 py-2.5 text-right sm:px-4">{m.a}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-(--ink) sm:px-4">{m.b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {story.length > 0 && (
            <div className="mt-6">
              <p className="max-w-[62ch] text-[17px] leading-[1.45] font-semibold text-(--ink)">{story[0]}</p>
              {story.length > 1 && (
                <ul className="mt-3 max-w-[66ch] divide-y divide-(--hair) border-y border-(--hair)">
                  {story.slice(1).map((s) => (
                    <li key={s} className="py-3 text-[15px] leading-[1.6] text-(--ink-2)">
                      {s}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Section>

        {objects.length > 0 && data.objects && (
          <Section
            id="objects"
            title="Object by object"
            intro={
              <>
                <p>
                  Each object was judged by Claude from crops of the earlier runs (our zoomed edit of George&rsquo;s Reel among them) as the product
                  or something else, and matched to these runs by track number: {data.objects.judged} could be judged
                  {data.objects.unsure ? `, ${data.objects.unsure} too small to tell is left out` : ""}.
                </p>
                <p>The intervals are exact (Clopper-Pearson) 95% intervals: with {data.objects.judged} objects they are wide.</p>
              </>
            }
          >
            <div className={CARD}>
              <table className="w-full text-left text-[13.5px] tabular sm:text-[14px]">
                <thead className="text-[12px] text-(--ink-3) sm:text-[12.5px]">
                  <tr className="border-b border-(--hair)">
                    <th className="px-3 py-2.5 font-semibold sm:px-4">Object check</th>
                    <th className="px-2 py-2.5 font-semibold sm:px-4">Correct</th>
                    <th className="px-2 py-2.5 font-semibold sm:px-4">Look-alikes counted</th>
                    <th className="px-3 py-2.5 font-semibold sm:px-4">Products missed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-(--hair)">
                  {objects.map((o) => (
                    <tr key={o.name} className="text-(--ink-2)">
                      <th scope="row" className="px-3 py-2.5 font-semibold text-(--ink) sm:px-4">
                        {o.name}
                      </th>
                      <td className="px-2 py-2.5 sm:px-4">
                        {o.correct} of {o.of}
                        {o.interval && <span className="block text-[12px] text-(--ink-3)">{pctRange0(o.interval)}</span>}
                      </td>
                      <td className="px-2 py-2.5 sm:px-4">{o.lookalikes}</td>
                      <td className="px-3 py-2.5 sm:px-4">
                        {o.missed}
                        {o.missedNote && <span className="block text-[12px] text-(--ink-3)">{o.missedNote}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {openWeight.open && (
              <p className={`mt-4 ${NOTE}`}>
                Meta&rsquo;s open-weight Muse Spark Open called {Math.round((openWeight.open.accuracy ?? 0) * openWeight.open.objects)} of{" "}
                {openWeight.open.objects} correctly ({openWeight.open.falseMatches} look-alikes counted, {openWeight.open.missedMatches} real cans
                called unclear), measured {openWeight.measuredAt} on crops from the earlier runs, which used our zoomed edit of George&rsquo;s Reel;
                it has not been run on the Reels as delivered.
              </p>
            )}
          </Section>
        )}

        {payHold && (
          <Section id="pay-hold" title="Pay or hold" intro={<p>{payHold.line}</p>}>
            {data.payHold && (
              <p className="flex items-baseline gap-2">
                <span className="ed-num text-[44px] leading-none sm:text-[56px]">
                  {data.payHold.agree} of {data.payHold.of}
                </span>
                <span className="text-[15px] text-(--ink-2)">Reels agree with the labels</span>
              </p>
            )}
            {payHold.differ.length > 0 && (
              <>
                <p className="mt-6 text-[13px] font-semibold text-(--ink-3)">Where they differ</p>
                <ul className="mt-2 max-w-[66ch] divide-y divide-(--hair) border-y border-(--hair)">
                  {payHold.differ.map((d) => (
                    <li key={d} className="py-3 text-[15px] leading-[1.55] text-(--ink-2)">
                      {d}.
                    </li>
                  ))}
                </ul>
              </>
            )}
            {spoken ? (
              <div className={`mt-5 space-y-2 ${PROSE}`}>
                {spoken.map((s) => (
                  <p key={s}>{s}</p>
                ))}
              </div>
            ) : (
              <div className={`mt-5 space-y-2 ${NOTE}`}>
                <p>The spoken-name and ad-disclosure terms have no independent labels yet, so they are not scored here.</p>
                <p>
                  The captions on these Reels were burned in by the builder from each Reel&rsquo;s own speech (Voice Transcribe), so the on-screen
                  disclosure check is not independent of the spoken one either.
                </p>
              </div>
            )}
          </Section>
        )}

        <Section
          id="wrong"
          title="Where it is wrong"
          intro={misses.length ? <p>The lowest precision and the lowest recall in the test set. Watch either Reel in the player above.</p> : undefined}
        >
          {misses.length ? (
            <ul className="grid max-w-[760px] gap-4">
              {misses.map((f) => {
                const reel = reelOf(f.clipId, f.target);
                return (
                  <li key={f.key} className={`grid grid-cols-[84px_minmax(0,1fr)] gap-4 p-4 sm:grid-cols-[132px_minmax(0,1fr)] sm:gap-5 sm:p-5 ${CARD}`}>
                    <div className="relative aspect-[9/16] w-full self-start overflow-hidden rounded-[12px] bg-(--wash) ring-1 ring-(--hair)">
                      {reel?.poster ? (
                        // eslint-disable-next-line @next/next/no-img-element -- a stored still, already a small JPEG
                        <img src={reel.poster} alt={`A still from ${clipLabel(f.clipId)}’s Reel`} className="absolute inset-0 size-full object-cover" />
                      ) : (
                        <span className="absolute inset-0 grid place-items-center text-(--ink-3)" aria-hidden>
                          <Film className="size-6" strokeWidth={1.75} />
                        </span>
                      )}
                    </div>
                    <div className="flex min-w-0 flex-col">
                      <p className="text-[12.5px] font-semibold text-(--ink-3)">{f.clip}</p>
                      <h3 className="mt-1 text-[17px] leading-snug font-semibold">{f.title}</h3>
                      <p className="mt-1.5 text-[14px] leading-[1.5] font-semibold text-(--ink-2) tabular">{f.what}</p>
                      <p className="mt-2 text-[14px] leading-[1.55] text-(--ink-2)">{f.why}</p>
                      {reel && <WatchReelButton clip={reel.clip} name={clipLabel(reel.clip)} className="mt-4 self-start" />}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className={PROSE}>Every labelled check scored 100% precision and recall.</p>
          )}
        </Section>

        {evalSummary && (
          <Section id="contract" title="Contract reading (Muse Spark)">
            <p className="max-w-[62ch] text-[17px] leading-[1.45] font-semibold text-(--ink)">{evalSummary.headline}</p>
            <ul className="mt-3 max-w-[66ch] divide-y divide-(--hair) border-y border-(--hair)">
              {evalSummary.lines.map((l) => (
                <li key={l} className="py-3 text-[15px] leading-[1.55] text-(--ink-2)">
                  {l}
                </li>
              ))}
            </ul>
            <p className={`mt-3 ${NOTE}`}>{evalSummary.footnote}</p>
          </Section>
        )}

        <Section id="method" title="How it was measured">
          <dl className="max-w-[72ch] divide-y divide-(--hair) border-y border-(--hair)">
            <Method term="Analysis rate">
              Every video is re-encoded to {data.fps} fps before SAM 3.1, and SAM tracks every one of those frames. Scores compare those {data.fps} fps
              frames with the labels; the labels themselves were judged on every 3rd frame and each judgement stands for that frame and the next
              two.
            </Method>
            <Method term="Runs">
              The scored reports are the ones this site shows for these Reels (one run each, kept in the repository under data/runs), so a report
              and its row here are the same run.
            </Method>
            <Method term="Labels">
              Two independent Claude vision passes over frame-numbered grids at 5 frames a second, kept where both agree, or where one is certain
              and the other unsure. The look-alike Reel was then corrected by one Claude pass at full resolution.{labels?.allChecked ? " A person then checked every clip frame by frame in the labelling tool." : ""}
              {testSetNote(acc)}
            </Method>
            <Method term="Scoring">
              Per frame: a frame counts when the pipeline says the product is visible in it. Precision is the share of counted frames that were
              right; recall is the share of real frames that were counted.
            </Method>
            <Method term="Not yet measured">
              How much the product photo adds on its own: runs with and without it have not been compared on the same clips.
            </Method>
            <Method term="History">
              Until Nov 4 this page scored a zoomed edit of George&rsquo;s Reel that we made (2.3x, following the can); it now scores the Reel as
              delivered. George&rsquo;s labels were drawn on that zoomed edit; the zoom follows the can, so on the wide cut they can only miss
              frames.
            </Method>
          </dl>

          <details className={`group mt-8 ${CARD}`}>
            <summary className="ed-press-soft flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-(--r-card) px-4 text-[15px] font-semibold active:bg-(--wash) [&::-webkit-details-marker]:hidden">
              {oneProduct ? `All ${clips} Reels · ${targetName(products[0])}` : `All ${targets} product checks across ${clips} clips`}
              <ChevronDown className="size-5 shrink-0 text-(--ink-3) transition-transform group-open:rotate-180" strokeWidth={2.25} aria-hidden />
            </summary>
            <div className="border-t border-(--hair)">
              <table className="w-full text-left text-[13px] tabular sm:text-[13.5px]">
                <thead className="text-[12px] text-(--ink-3)">
                  <tr>
                    <th className="py-2 pr-1.5 pl-3 font-semibold sm:px-4">Reel</th>
                    <th className={`px-1.5 py-2 font-semibold sm:px-3 ${oneProduct ? "hidden sm:table-cell" : ""}`}>Product</th>
                    <th className="px-1.5 py-2 text-right font-semibold sm:px-3">Labelled</th>
                    <th className="px-1.5 py-2 text-right font-semibold sm:px-3">Counted</th>
                    <th className="px-1.5 py-2 text-right font-semibold sm:px-3">Precision</th>
                    <th className="py-2 pr-3 pl-1.5 text-right font-semibold sm:px-4">Recall</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-(--hair)">
                  {verified.rows.map((r) => (
                    <tr key={`${r.clip}-${r.target}`} className="text-(--ink-2)">
                      <td className="py-2 pr-1.5 pl-3 text-(--ink) sm:px-4">{clipLabel(r.clip)}</td>
                      <td className={`px-1.5 py-2 sm:px-3 ${oneProduct ? "hidden sm:table-cell" : ""}`}>{targetName(r.target)}</td>
                      <td className="px-1.5 py-2 text-right sm:px-3">{tenths(r.truthSec)} s</td>
                      <td className="px-1.5 py-2 text-right sm:px-3">{tenths(r.predictedSec)} s</td>
                      <td className="px-1.5 py-2 text-right sm:px-3">{pct(r.precision)}</td>
                      <td className="py-2 pr-3 pl-1.5 text-right sm:px-4">{pct(r.recall)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </Section>

        <div className="mt-16 flex flex-col gap-3 rounded-(--r-card) bg-(--ink) p-6 text-white sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <p className="ed-display text-[22px] leading-tight">See it measure a real video, live.</p>
          <TrySample
            label="Run it on a sample video"
            className="ed-press inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white px-6 text-[15px] font-semibold text-(--ink) active:bg-(--paper)"
          />
        </div>
      </main>
    </>
  );
}

/** One section below the player: the heading and a short intro on the left from 1024px, the evidence on the right. */
function Section({ id, title, intro, children }: { id: string; title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="mt-16 scroll-mt-20 border-t border-(--hair) pt-10 lg:mt-20 lg:pt-12">
      <div className="grid gap-x-16 gap-y-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start">
        <div className="lg:sticky lg:top-20">
          <h2 id={`${id}-h`} className="ed-display text-[26px] leading-tight sm:text-[30px]">
            {title}
          </h2>
          {intro && <div className="mt-3 max-w-[62ch] space-y-3 text-[15px] leading-[1.6] text-(--ink-2)">{intro}</div>}
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </section>
  );
}

function Method({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-4 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-6">
      <dt className="text-[15px] font-semibold text-(--ink)">{term}</dt>
      <dd className="text-[15px] leading-[1.6] text-(--ink-2)">{children}</dd>
    </div>
  );
}

/** "1 look-alike", "0 products". */
const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

/** Which clips must count 0 s, from the data: a look-alike alone in shot, or no product at all. */
function testSetNote(acc: ReturnType<typeof summarize>): string {
  const parts = [
    acc.lookalikeClips ? plural(acc.lookalikeClips, "Reel") + " with only a look-alike in shot" : null,
    acc.emptyClips ? plural(acc.emptyClips, "Reel") + " with no product" : null,
  ].filter(Boolean);
  return parts.length ? ` The test set includes ${parts.join(" and ")}, which must count 0 seconds.` : "";
}
