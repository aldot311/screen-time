import type { Metadata } from "next";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import data from "@/lib/accuracy-data.json";
import objects from "@/lib/open-weight-data.json";
import { TopBar } from "@/components/ed/top-bar";
import { PendingLink } from "@/components/ed/pending-link";
import { DISPLAY } from "@/components/ed/campaign-ui";
import { TrySample } from "@/components/ed/try-sample";

export const metadata: Metadata = {
  title: "Accuracy",
  description: "How often Screen-Time is right, measured frame by frame against checked labels, with and without Muse Spark.",
};

type Score = (typeof data.scores)[number];
const pct = (x: number | null) => (x === null ? "n/a" : `${(x * 100).toFixed(1)}%`);
const LABEL: Record<string, string> = { sam: "SAM 3.1 alone", verified: "SAM 3.1 + Muse Spark" };

/** Two honest misses from the same runs, each linked to its report at the moment it happens. */
const FAILURES = [
  {
    title: "Counted a sliver at the edge",
    clip: "clip01 · Alani Nu can",
    href: "/campaigns/alani-nu-test-runs/videos/clip01?t=5",
    what: "Precision 79%: 0.9 s more than the labels.",
    why: "As the can leaves the frame, SAM 3.1 keeps tracking a 13–32 px strip of it at the left edge for about a second after the labels mark it gone. The tracking is right; whether a sliver counts is a contract question, so the threshold was not tuned to this test set.",
  },
  {
    title: "Missed it at his side",
    clip: "clip15 · Stanley tumbler",
    href: "/campaigns/stanley-test-runs/videos/clip15?t=0",
    what: "Recall 75%: 0.9 s missed at the start (frames 0–12).",
    why: "The tumbler starts low at his side, small and half behind his leg, and SAM 3.1 only picks it up as it swings toward the camera. The report under-counts, so the brand sees less screen time than it got, never more.",
  },
];

export default function AccuracyPage() {
  const [sam, verified] = data.scores as [Score, Score];
  const targets = verified.rows.length;
  const clips = new Set(verified.rows.map((r) => r.clip)).size;
  return (
    <>
      <TopBar back={{ href: "/", label: "Screen-Time" }} />
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
          {/* The full table from sm up; phones get the before/after cards below, which carry the same numbers. */}
          <div className="mt-4 hidden overflow-x-auto rounded-(--r-card) bg-(--card) shadow-(--sh-1) ring-1 ring-(--hair) sm:block">
            <table className="w-full min-w-[560px] text-left text-[14px] tabular">
              <thead className="text-[12.5px] text-(--ink-3)">
                <tr className="border-b border-(--hair)">
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Pipeline
                  </th>
                  <th scope="col" className="px-3 py-3 font-semibold">
                    Precision
                  </th>
                  <th scope="col" className="px-3 py-3 font-semibold">
                    Recall
                  </th>
                  <th scope="col" className="px-3 py-3 font-semibold">
                    F1
                  </th>
                  <th scope="col" className="px-3 py-3 font-semibold">
                    Avg. error per clip
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Seconds counted where the product isn&rsquo;t
                  </th>
                </tr>
              </thead>
              <tbody>
                {[sam, verified].map((s) => (
                  <tr key={s.mode} className={s.mode === "verified" ? "font-semibold text-(--ink)" : "text-(--ink-2)"}>
                    <th scope="row" className="px-4 py-3 font-semibold">
                      {LABEL[s.mode]}
                    </th>
                    <td className="px-3 py-3">{pct(s.precision)}</td>
                    <td className="px-3 py-3">{pct(s.recall)}</td>
                    <td className="px-3 py-3">{pct(s.f1)}</td>
                    <td className="px-3 py-3">{s.meanAbsErrorSec.toFixed(2)} s</td>
                    <td className="px-4 py-3">{s.falseSecondsOnEmptyClips.toFixed(1)} s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
            Without the second model, a can of a different Alani flavor alone adds {sam.falseSecondsOnEmptyClips.toFixed(1)} s of &ldquo;screen time&rdquo; the brand
            never got, and a Stanley cup held beside the can is counted as the can. Muse Spark rejects them and cuts the average error from {sam.meanAbsErrorSec.toFixed(2)} s to{" "}
            {verified.meanAbsErrorSec.toFixed(2)} s, at the cost of {((Number(sam.recall) - Number(verified.recall)) * 100).toFixed(1)} points of recall.
          </p>
        </section>

        <section aria-labelledby="obj-h" className="mt-12">
          <h2 id="obj-h" className="ed-display text-[26px] leading-tight">
            Object by object
          </h2>
          <p className="mt-2 max-w-[62ch] text-[15px] leading-[1.55] text-(--ink-2)">
            Every object SAM 3.1 tracked was also labelled as the product or something else (a different flavor, a Stanley beside the can, a
            leather shoe among sneakers). Muse Spark called{" "}
            <span className="font-semibold text-(--ink) tabular">
              {Math.round((objects.hosted.accuracy ?? 0) * objects.hosted.objects)} of {objects.hosted.objects}
            </span>{" "}
            clearly visible objects correctly: no look-alike counted, no product missed. Four objects too blurred to judge are left out.
          </p>
        </section>

        <section aria-labelledby="miss-h" className="mt-12">
          <h2 id="miss-h" className="ed-display text-[26px] leading-tight">
            Where it is wrong
          </h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {FAILURES.map((f) => (
              <li key={f.clip} className="flex flex-col rounded-(--r-card) bg-(--card) p-4 shadow-(--sh-1) ring-1 ring-(--hair)">
                <p className="text-[12.5px] font-semibold text-(--ink-3)">{f.clip}</p>
                <h3 className="mt-1 text-[17px] font-semibold">{f.title}</h3>
                <p className="mt-1 text-[14px] font-semibold text-(--ink-2) tabular">{f.what}</p>
                <p className="mt-2 flex-1 text-[14px] leading-[1.5] text-(--ink-2)">{f.why}</p>
                <PendingLink
                  href={f.href}
                  className="ed-press mt-3 inline-flex h-11 items-center gap-1.5 self-start rounded-full bg-(--wash) px-4 text-[14px] font-semibold active:bg-(--hair)"
                >
                  Watch that moment <ArrowUpRight className="size-4" aria-hidden />
                </PendingLink>
              </li>
            ))}
          </ul>
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
              <span className="font-semibold text-(--ink)">Labels.</span> Drafted by two independent vision passes over frame-numbered grids, kept
              where both agreed, and spot-checked by a person. The test set includes a different Alani flavor that must be rejected and a clip with
              no product.
            </li>
            <li>
              <span className="font-semibold text-(--ink)">Scoring.</span> Per frame: a frame counts when the pipeline says the product is visible in
              it. Precision is the share of counted frames that were right; recall is the share of real frames that were counted.
            </li>
            <li>
              <span className="font-semibold text-(--ink)">Not yet measured.</span> The gain from the product photo (the test set predates it); a
              held-out set filmed by other people, which is being recorded now; and the same object check on Meta&rsquo;s open-weight Muse Spark
              Open, which is ready to run once a hosting provider is connected.
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
                    <td className="px-4 py-2 text-(--ink)">{r.clip.replace(/^stock\//, "stock ")}</td>
                    <td className="px-3 py-2">{r.target.replace(/-/g, " ")}</td>
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
