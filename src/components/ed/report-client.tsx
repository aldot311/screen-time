"use client";

// The interactive report. Video first on a phone, then the verdict as a sentence, then the contract. Every term, number,
// object and mention is a button that plays the moment proving it, flashes it on the lane timeline, and says what is
// playing. On a phone, once the player is out of view (or a term is played below it) one frosted dock sits above the
// tab bar with the same video, play/pause, timecode, the counted figure and a mini strip with the evidence lit.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, CircleHelp, Mic, Pause, Play, ScanLine, X } from "lucide-react";
import { FPS, type Segment, type TermResult, type VideoReport } from "@/lib/types";
import { countedBefore, framesToSegments, percent, termCounts, termWindow, timecode, verdictOf, type Verdict } from "@/components/format";
import { Player, type PlayerHandle } from "./player";
import { Strip } from "./strip";
import { Figure, Swatch } from "./bits";
import { ReportLanes, type Lit } from "./report-lanes";

interface Props {
  report: VideoReport;
  videoUrl: string;
  cropUrls: Record<string, string>;
  names: Record<string, string>;
  creator: string;
  title: string;
  brand: string;
  /** The stored still: the player's poster and the stage's blurred backdrop. */
  poster?: string;
  /** Preview reports: numbers from hand labels, no boxes, no audio. */
  synthetic?: boolean;
}

interface Proof {
  from: number;
  to: number;
  /** What tapping plays, in words: "Play the first 5 s". */
  label: string;
  lead: number;
}

const VISIBILITY = { clear: "Label readable", partial: "Partly covered", blurred: "Blurred" } as const;

const VERDICT_SOLID: Record<Verdict, { card: string; badge: string; Icon: typeof Check; word: string }> = {
  delivered: { card: "bg-(--pass-soft)", badge: "bg-(--pass) text-white", Icon: Check, word: "Delivered" },
  short: { card: "bg-(--short-soft)", badge: "bg-(--short) text-white", Icon: X, word: "Fell short" },
  review: { card: "bg-(--review-soft)", badge: "bg-(--review) text-white", Icon: CircleHelp, word: "Needs review" },
  pending: { card: "bg-(--wash)", badge: "bg-(--ink-3) text-white", Icon: CircleHelp, word: "Not run" },
};

const DOCK_VIDEO =
  "fixed bottom-[calc(env(safe-area-inset-bottom)+74px)] left-4 z-50 aspect-[9/16] w-[52px] overflow-hidden rounded-[12px] shadow-(--sh-2) ring-1 ring-black/10 sm:left-6 md:bottom-[calc(env(safe-area-inset-bottom)+20px)]";

