// What each pipeline step found, shown under that step on the run page (live) and in the analysis replay. Every line
// is real output: frame count, SAM 3.1's objects and boxes, Muse Spark's call on each object with its reason, the
// brand words Voice Transcribe heard, the seconds measured, and the contract terms as they are checked.
import { Check, CircleHelp, Mic, X } from "lucide-react";
import type { StepId } from "@/lib/campaign/types";
import type { LiveProgress, VerifyVerdict } from "@/lib/types";
import { percent, shareShown, tenths, timecode } from "@/components/format";
import { Filmstrip } from "./filmstrip";

const tc = (s: number) => timecode(s).replace(/\.0$/, "");
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

const VERDICT: Record<VerifyVerdict, { label: string; cls: string }> = {
  match: { label: "Brand product", cls: "bg-(--signal) text-(--signal-ink)" },
  lookalike: { label: "Look-alike, rejected", cls: "border border-dashed border-(--reject) bg-(--card) text-(--reject)" },
  unclear: { label: "Unclear, not counted", cls: "bg-(--wash) text-(--ink-2)" },
};

export function StepFindings({ step, live, videoUrl, brand }: { step: StepId; live: LiveProgress; videoUrl?: string; brand: string }) {
  const line = "text-[13.5px] leading-[1.5] text-(--ink-2)";
  switch (step) {
    case "normalize": {
      const v = live.video;
      if (!v) return null;
      return (
        <p className={line}>
          <span className="tabular">{v.frameCount}</span> frames at 15 fps · <span className="tabular">{tenths(v.durationSec)}</span> s ·{" "}
          <span className="tabular">
            {v.width}×{v.height}
          </span>
        </p>
      );
    }
    case "track": {
      const searches = live.searches;
      if (!searches?.length) return null;
      const last = searches[searches.length - 1];
      const verdicts = Object.fromEntries((live.checks ?? []).filter((c) => c.prompt === last.prompt).map((c) => [c.objectId, c.verdict]));
      return (
        <div className="space-y-2.5">
          {searches.map((s, i) => (
            <div key={`${s.prompt}-${i}`} className="space-y-1.5">
              <p className={line}>
                {i > 0 && "Then "}SAM 3.1 searched <span className="tabular">{s.samFrames}</span> frames for{" "}
                <span className="font-semibold text-(--ink)">“{s.prompt}”</span>{" "}
                {s.objects ? <>and tracked {plural(s.objects, "object")}.</> : "and found nothing."}
              </p>
              {s.next && <p className={`${line} border-l-2 border-(--hair-2) pl-3`}>Muse Spark checked the video: “{s.next}” It suggested another word to search for{i === searches.length - 1 ? "…" : "."}</p>}
            </div>
          ))}
          {videoUrl && live.video && last.boxes.length > 0 && (
            <Filmstrip videoUrl={videoUrl} frameCount={live.video.frameCount} width={live.video.width} height={live.video.height} boxes={last.boxes} verdicts={verdicts} />
          )}
        </div>
      );
    }
    case "verify": {
      const checks = live.checks;
      if (!checks?.length) return null;
      return (
        <ul className="space-y-2">
          {checks.map((c, i) => (
            <li key={`${c.prompt}-${c.objectId}-${i}`} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-[12.5px] font-semibold text-(--ink-3) tabular">Object {c.objectId + 1}</span>
              <span className={`inline-flex h-6 items-center rounded-full px-2.5 text-[12px] font-semibold ${VERDICT[c.verdict].cls}`}>
                {VERDICT[c.verdict].label}
              </span>
              <span className={`${line} basis-full`}>Muse Spark: “{c.reason}”</span>
            </li>
          ))}
        </ul>
      );
    }
    case "listen": {
      const h = live.heard;
      if (!h) return null;
      if (h.audio === false) return <p className={line}>The video has no sound, so nothing could be heard.</p>;
      const said = [...h.mentions.map((m) => ({ ...m, kind: "brand" })), ...h.disclosures.map((m) => ({ ...m, kind: "ad" }))].sort(
        (a, b) => a.startSec - b.startSec,
      );
      if (!said.length) return <p className={line}>Voice Transcribe heard no mention of {brand} and no sponsorship disclosure.</p>;
      return (
        <ul className="flex flex-wrap gap-1.5" aria-label="Heard in the audio">
          {said.map((m, i) => (
            <li key={i} className="inline-flex h-7 items-center gap-1.5 rounded-full bg-(--voice-soft) px-2.5 text-[12.5px] font-semibold text-(--voice)">
              <Mic className="size-3.5" strokeWidth={2.5} aria-hidden />“{m.text}”<span className="ed-tc font-normal">{tc(m.startSec)}</span>
            </li>
          ))}
        </ul>
      );
    }
    case "measure": {
      const m = live.measured;
      if (!m) return null;
      return (
        <p className={line}>
          <span className="rounded-[4px] bg-(--signal) px-1 font-semibold text-(--signal-ink) tabular">{tenths(m.secondsOnScreen)} s</span> on screen ·{" "}
          {live.video ? shareShown(m.secondsOnScreen, live.video.durationSec) : percent(m.shareOfVideo)} of the video
          {m.firstSeenSec !== null && (
            <>
              {" "}
              · first seen at <span className="ed-tc">{tc(m.firstSeenSec)}</span>
            </>
          )}
        </p>
      );
    }
    case "contract": {
      const terms = live.terms;
      if (!terms?.length) return null;
      return (
        <ul className="space-y-1.5">
          {terms.map((t) => {
            const Icon = t.pass === true ? Check : t.pass === false ? X : CircleHelp;
            return (
              <li key={t.text} className="flex gap-2 text-[13.5px] leading-[1.45]">
                <Icon
                  className={`mt-[3px] size-4 shrink-0 ${t.pass === true ? "text-(--pass)" : t.pass === false ? "text-(--short)" : "text-(--review)"}`}
                  strokeWidth={3}
                  aria-label={t.pass === true ? "Met" : t.pass === false ? "Missed" : "Not checkable"}
                />
                <span>
                  <span className="font-semibold text-(--ink)">{t.text}</span> <span className="text-(--ink-2)">· {t.detail.replace(/\.$/, "")}</span>
                </span>
              </li>
            );
          })}
        </ul>
      );
    }
  }
}
