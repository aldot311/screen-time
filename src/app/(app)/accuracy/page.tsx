import type { Metadata } from "next";
import { ChevronDown } from "lucide-react";
import data from "@/lib/accuracy-data.json";
import objects from "@/lib/open-weight-data.json";
import { TopBar } from "@/components/ed/top-bar";
import { DISPLAY } from "@/components/ed/campaign-ui";
import { TrySample } from "@/components/ed/try-sample";
import { clipLabel, missSeconds, pct, summarize, targetName, weakest, type AccuracyRow } from "@/components/ed/accuracy-summary";
import { tenths } from "@/components/format";

export const metadata: Metadata = {
  title: "Accuracy",
  description: "How often Screen-Time is right, measured frame by frame against checked labels, with and without Muse Spark.",
};

/** The two misses that matter most, from the data itself: the clip that over-counted most and the one that
 *  under-counted most. Worded from their own figures, so a re-measure rewrites them. */
function failures(rows: AccuracyRow[]) {
  const weak = weakest(rows);
  const name = (r: AccuracyRow) => `${clipLabel(r.clip)} · ${targetName(r.target)}`;
  return [
    weak.precision && {
      key: "precision",
      title: "Counted more than was there",
      clip: name(weak.precision),
      what: `Precision ${pct(weak.precision.precision)}: ${tenths(missSeconds(weak.precision).extraSec)} s counted that the labels mark as not on screen.`,
      why: "The lowest precision in the test set. Over-counting is the costly error: it would pay for screen time the brand did not get.",
    },
    weak.recall && {
      key: "recall",
      title: "Missed some of it",
      clip: name(weak.recall),
      what: `Recall ${pct(weak.recall.recall)}: ${tenths(missSeconds(weak.recall).missedSec)} s of real screen time not counted.`,
      why: "The lowest recall in the test set. Here the report under-counts, so the brand sees less screen time than it got, not more.",
    },
  ].filter((f) => !!f);
}