export function ReportClient({ report, videoUrl, cropUrls, names, creator, title, brand, poster, synthetic = false }: Props) {
  const player = useRef<PlayerHandle>(null);
  const stage = useRef<HTMLDivElement>(null);
  const ratioRef = useRef(1);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [ratio, setRatio] = useState(1);
  const [termDock, setTermDock] = useState(false);
  const [wide, setWide] = useState(false);
  const [focus, setFocus] = useState<TermResult | null>(null);
  const [preview, setPreview] = useState<Segment | null>(null);
  const [lit, setLit] = useState<Lit | null>(null);
  const [nowPlaying, setNowPlaying] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; key: number } | null>(null);

  const m = report.metrics;
  const d = report.info.durationSec;
  const verdict = verdictOf(report);
  const counts = termCounts(report.terms);
  const boxes = useMemo(() => report.detections ?? [], [report.detections]);
  const rejectedSegs = useMemo(() => framesToSegments(boxes.filter((b) => b.verdict !== "match").map((b) => b.frame)), [boxes]);
  const longest = useMemo(
    () => m.segments.reduce<Segment | null>((b, s) => (!b || s.endSec - s.startSec > b.endSec - b.startSec ? s : b), null),
    [m.segments],
  );
  const allOn: Segment | null = m.segments.length ? { startSec: m.segments[0].startSec, endSec: m.segments[m.segments.length - 1].endSec } : null;
  const perObject = useMemo(() => {
    const out = new Map<number, { first: number; largest: number; area: number }>();
    for (const b of boxes) {
      const t = b.frame / FPS;
      const cur = out.get(b.objectId);
      if (!cur) out.set(b.objectId, { first: t, largest: t, area: b.areaFraction });
      else {
        cur.first = Math.min(cur.first, t);
        if (b.areaFraction > cur.area) Object.assign(cur, { largest: t, area: b.areaFraction });
      }
    }
    return out;
  }, [boxes]);
  const largestMatch = useMemo(() => {
    let best: { t: number; a: number } | null = null;
    for (const b of boxes) if (b.verdict === "match" && (!best || b.areaFraction > best.a)) best = { t: b.frame / FPS, a: b.areaFraction };
    return best?.t ?? null;
  }, [boxes]);

  // How much of the main player is on screen decides the dock.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        ratioRef.current = e.intersectionRatio;
        setRatio(e.intersectionRatio);
        if (e.intersectionRatio >= 0.95) setTermDock(false);
      },
      { threshold: [0, 0.2, 0.35, 0.5, 0.75, 0.95, 1] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setWide(mq.matches);
    mq.addEventListener("change", on);
    const id = requestAnimationFrame(on);
    return () => {
      mq.removeEventListener("change", on);
      cancelAnimationFrame(id);
    };
  }, []);
  const docked = !wide && (ratio < 0.35 || (termDock && ratio < 0.95));

  // The toast confirms a jump, sits above the dock, never takes taps, and leaves on its own.
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(id);
  }, [toast]);

  const onPlayingChange = useCallback((p: boolean) => {
    setPlaying(p);
    if (p) setStarted(true);
  }, []);

  const seek = useCallback((sec: number) => {
    player.current?.seek(sec);
    setTime(sec);
    setStarted(true);
  }, []);

  /** Play a stretch of proof, light it on the timeline, and say what is playing. */
  const show = useCallback(
    (proof: Proof, term: TermResult | null, segs: Segment[], window: Segment | null) => {
      setFocus(term);
      setLit((l) => ({ segs, window, key: (l?.key ?? 0) + 1 }));
      setNowPlaying(term ? term.term.text : proof.label);
      setToast((t) => ({ text: `${proof.label} · ${timecode(proof.from)}`, key: (t?.key ?? 0) + 1 }));
      const start = Math.max(0, proof.from - proof.lead);
      player.current?.playFrom(start, proof.to + 0.4);
      setTime(start);
      setStarted(true);
      if (!wide && ratioRef.current < 0.95) setTermDock(true);
    },
    [wide],
  );

  const termProof = (t: TermResult): Proof | null => {
    const rule = t.term.rule;
    const ev = t.evidence[0];
    const win = termWindow(rule);
    if (rule?.kind === "min_seconds_within") return { from: 0, to: rule.withinFirstSec, label: `Play the first ${rule.withinFirstSec} s`, lead: 0 };
    if (rule?.kind === "min_seconds_total" && allOn)
      return { from: allOn.startSec, to: allOn.endSec, label: `Play all ${m.secondsOnScreen.toFixed(1)} s on screen`, lead: 0.3 };
    if (rule?.kind === "min_continuous" && longest) return { from: longest.startSec, to: longest.endSec, label: "Play the longest run", lead: 0.3 };
    if (rule?.kind === "mentioned") {
      const mn = m.mentions.find((x) => !rule.withinFirstSec || x.startSec <= rule.withinFirstSec);
      if (mn) return { from: mn.startSec, to: mn.endSec + 0.6, label: `Hear “${mn.text}”`, lead: 0.8 };
      return win ? { from: 0, to: win.endSec, label: `Play the first ${win.endSec} s`, lead: 0 } : null;
    }
    if (rule?.kind === "first_seen_before") {
      if (m.firstSeenSec !== null) return { from: m.firstSeenSec, to: m.firstSeenSec + 1.5, label: "Play the first sighting", lead: 0.3 };
      return { from: 0, to: rule.seconds, label: `Play the first ${rule.seconds} s`, lead: 0 };
    }
    if (rule?.kind === "min_area" && (ev || largestMatch !== null)) {
      const at = ev?.startSec ?? largestMatch!;
      return { from: at, to: ev?.endSec ?? at + 1.5, label: "Play it at its largest", lead: 0.3 };
    }
    if (ev) return { from: ev.startSec, to: ev.endSec, label: "Play the proof", lead: 0.3 };
    return null;
  };

  const playTerm = (t: TermResult, proof: Proof) => {
    if (focus === t && playing) {
      player.current?.toggle();
      return;
    }
    show(proof, t, t.evidence.length ? t.evidence : [{ startSec: proof.from, endSec: proof.to }], termWindow(t.term.rule));
  };
  const playRange = (from: number, to: number, label: string, lead = 0.3) =>
    show({ from, to, label, lead }, null, [{ startSec: from, endSec: to }], null);

  const scrollToPlayer = () => stage.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const counted = countedBefore(m, time);
  const tone = VERDICT_SOLID[verdict];
  const headline =
    verdict === "delivered"
      ? `${brand} was on screen, and the contract was met.`
      : verdict === "short"
        ? m.secondsOnScreen === 0
          ? `${brand} never counted on screen, so the contract fell short.`
          : `${brand} was on screen, but the contract fell short.`
        : verdict === "review"
          ? report.terms.length
            ? `${brand} was on screen; a person needs to check ${counts.unchecked === 1 ? "one term" : `${counts.unchecked} terms`}.`
            : `No contract terms were set, so a person needs to check this one.`
          : `Not analysed yet.`;
  const objectName = (id: number, match: boolean) => names[id] ?? (match ? `${brand} ${report.prompt}` : `Another ${report.prompt}`);
  const rejectedTracks = report.tracks.filter((t) => t.verdict !== "match");
  const summary = started ? (
    <>
      <span className="ed-num text-[22px] text-(--ink)">
        <Figure value={counted} />
      </span>{" "}
      s counted so far
    </>
  ) : (
    <>
      <span className="ed-num text-[22px] text-(--ink)">
        <Figure value={m.secondsOnScreen} />
      </span>{" "}
      s on screen of {d.toFixed(1)} s
    </>
  );

  const lanes = (
    <ReportLanes
      durationSec={d}
      segments={m.segments}
      mentions={m.mentions}
      rejected={rejectedSegs}
      playheadSec={time}
      showPlayhead={started}
      lit={lit}
      preview={preview}
      firstSeenSec={m.firstSeenSec}
      longest={longest}
      onSeek={seek}
    />
  );
  const timelineCard = (
    <div className="rounded-(--r-card) bg-(--card) p-4 shadow-(--sh-2) ring-1 ring-(--hair) sm:p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <p className="text-[14px] text-(--ink-2)" aria-live="off">
          {summary}
        </p>
        <span className={`ed-tc text-[13px] text-(--ink-2) transition-opacity duration-150 ${started ? "opacity-100" : "opacity-0"}`}>
          {timecode(time)}
        </span>
      </div>
      {lanes}
      <p className="mt-3 border-t border-(--hair) pt-3 text-[12.5px] leading-[1.5] text-(--ink-3)">
        {synthetic ? (
          "Preview reports mark when the product is on screen, not where, so no boxes are drawn."
        ) : (
          <>
            Boxes come from SAM 3.1 tracking &ldquo;{report.prompt}&rdquo;. Lime is counted; dashed red was rejected as a look-alike.
          </>
        )}
      </p>
    </div>
  );

  return (
    <div className="grid gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      {/* Player: the hero on a phone, a sticky column on desktop with the lane timeline under it. */}
      <aside aria-label="Video and timeline" className="min-w-0 lg:sticky lg:top-[76px] lg:self-start">
        <div
          ref={stage}
          className="relative -mx-4 scroll-mt-[64px] overflow-hidden bg-(--ink) px-4 py-3 sm:mx-0 sm:rounded-(--r-card) sm:py-4 lg:py-5"
        >
          {poster && (
            // eslint-disable-next-line @next/next/no-img-element -- the stored still, blurred into a backdrop only
            <img src={poster} alt="" aria-hidden className="absolute inset-0 size-full scale-125 object-cover opacity-55 blur-2xl" />
          )}
          <div className="relative mx-auto w-[min(100%,calc(58svh*0.5625))] lg:w-[min(100%,calc((100svh-360px)*0.5625))]">
            <Player
              ref={player}
              src={videoUrl}
              width={report.info.width}
              height={report.info.height}
              boxes={boxes}
              durationSec={d}
              onTime={setTime}
              onPlayingChange={onPlayingChange}
              docked={docked}
              onDockedTap={scrollToPlayer}
              poster={poster}
              showBoxes={!synthetic}
              dockClassName={DOCK_VIDEO}
              rounded="rounded-[18px]"
            />
          </div>
        </div>
        <div className="mt-4 hidden lg:block">{timelineCard}</div>
      </aside>

      <div className="min-w-0 space-y-10">
        {/* Verdict as a sentence, the key number right under it. */}
        <header className={`rounded-(--r-card) p-5 sm:p-6 ${tone.card}`}>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 text-[14px] text-(--ink-2)">
            <span className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-semibold ${tone.badge}`}>
              <tone.Icon className="size-4" strokeWidth={3} aria-hidden />
              {tone.word}
            </span>
            <span className="font-semibold text-(--ink)">{title}</span>
            <span aria-hidden>·</span>
            <span className="truncate">{creator}</span>
          </div>
          <h1 className="ed-display mt-4 text-[30px] leading-[1.08] sm:text-[40px] lg:text-[44px]">{headline}</h1>
          <div className="mt-4 flex flex-wrap gap-2">
            {allOn ? (
              <button
                type="button"
                onClick={() => playRange(allOn.startSec, allOn.endSec, `All ${m.secondsOnScreen.toFixed(1)} s on screen`)}
                className="ed-press ed-press-soft inline-flex min-h-11 items-center gap-2 rounded-full bg-(--card) px-4 text-[14.5px] text-(--ink-2) shadow-(--sh-1) hover:shadow-(--sh-2) active:bg-(--wash)"
              >
                <Swatch kind="signal" />
                <span>
                  <span className="font-semibold text-(--ink) tabular">{m.secondsOnScreen.toFixed(1)} s</span> on screen of {d.toFixed(1)} s ·{" "}
                  <span className="tabular">{percent(m.shareOfVideo)}</span>
                </span>
                <Play className="size-3 text-(--ink-3)" fill="currentColor" strokeWidth={0} aria-hidden />
              </button>
            ) : (
              <span className="inline-flex min-h-11 items-center gap-2 rounded-full bg-(--card)/70 px-4 text-[14.5px] text-(--ink-2)">
                <span className="font-semibold text-(--ink) tabular">0.0 s</span> counted in {d.toFixed(1)} s
              </span>
            )}
            {rejectedSegs.length > 0 && (
              <button
                type="button"
                onClick={() => playRange(rejectedSegs[0].startSec, rejectedSegs[0].endSec, "Look-alike, not counted")}
                className="ed-press ed-press-soft inline-flex min-h-11 items-center gap-2 rounded-full bg-(--card) px-4 text-[14.5px] text-(--ink-2) shadow-(--sh-1) hover:shadow-(--sh-2) active:bg-(--wash)"
              >
                <ScanLine className="size-4 text-(--reject)" strokeWidth={2.25} aria-hidden />
                <span>
                  <span className="font-semibold text-(--ink) tabular">{rejectedTracks.length || 1}</span> look-alike
                  {(rejectedTracks.length || 1) === 1 ? "" : "s"} rejected
                </span>
                <Play className="size-3 text-(--ink-3)" fill="currentColor" strokeWidth={0} aria-hidden />
              </button>
            )}
          </div>
          <p className="mt-4 text-[14.5px] leading-[1.55] text-(--ink-2)">
            {counts.passed} of {report.terms.length} contract terms met
            {counts.unchecked ? `, ${counts.unchecked} not checkable` : ""}.{" "}
            {synthetic ? "Preview numbers from hand-checked labels." : <>SAM 3.1 tracked &ldquo;{report.prompt}&rdquo; in every frame; Muse Spark kept only the {brand} product.</>}
          </p>
        </header>

        {/* Contract terms: the whole row plays what it proves. */}
        <section aria-labelledby="terms-h">
          <h2 id="terms-h" className="ed-display text-[26px] leading-tight">
            Contract
          </h2>
          <p className="mt-1 text-[14px] text-(--ink-3)">Tap a term to play its proof.</p>
          <ol className="mt-4 space-y-2.5">
            {report.terms.map((t) => {
              const state = t.pass === true ? "pass" : t.pass === false ? "fail" : "unsure";
              const Icon = state === "pass" ? Check : state === "fail" ? X : CircleHelp;
              const proof = termProof(t);
              const active = focus === t;
              const live = active && playing;
              const mark = (
                <span
                  className={[
                    "grid size-8 place-items-center rounded-full",
                    { pass: "bg-(--pass-soft) text-(--pass)", fail: "bg-(--short-soft) text-(--short)", unsure: "bg-(--review-soft) text-(--review)" }[state],
                  ].join(" ")}
                >
                  <Icon className="size-4" strokeWidth={2.75} aria-hidden />
                  <span className="sr-only">{state === "pass" ? "Met" : state === "fail" ? "Not met" : "Not checkable"}</span>
                </span>
              );
              const text = (
                <span className="min-w-0">
                  <span className="block text-[15.5px] leading-snug font-semibold">{t.term.text}</span>
                  <span className="mt-0.5 block text-[14px] text-(--ink-2)">{t.detail}</span>
                </span>
              );
              if (!proof)
                return (
                  <li key={t.term.text} className="grid min-h-[72px] grid-cols-[32px_1fr] items-start gap-3 rounded-(--r-inner) bg-(--card) p-4 shadow-(--sh-1) ring-1 ring-(--hair)">
                    {mark}
                    <span className="min-w-0">
                      {text}
                      <span className="mt-2 block text-[13px] text-(--ink-3)">Nothing on screen or heard to play for this term.</span>
                    </span>
                  </li>
                );
              return (
                <li key={t.term.text}>
                  <button
                    type="button"
                    aria-pressed={live}
                    onClick={() => playTerm(t, proof)}
                    onPointerEnter={(e) => e.pointerType === "mouse" && setPreview(termWindow(t.term.rule))}
                    onPointerLeave={() => setPreview(null)}
                    className={[
                      "ed-press ed-press-soft group grid min-h-[72px] w-full grid-cols-[32px_1fr] items-start gap-x-3 gap-y-3 rounded-(--r-inner) bg-(--card) p-4 text-left shadow-(--sh-1)",
                      active ? "ring-2 ring-(--ink)" : "ring-1 ring-(--hair) hover:ring-(--hair-2)",
                      "active:bg-(--wash)",
                    ].join(" ")}
                  >
                    {mark}
                    {text}
                    <span
                      className={[
                        "col-start-2 inline-flex h-9 max-w-full items-center gap-2 justify-self-start rounded-full whitespace-nowrap pr-3.5 pl-3 text-[13.5px] font-semibold transition-colors duration-100",
                        live ? "bg-(--ink) text-white" : "bg-(--wash) text-(--ink) group-hover:bg-(--hair)",
                      ].join(" ")}
                    >
                      {live ? (
                        <Pause className="size-3.5" fill="currentColor" strokeWidth={0} aria-hidden />
                      ) : (
                        <Play className="size-3.5" fill="currentColor" strokeWidth={0} aria-hidden />
                      )}
                      {live ? "Playing" : proof.label}
                      <span className={`text-[12.5px] font-medium tabular ${live ? "text-white/70" : "text-(--ink-3)"}`}>
                        {secs(proof.from)}–{secs(Math.min(proof.to, d))} s
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
            {!report.terms.length && <li className="rounded-(--r-inner) bg-(--card) p-4 text-(--ink-3)">No contract terms were set for this campaign.</li>}
          </ol>
        </section>

        {/* The lane timeline sits here on a phone (under the player on desktop). */}
        <section aria-labelledby="tl-h" className="lg:hidden">
          <h2 id="tl-h" className="ed-display mb-4 text-[26px] leading-tight">
            Timeline
          </h2>
          {timelineCard}
        </section>

        {/* Screen time: every figure plays its moment. */}
        <section aria-labelledby="time-h">
          <h2 id="time-h" className="ed-display text-[26px] leading-tight">
            Screen time
          </h2>
          {allOn ? (
            <button
              type="button"
              onClick={() => playRange(allOn.startSec, allOn.endSec, `All ${m.secondsOnScreen.toFixed(1)} s on screen`)}
              className="ed-press ed-press-soft mt-3 block w-full rounded-(--r-card) text-left active:opacity-80"
            >
              <span className="flex items-baseline gap-2">
                <span className="ed-num text-[76px] leading-[0.9] sm:text-[96px]">
                  <Figure value={m.secondsOnScreen} />
                </span>
                <span className="ed-display text-[26px] text-(--ink-2)">s</span>
              </span>
              <span className="mt-2 flex items-start gap-2 text-[15px] text-(--ink-2)">
                <span className="mt-[5px]">
                  <Swatch kind="signal" />
                </span>
                on screen of {d.toFixed(1)} s. Tap to play every second counted.
              </span>
            </button>
          ) : (
            <p className="mt-3">
              <span className="flex items-baseline gap-2">
                <span className="ed-num text-[76px] leading-[0.9] text-(--ink-3) sm:text-[96px]">0.0</span>
                <span className="ed-display text-[26px] text-(--ink-3)">s</span>
              </span>
              <span className="mt-2 block text-[15px] text-(--ink-2)">The {brand} product was never confirmed on screen.</span>
            </p>
          )}

          <ul className="mt-6 divide-y divide-(--hair) overflow-hidden rounded-(--r-card) bg-(--card) shadow-(--sh-1) ring-1 ring-(--hair)">
            <MetricRow
              label="Share of the video"
              value={percent(m.shareOfVideo)}
              hint={allOn ? `Plays ${timecode(allOn.startSec)} to ${timecode(allOn.endSec)}` : undefined}
              onClick={allOn ? () => playRange(allOn.startSec, allOn.endSec, `Share of the video`) : undefined}
            />
            <MetricRow
              label="First seen"
              value={m.firstSeenSec === null ? "Never" : timecode(m.firstSeenSec)}
              mono
              hint={m.firstSeenSec !== null ? "Plays the first sighting" : undefined}
              onClick={m.firstSeenSec === null ? undefined : () => playRange(m.firstSeenSec!, m.firstSeenSec! + 1.5, "First seen")}
            />
            <MetricRow
              label="Longest continuous run"
              value={`${m.longestRunSec.toFixed(1)} s`}
              hint={longest ? `Plays ${timecode(longest.startSec)} to ${timecode(longest.endSec)}` : undefined}
              onClick={longest ? () => playRange(longest.startSec, longest.endSec, "Longest run") : undefined}
            />
            <MetricRow
              label="Average size in frame"
              value={percent(m.avgAreaFraction, 1)}
              hint={largestMatch !== null ? `Plays it at its largest, ${timecode(largestMatch)}` : undefined}
              onClick={largestMatch !== null ? () => playRange(largestMatch, largestMatch + 1.2, "Largest in frame") : undefined}
            />
            <MetricRow
              label="Prominence"
              value={`${Math.round(m.prominenceScore)}`}
              suffix="/ 100"
              hint="From time on screen, size, centring and how early it appears"
              onClick={largestMatch !== null ? () => playRange(largestMatch, largestMatch + 1.2, "Most prominent moment") : undefined}
            />
            <MetricRow
              label="Spoken mentions"
              value={`${m.mentions.length}`}
              hint={m.mentions[0] ? `Plays “${m.mentions[0].text}” at ${timecode(m.mentions[0].startSec)}` : synthetic ? "Audio is not analysed in the preview" : undefined}
              onClick={m.mentions[0] ? () => playRange(m.mentions[0].startSec, m.mentions[0].endSec + 0.6, `Hear “${m.mentions[0].text}”`, 0.8) : undefined}
            />
          </ul>
        </section>

        {/* What the tracker found, kept and rejected. */}
        <section aria-labelledby="found-h">
          <h2 id="found-h" className="ed-display text-[26px] leading-tight">
            What SAM found
          </h2>
          <p className="mt-1 max-w-[60ch] text-[14px] text-(--ink-3)">
            Muse Spark checked every object against the brief. Rejected objects are shown for transparency and never count.
          </p>
          {report.promptAttempts && report.promptAttempts.length > 1 && (
            <ol className="mt-4 space-y-3 rounded-(--r-inner) bg-(--wash) p-4 text-[14.5px] text-(--ink-2)">
              {report.promptAttempts.map((a, i) => (
                <li key={a.prompt} className="grid grid-cols-[22px_1fr] gap-2.5">
                  <span className="ed-num grid size-[22px] place-items-center rounded-full bg-(--card) text-[12px] text-(--ink) shadow-(--sh-1)">{i + 1}</span>
                  <span>
                    SAM searched for <span className="font-semibold text-(--ink)">&ldquo;{a.prompt}&rdquo;</span>:{" "}
                    {a.matched
                      ? `found the product${a.objects > a.matched ? ` among ${a.objects} objects` : ""}.`
                      : a.objects
                        ? `${a.objects} object${a.objects === 1 ? "" : "s"}, none the product.`
                        : "nothing."}
                    {a.next && report.promptAttempts![i + 1] && (
                      <span className="mt-1 block text-(--ink-3)">
                        Muse Spark watched the video and suggested &ldquo;{report.promptAttempts![i + 1].prompt}&rdquo;: {a.next}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          )}
          <ul className="mt-4 grid gap-3 xl:grid-cols-2">
            {report.tracks.map((t) => {
              const match = t.verdict === "match";
              const crop = cropUrls[t.objectId];
              const at = perObject.get(t.objectId);
              const name = objectName(t.objectId, match);
              const body = (
                <>
                  <span
                    className={[
                      "relative block aspect-[3/4] overflow-hidden rounded-[14px] bg-(--wash)",
                      match ? "ring-[3px] ring-(--signal)" : "outline-2 outline-offset-2 outline-(--reject) outline-dashed",
                    ].join(" ")}
                  >
                    {crop ? (
                      // eslint-disable-next-line @next/next/no-img-element -- stored stills, already small JPEGs
                      <img src={crop} alt={name} className="size-full object-cover" />
                    ) : (
                      <span className={`absolute inset-3 rounded-[8px] ${match ? "bg-(--signal)/50" : "bg-(--reject-soft)"}`} aria-hidden />
                    )}
                  </span>
                  <span className="min-w-0 py-1">
                    <span
                      className={[
                        "inline-flex h-6 items-center rounded-full px-2.5 text-[12px] font-semibold",
                        match ? "bg-(--signal) text-(--signal-ink)" : "bg-(--reject-soft) text-(--reject)",
                      ].join(" ")}
                    >
                      {match ? "Counted" : t.verdict === "lookalike" ? "Look-alike · not counted" : "Unclear · not counted"}
                    </span>
                    <span className="mt-2 block text-[16px] leading-snug font-semibold">{name}</span>
                    <span className="mt-1 block text-[14px] leading-[1.5] text-(--ink-2)">{t.reason}</span>
                    <span className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-(--ink-3)">
                      <span>{VISIBILITY[t.visibility]}</span>
                      {at && (
                        <span className="inline-flex items-center gap-1 font-semibold text-(--ink)">
                          <Play className="size-3" fill="currentColor" strokeWidth={0} aria-hidden />
                          Largest at <span className="ed-tc font-normal">{timecode(at.largest)}</span>
                        </span>
                      )}
                    </span>
                  </span>
                </>
              );
              const cls = "grid h-full w-full grid-cols-[96px_1fr] gap-4 rounded-(--r-card) bg-(--card) p-3 text-left shadow-(--sh-1) ring-1 ring-(--hair)";
              return (
                <li key={t.objectId}>
                  {at ? (
                    <button
                      type="button"
                      onClick={() => playRange(at.largest, at.largest + 1.5, name)}
                      className={`ed-press ed-press-soft ${cls} hover:ring-(--hair-2) active:bg-(--wash)`}
                    >
                      {body}
                    </button>
                  ) : (
                    <div className={cls}>{body}</div>
                  )}
                </li>
              );
            })}
            {!report.tracks.length && <li className="rounded-(--r-inner) bg-(--card) p-4 text-(--ink-3)">Nothing matching &ldquo;{report.prompt}&rdquo; appeared.</li>}
          </ul>
        </section>

        {/* Spoken mentions */}
        <section aria-labelledby="said-h">
          <h2 id="said-h" className="ed-display text-[26px] leading-tight">
            Said aloud
          </h2>
          <p className="mt-1 text-[14px] text-(--ink-3)">Heard by Muse Voice Transcribe. Tap one to hear it.</p>
          <ul className="mt-4 space-y-2">
            {m.mentions.map((mn) => (
              <li key={mn.startSec}>
                <button
                  type="button"
                  onClick={() => playRange(mn.startSec, mn.endSec + 0.6, `Hear “${mn.text}”`, 0.8)}
                  className="ed-press ed-press-soft flex min-h-14 w-full items-center gap-3 rounded-(--r-inner) bg-(--card) px-4 py-3 text-left shadow-(--sh-1) ring-1 ring-(--hair) hover:ring-(--hair-2) active:bg-(--voice-soft)"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-(--voice-soft) text-(--voice)">
                    <Mic className="size-4" strokeWidth={2.25} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 text-[16px] font-medium">&ldquo;{mn.text}&rdquo;</span>
                  <span className="ed-tc text-[13px] text-(--voice)">{timecode(mn.startSec)}</span>
                </button>
              </li>
            ))}
            {!m.mentions.length && (
              <li className="rounded-(--r-inner) bg-(--card) p-4 text-(--ink-3) ring-1 ring-(--hair)">
                {synthetic ? "Audio is not analysed in the preview." : "The brand name was not heard."}
              </li>
            )}
          </ul>
          <p className="mt-10 border-t border-(--hair) pt-4 text-[12.5px] text-(--ink-3)">
            {synthetic
              ? "Preview: these numbers come from hand-checked labels run through Screen-Time's real metrics and contract code, not from a live model run."
              : `Analysed ${report.info.frameCount} frames at 15 fps · Meta API cost $${report.cost.usd.toFixed(3)}`}
          </p>
        </section>
      </div>

      {/* Toast: only when the dock is not showing (the dock's title already names what plays). Above the tab bar,
          takes no taps, leaves on its own. */}
      {toast && !docked && (
        <div
          key={toast.key}
          role="status"
          className={[
            "ed-dock-in pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4 lg:hidden",
            "bottom-[calc(env(safe-area-inset-bottom)+70px)] md:bottom-[calc(env(safe-area-inset-bottom)+20px)]",
          ].join(" ")}
        >
          <span className="max-w-full truncate rounded-full bg-(--ink) px-4 py-2 text-[13.5px] font-semibold text-white shadow-(--sh-3)">{toast.text}</span>
        </div>
      )}

      {/* Phone dock: the same video (moved, not restarted), play/pause, timecode, counted figure, mini strip. */}
      {docked && (
        <div
          role="region"
          aria-label="Mini player"
          className="ed-glass ed-dock-in fixed right-2 bottom-[calc(env(safe-area-inset-bottom)+66px)] left-2 z-40 rounded-[20px] py-2 pr-2 pl-[68px] shadow-(--sh-3) ring-1 ring-black/5 sm:right-auto sm:left-4 sm:w-[480px] md:bottom-[calc(env(safe-area-inset-bottom)+12px)]"
        >
          <div className="flex min-h-[92px] items-center gap-2">
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
              <p className="truncate text-[13.5px] font-semibold" aria-live="polite">
                {nowPlaying ?? `${title} · ${creator}`}
              </p>
              <Strip
                durationSec={d}
                segments={m.segments}
                mentions={m.mentions}
                rejected={rejectedSegs}
                playheadSec={time}
                window={lit?.window ?? null}
                evidence={lit?.segs ?? []}
                flashKey={lit?.key ?? 0}
                onSeek={seek}
                size="compact"
                ruler={false}
              />
              <p className="flex justify-between gap-2 text-[12.5px] text-(--ink-2)">
                <span>
                  <span className="font-semibold text-(--ink) tabular">{(started ? counted : m.secondsOnScreen).toFixed(1)} s</span>{" "}
                  {started ? "counted so far" : `on screen of ${d.toFixed(1)} s`}
                </span>
                {started && <span className="ed-tc">{timecode(time)}</span>}
              </p>
            </div>
            <button
              type="button"
              onClick={() => player.current?.toggle()}
              className="ed-press grid size-11 shrink-0 place-items-center rounded-full bg-(--ink) text-white active:bg-black"
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? <Pause className="size-4" fill="currentColor" strokeWidth={0} /> : <Play className="ml-0.5 size-4" fill="currentColor" strokeWidth={0} />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** 0 -> "0", 5 -> "5", 10.6 -> "10.6": seconds for a short range label. */
const secs = (n: number) => (Math.round(n * 10) / 10).toString();

function MetricRow({ label, hint, value, suffix, mono, onClick }: { label: string; hint?: string; value: string; suffix?: string; mono?: boolean; onClick?: () => void }) {
  const body = (
    <>
      <span className="min-w-0">
        <span className="block text-[15px] font-medium">{label}</span>
        {hint && <span className="block text-[13px] text-(--ink-3)">{hint}</span>}
      </span>
      <span className="flex shrink-0 items-baseline gap-1.5">
        <span className={mono ? "ed-tc text-[17px]" : "ed-num text-[24px] leading-none"}>{value}</span>
        {suffix && <span className="text-[13px] text-(--ink-3)">{suffix}</span>}
        {onClick && (
          <span className="ml-1 grid size-7 place-items-center self-center rounded-full bg-(--wash) text-(--ink-2)" aria-hidden>
            <Play className="ml-px size-3" fill="currentColor" strokeWidth={0} />
          </span>
        )}
      </span>
    </>
  );
  return onClick ? (
    <li>
      <button type="button" onClick={onClick} className="ed-press-soft ed-press flex min-h-[64px] w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-(--paper) active:bg-(--wash)">
        {body}
      </button>
    </li>
  ) : (
    <li className="flex min-h-[64px] items-center justify-between gap-4 px-4 py-3">{body}</li>
  );
}
