import type { Metadata } from "next";
import { ChevronDown } from "lucide-react";
import accuracy from "@/lib/accuracy-data.json";
import contractEval from "@/lib/contract-eval-data.json";
import openWeight from "@/lib/open-weight-data.json";
import { TopBar } from "@/components/ed/top-bar";
import { DISPLAY } from "@/components/ed/campaign-ui";
import { TrySample } from "@/components/ed/try-sample";
import {
  clipLabel,
  contractEvalSummary,
  labelProvenance,
  objectRows,
  payHoldSummary,
  pct,
  pctRange,
  pctRange0,
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

const data = accuracy as AccuracyData;

const CARD = "rounded-(--r-card) bg-(--card) shadow-(--sh-1) ring-1 ring-(--hair)";
const PROSE = "max-w-[62ch] text-[15px] leading-[1.55] text-(--ink-2)";

export default function AccuracyPage() {
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
  const headline = [
    { label: "Precision", value: verified.precision, ci: ci?.precision, gloss: "of the seconds it counted, the share that really showed the product" },
    { label: "Recall", value: verified.recall, ci: ci?.recall, gloss: "of the seconds the product really showed, the share it counted" },
    { label: "F1", value: verified.f1, ci: ci?.f1, gloss: "the two in one figure" },
  ];
  return (
    <>
      <TopBar back={{ href: "/", label: "Home" }} />
      <main className="mx-auto w-full max-w-[880px] px-4 pt-6 pb-24 sm:px-6 lg:pt-12">
        <h1 className={`${DISPLAY} text-[38px] leading-[1.02] sm:text-[56px]`}>Measured, not claimed.</h1>
        <p className="mt-3 max-w-[62ch] text-[16px] leading-[1.55] text-(--ink-2)">
          Screen-Time&rsquo;s own reports for {clips} test Reels, as delivered on this site, compared frame by frame with labels of where the
          product is on screen.{set ? ` ${set}.` : ""} Measured {data.measuredAt}.
        </p>

        <section aria-label="Overall, with Muse Spark" className="mt-6">
          <div className="grid gap-3 sm:grid-cols-3">
            {headline.map((h) => (
              <div key={h.label} className={`${CARD} p-4`}>
                <p className="text-[13px] font-semibold text-(--ink-3)">{h.label}</p>
                <p className="ed-display mt-1 text-[34px] leading-none tabular">{pct(h.value)}</p>
                {pctRange(h.ci) && <p className="mt-1.5 text-[13px] text-(--ink-3) tabular">95% interval {pctRange(h.ci)}</p>}
                <p className="mt-2 text-[13.5px] leading-[1.45] text-(--ink-2)">{h.gloss}</p>
              </div>
            ))}
          </div>
          {data.intervals && (
            <p className="mt-3 max-w-[62ch] text-[13.5px] leading-[1.5] text-(--ink-3)">
              The intervals come from resampling whole Reels ({data.intervals.resamples.toLocaleString("en-US")} draws, seed {data.intervals.seed}):
              they show how much the figures depend on which Reels are in the set, not how wrong the labels might be.
              {verified.rows.some((r) => r.recall === 0) && " Recall’s is wide because a Reel where the product was on screen counted nothing (see below)."}
            </p>
          )}
          {labels && (
            <p className="mt-3 max-w-[62ch] text-[14.5px] leading-[1.55] text-(--ink-2)">
              {labels.line}
              {labels.resolution && ` ${labels.resolution}`}
            </p>
          )}
        </section>

        <section aria-labelledby="ab-h" className="mt-12">
          <h2 id="ab-h" className="ed-display text-[26px] leading-tight">
            What Muse Spark adds
          </h2>
          <p className={`mt-1 ${PROSE}`}>
            The same runs, scored twice: once counting every object SAM 3.1 tracked for the prompt, once counting only the objects Muse Spark
            confirmed as the brand&rsquo;s product. No model was run again for this.
          </p>
          <div className={`mt-4 ${CARD}`}>
            <table className="w-full text-left text-[13.5px] tabular sm:text-[14px]">
              <thead className="text-[12px] text-(--ink-3) sm:text-[12.5px]">
                <tr className="border-b border-(--hair)">
                  <th className="px-3 py-2.5 font-semibold sm:px-4">Per frame</th>
                  <th className="px-2 py-2.5 font-semibold sm:px-4">SAM 3.1 alone</th>
                  <th className="px-3 py-2.5 font-semibold sm:px-4">+ Muse Spark</th>
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
                    <td className="px-2 py-2.5 sm:px-4">{m.a}</td>
                    <td className="px-3 py-2.5 font-semibold text-(--ink) sm:px-4">{m.b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={`mt-4 space-y-2 ${PROSE}`}>
            {story.map((s) => (
              <p key={s}>{s}</p>
            ))}
          </div>
        </section>

        {objects.length > 0 && data.objects && (
          <section aria-labelledby="obj-h" className="mt-12">
            <h2 id="obj-h" className="ed-display text-[26px] leading-tight">
              Object by object
            </h2>
            <p className={`mt-2 ${PROSE}`}>
              Every object SAM 3.1 tracked was also labelled from its crops as the product or something else: {data.objects.judged} could be
              judged{data.objects.unsure ? `, ${data.objects.unsure} too small to tell is left out` : ""}. The intervals are exact (Clopper-Pearson)
              95% intervals: with {data.objects.judged} objects they are wide.
            </p>
            <div className={`mt-4 ${CARD}`}>
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
              <p className="mt-3 max-w-[62ch] text-[13.5px] leading-[1.5] text-(--ink-3)">
                Meta&rsquo;s open-weight Muse Spark Open called {Math.round((openWeight.open.accuracy ?? 0) * openWeight.open.objects)} of{" "}
                {openWeight.open.objects} correctly ({openWeight.open.falseMatches} look-alikes counted, {openWeight.open.missedMatches} real cans
                called unclear), measured {openWeight.measuredAt} on crops from the earlier runs, which used our zoomed edit of George&rsquo;s Reel;
                it has not been run on the Reels as delivered.
              </p>
            )}
          </section>
        )}

        {payHold && (
          <section aria-labelledby="pay-h" className="mt-12">
            <h2 id="pay-h" className="ed-display text-[26px] leading-tight">
              Pay or hold
            </h2>
            <p className={`mt-2 ${PROSE}`}>{payHold.line}</p>
            {payHold.differ.length > 0 && (
              <ul className={`mt-2 list-disc space-y-1 pl-5 ${PROSE}`}>
                {payHold.differ.map((d) => (
                  <li key={d}>{d}.</li>
                ))}
              </ul>
            )}
            {spoken ? (
              <div className={`mt-3 space-y-1 ${PROSE}`}>
                {spoken.map((s) => (
                  <p key={s}>{s}</p>
                ))}
              </div>
            ) : (
              <p className={`mt-3 ${PROSE}`}>
                The spoken-name and ad-disclosure terms have no independent labels yet, so they are not scored here. The captions on these Reels
                were burned in by the builder from each Reel&rsquo;s own speech (Voice Transcribe), so the on-screen disclosure check is not
                independent of the spoken one either.
              </p>
            )}
          </section>
        )}

        <section aria-labelledby="miss-h" className="mt-12">
          <h2 id="miss-h" className="ed-display text-[26px] leading-tight">
            Where it is wrong
          </h2>
          {misses.length ? (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {misses.map((f) => (
                <li key={f.key} className={`flex flex-col p-4 ${CARD}`}>
                  <p className="text-[12.5px] font-semibold text-(--ink-3)">{f.clip}</p>
                  <h3 className="mt-1 text-[17px] font-semibold">{f.title}</h3>
                  <p className="mt-1 text-[14px] font-semibold text-(--ink-2) tabular">{f.what}</p>
                  <p className="mt-2 flex-1 text-[14px] leading-[1.5] text-(--ink-2)">{f.why}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className={`mt-2 ${PROSE}`}>Every labelled check scored 100% precision and recall.</p>
          )}
        </section>

        {evalSummary && (
          <section aria-labelledby="contract-h" className="mt-12">
            <h2 id="contract-h" className="ed-display text-[26px] leading-tight">
              Contract reading (Muse Spark)
            </h2>
            <p className="mt-2 max-w-[62ch] text-[17px] leading-[1.45] font-semibold text-(--ink)">{evalSummary.headline}</p>
            <ul className={`mt-2 list-disc space-y-1 pl-5 ${PROSE}`}>
              {evalSummary.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            <p className="mt-2 text-[13px] text-(--ink-3)">{evalSummary.footnote}</p>
          </section>
        )}

        <section aria-labelledby="how-h" className="mt-12">
          <h2 id="how-h" className="ed-display text-[26px] leading-tight">
            How it was measured
          </h2>
          <ul className="mt-3 max-w-[66ch] list-disc space-y-2 pl-5 text-[14.5px] leading-[1.55] text-(--ink-2)">
            <li>
              <span className="font-semibold text-(--ink)">Analysis rate.</span> Every video is re-encoded to {data.fps} fps before SAM 3.1, and
              SAM tracks every one of those frames. Scores compare those {data.fps} fps frames with the labels; the labels themselves were judged on
              every 3rd frame and each judgement stands for that frame and the next two.
            </li>
            <li>
              <span className="font-semibold text-(--ink)">Runs.</span> The scored reports are the ones this site shows for these Reels (one run
              each, kept in the repository under data/runs), so a report and its row here are the same run.
            </li>
            <li>
              <span className="font-semibold text-(--ink)">Labels.</span> Two independent Claude vision passes over frame-numbered grids at 5
              frames a second, kept where both agreed.{testSetNote(acc)}
            </li>
            <li>
              <span className="font-semibold text-(--ink)">Scoring.</span> Per frame: a frame counts when the pipeline says the product is visible in
              it. Precision is the share of counted frames that were right; recall is the share of real frames that were counted.
            </li>
            <li>
              <span className="font-semibold text-(--ink)">Not yet measured.</span> How much the product photo adds on its own: runs with and
              without it have not been compared on the same clips.
            </li>
            <li>
              <span className="font-semibold text-(--ink)">History.</span> Until Nov 4 this page scored a zoomed edit of George&rsquo;s Reel that we
              made (2.3x, following the can); it now scores the Reel as delivered.
            </li>
          </ul>
        </section>

        <details className={`group mt-10 ${CARD}`}>
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
                  <th className="px-1.5 py-2 font-semibold sm:px-3">Labelled</th>
                  <th className="px-1.5 py-2 font-semibold sm:px-3">Counted</th>
                  <th className="px-1.5 py-2 font-semibold sm:px-3">Precision</th>
                  <th className="py-2 pr-3 pl-1.5 font-semibold sm:px-4">Recall</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--hair)">
                {verified.rows.map((r) => (
                  <tr key={`${r.clip}-${r.target}`} className="text-(--ink-2)">
                    <td className="py-2 pr-1.5 pl-3 text-(--ink) sm:px-4">{clipLabel(r.clip)}</td>
                    <td className={`px-1.5 py-2 sm:px-3 ${oneProduct ? "hidden sm:table-cell" : ""}`}>{targetName(r.target)}</td>
                    <td className="px-1.5 py-2 sm:px-3">{tenths(r.truthSec)} s</td>
                    <td className="px-1.5 py-2 sm:px-3">{tenths(r.predictedSec)} s</td>
                    <td className="px-1.5 py-2 sm:px-3">{pct(r.precision)}</td>
                    <td className="py-2 pr-3 pl-1.5 sm:px-4">{pct(r.recall)}</td>
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
    acc.lookalikeClips ? plural(acc.lookalikeClips, "Reel") + " with only a look-alike in shot" : null,
    acc.emptyClips ? plural(acc.emptyClips, "Reel") + " with no product" : null,
  ].filter(Boolean);
  return parts.length ? ` The test set includes ${parts.join(" and ")}, which must count 0 seconds.` : "";
}