export default function AccuracyPage() {
  const acc = summarize(data);
  const { sam, verified, targets, clips } = acc;
  const misses = failures(verified.rows);
  const recallCost = sam.recall !== null && verified.recall !== null ? (sam.recall - verified.recall) * 100 : null;
  return (
    <>
      <TopBar back={{ href: "/", label: "Home" }} />
      <main className="mx-auto w-full max-w-[880px] px-4 pt-6 pb-24 sm:px-6 lg:pt-12">
        <h1 className={`${DISPLAY} text-[38px] leading-[1.02] sm:text-[56px]`}>Measured, not claimed.</h1>
        <p className="mt-3 max-w-[62ch] text-[16px] leading-[1.55] text-(--ink-2)">
          Every frame of {clips} vertical clips ({targets} clip–product pairs) was labelled for whether the product is on screen, then compared
          with what the pipeline reported. Measured {data.measuredAt}.
        </p>

        <section aria-labelledby="ab-h" className="mt-8">
          <h2 id="ab-h" className="ed-display text-[26px] leading-tight">
            What Muse Spark adds
          </h2>
          <p className="mt-1 max-w-[62ch] text-[14.5px] text-(--ink-2)">
            The same runs, scored twice: once counting every object SAM 3.1 tracked for the prompt, once counting only the objects Muse Spark
            confirmed as the brand&rsquo;s product. No model was run again for this.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3" aria-label="Before and after Muse Spark">
            {[
              { label: "Precision", a: pct(sam.precision), b: pct(verified.precision), fa: Number(sam.precision), fb: Number(verified.precision) },
              { label: "Avg. error per clip", a: `${sam.meanAbsErrorSec.toFixed(2)} s`, b: `${verified.meanAbsErrorSec.toFixed(2)} s`, fa: 1, fb: verified.meanAbsErrorSec / sam.meanAbsErrorSec },
              { label: "Look-alike seconds counted", a: `${sam.falseSecondsOnEmptyClips.toFixed(1)} s`, b: `${verified.falseSecondsOnEmptyClips.toFixed(1)} s`, fa: 1, fb: verified.falseSecondsOnEmptyClips / Math.max(sam.falseSecondsOnEmptyClips, 0.001) },
            ].map((m) => (
              <div key={m.label} className="rounded-(--r-card) bg-(--card) p-4 shadow-(--sh-1) ring-1 ring-(--hair)">
                <p className="text-[13px] font-semibold text-(--ink-3)">{m.label}</p>
                <p className="mt-1 flex items-baseline gap-2 tabular">
                  <span className="text-[15px] text-(--ink-3) line-through decoration-(--ink-3)/50">{m.a}</span>
                  <span className="ed-display text-[30px] leading-none">{m.b}</span>
                </p>
                <div className="mt-3 space-y-1.5" aria-hidden>
                  <div className="h-2 rounded-full bg-(--hair-2)" style={{ width: `${Math.max(4, m.fa * 100)}%` }} />
                  <div className="h-2 rounded-full bg-(--ink)" style={{ width: `${Math.max(4, m.fb * 100)}%` }} />
                </div>
                <p className="mt-1.5 flex justify-between text-[12px] text-(--ink-3)">
                  <span>SAM 3.1 alone</span>
                  <span className="font-semibold text-(--ink)">+ Muse Spark</span>
                </p>
              </div>
            ))}
          </div>
          <p className="mt-3 max-w-[62ch] text-[14.5px] leading-[1.55] text-(--ink-2)">
            Without the second model, every object SAM 3.1 tracks for the prompt counts as the product, look-alikes included
            {acc.lookalikeClips + acc.emptyClips > 0 && (
              <>
                : on the clips without the product it adds <span className="tabular">{sam.falseSecondsOnEmptyClips.toFixed(1)}</span> s of &ldquo;screen
                time&rdquo; the brand never got
              </>
            )}
            . Muse Spark rejects what is not the product and moves the average error from <span className="tabular">{sam.meanAbsErrorSec.toFixed(2)}</span> s to{" "}
            <span className="tabular">{verified.meanAbsErrorSec.toFixed(2)}</span> s
            {recallCost !== null && recallCost > 0 ? (
              <>
                , at the cost of <span className="tabular">{recallCost.toFixed(1)}</span> points of recall
              </>
            ) : null}{" "}
            (recall {pct(sam.recall)} → {pct(verified.recall)}; F1 {pct(sam.f1)} → {pct(verified.f1)}).
          </p>
        </section>

        <section aria-labelledby="obj-h" className="mt-12">
          <h2 id="obj-h" className="ed-display text-[26px] leading-tight">
            Object by object
          </h2>
          <p className="mt-2 max-w-[62ch] text-[15px] leading-[1.55] text-(--ink-2)">
            Every object SAM 3.1 tracked was also labelled from its crop as the product or something else. Muse Spark called{" "}
            <span className="font-semibold text-(--ink) tabular">
              {Math.round((objects.hosted.accuracy ?? 0) * objects.hosted.objects)} of {objects.hosted.objects}
            </span>{" "}
            objects that could be judged correctly, with {plural(objects.hosted.falseMatches, "look-alike")} counted and{" "}
            {plural(objects.hosted.missedMatches, "product")} missed. Objects too blurred to judge from the crop are not scored (in the app, an
            object Muse Spark cannot make out is never counted).
          </p>
          {objects.open && (
            <>
              <h3 className="mt-6 text-[17px] font-semibold">The same check on open-weight Muse Spark Open</h3>
              <p className="mt-1.5 max-w-[62ch] text-[15px] leading-[1.55] text-(--ink-2)">
                The same crops and the same prompt, sent to Meta&rsquo;s open-weight Muse Spark Open (served by Fireworks through OpenRouter). It
                counted {plural(objects.open.falseMatches, "look-alike")} and missed {plural(objects.open.missedMatches, "real product")} the hosted
                model matched; in the app, a product that is not matched is not counted.
              </p>
              <div className="mt-4 overflow-x-auto rounded-(--r-card) bg-(--card) shadow-(--sh-1) ring-1 ring-(--hair)">
                <table className="w-full min-w-[440px] text-left text-[14px] tabular">
                  <thead className="text-[12.5px] text-(--ink-3)">
                    <tr className="border-b border-(--hair)">
                      <th className="px-4 py-2.5 font-semibold">Object check</th>
                      <th className="px-4 py-2.5 font-semibold">Correct</th>
                      <th className="px-4 py-2.5 font-semibold">Look-alikes counted</th>
                      <th className="px-4 py-2.5 font-semibold">Products missed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { name: `Muse Spark ${objects.hosted.model.replace(/^muse-spark-/, "")} (hosted)`, r: objects.hosted },
                      { name: "Muse Spark Open", r: objects.open },
                    ].map(({ name, r }) => (
                      <tr key={name} className="border-b border-(--hair) last:border-0">
                        <td className="px-4 py-2.5 font-semibold text-(--ink)">{name}</td>
                        <td className="px-4 py-2.5">
                          {Math.round((r.accuracy ?? 0) * r.objects)} of {r.objects}
                        </td>
                        <td className="px-4 py-2.5">{r.falseMatches}</td>
                        <td className="px-4 py-2.5">{r.missedMatches}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[13px] text-(--ink-3)">
                {objects.open.objects} objects, median {objects.open.medianMs} ms per check, ${objects.open.usd.toFixed(2)} for the whole run · measured{" "}
                {objects.measuredAt}
              </p>
            </>
          )}
        </section>

        <section aria-labelledby="miss-h" className="mt-12">
          <h2 id="miss-h" className="ed-display text-[26px] leading-tight">
            Where it is wrong
          </h2>
          {misses.length ? (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {misses.map((f) => (
                <li key={f.key} className="flex flex-col rounded-(--r-card) bg-(--card) p-4 shadow-(--sh-1) ring-1 ring-(--hair)">
                  <p className="text-[12.5px] font-semibold text-(--ink-3)">{f.clip}</p>
                  <h3 className="mt-1 text-[17px] font-semibold">{f.title}</h3>
                  <p className="mt-1 text-[14px] font-semibold text-(--ink-2) tabular">{f.what}</p>
                  <p className="mt-2 flex-1 text-[14px] leading-[1.5] text-(--ink-2)">{f.why}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 max-w-[62ch] text-[14.5px] text-(--ink-2)">Every labelled check scored 100% precision and recall.</p>
          )}
        </section>

        <section aria-labelledby="how-h" className="mt-12">
          <h2 id="how-h" className="ed-display text-[26px] leading-tight">
            How it was measured
          </h2>
          <ul className="mt-3 max-w-[66ch] list-disc space-y-2 pl-5 text-[14.5px] leading-[1.55] text-(--ink-2)">
            <li>
              <span className="font-semibold text-(--ink)">Analysis rate.</span> Every video is re-encoded to {data.fps} fps before SAM 3.1, and
              SAM tracks every one of those frames: nothing between them is sampled out. Labels and scores use the same {data.fps} fps frames.
            </li>
            <li>
              <span className="font-semibold text-(--ink)">Labels.</span> Drafted by two independent Claude vision passes over frame-numbered
              grids, kept where both agreed.{testSetNote(acc)}
            </li>
            <li>
              <span className="font-semibold text-(--ink)">Scoring.</span> Per frame: a frame counts when the pipeline says the product is visible in
              it. Precision is the share of counted frames that were right; recall is the share of real frames that were counted.
            </li>
            <li>
              <span className="font-semibold text-(--ink)">Not yet measured.</span> How much the product photo adds on its own: runs with and
              without it have not been compared on the same clips.
            </li>
          </ul>
        </section>

        <details className="group mt-10 rounded-(--r-card) bg-(--card) shadow-(--sh-1) ring-1 ring-(--hair)">
          <summary className="ed-press-soft flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-(--r-card) px-4 text-[15px] font-semibold active:bg-(--wash) [&::-webkit-details-marker]:hidden">
            All {targets} product checks across {clips} clips
            <ChevronDown className="size-5 shrink-0 text-(--ink-3) transition-transform group-open:rotate-180" strokeWidth={2.25} aria-hidden />
          </summary>
          <div className="overflow-x-auto border-t border-(--hair)">
            <table className="w-full min-w-[520px] text-left text-[13.5px] tabular">
              <thead className="text-[12px] text-(--ink-3)">
                <tr>
                  <th className="px-4 py-2 font-semibold">Clip</th>
                  <th className="px-3 py-2 font-semibold">Product</th>
                  <th className="px-3 py-2 font-semibold">Labelled</th>
                  <th className="px-3 py-2 font-semibold">Counted</th>
                  <th className="px-3 py-2 font-semibold">Precision</th>
                  <th className="px-4 py-2 font-semibold">Recall</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--hair)">
                {verified.rows.map((r) => (
                  <tr key={`${r.clip}-${r.target}`} className="text-(--ink-2)">
                    <td className="px-4 py-2 text-(--ink)">{clipLabel(r.clip)}</td>
                    <td className="px-3 py-2">{targetName(r.target)}</td>
                    <td className="px-3 py-2">{r.truthSec.toFixed(1)} s</td>
                    <td className="px-3 py-2">{r.predictedSec.toFixed(1)} s</td>
                    <td className="px-3 py-2">{pct(r.precision)}</td>
                    <td className="px-4 py-2">{pct(r.recall)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>

        <div className="mt-12 flex flex-col gap-3 rounded-(--r-card) bg-(--ink) p-6 text-white sm:flex-row sm:items-center sm:justify-between">
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

/** "1 look-alike", "0 products". */
const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

/** Which clips must count 0 s, from the data: a look-alike alone in shot, or no product at all. */
function testSetNote(acc: ReturnType<typeof summarize>): string {
  const parts = [
    acc.lookalikeClips ? plural(acc.lookalikeClips, "clip") + " with only a look-alike in shot" : null,
    acc.emptyClips ? plural(acc.emptyClips, "clip") + " with no product" : null,
  ].filter(Boolean);
  return parts.length ? ` The test set includes ${parts.join(" and ")}, which must count 0 seconds.` : "";
}
