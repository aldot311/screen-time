"use client";

// The interactive report. It opens on proof: the player sits paused on the video's best frame with its boxes drawn.
// Then the verdict as a sentence with its proof chips (and, when it fell short, each missed term), the contract, the
// lane timeline, the numbers, the objects checked and what was said. Every proof (chip, term, number, object, mention)
// plays exactly the moment that proves it: in the main player when at least half of it is on screen, otherwise in a
// mini player docked at the bottom of a phone, without moving the page. The control that started it shows "Playing".
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Check, CircleHelp, Mic, Pause, Play, ScanLine, X } from "lucide-react";
import { FPS, type Segment, type TermResult, type VideoReport } from "@/lib/types";
import { countedBefore, framesToSegments, percent, tenths, termCounts, termWindow, timecode, verdictOf, type Verdict } from "@/components/format";
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
  /** The stored still: the player's poster until its first frame lands. */
  poster?: string;
  /** Preview reports: numbers from hand labels, no boxes, no audio. */
  synthetic?: boolean;
}

interface Proof {
  from: number;
  to: number;
  /** What tapping plays, in words: "Play the first 5 s". */
  label: string;
  /** The span it covers, shown muted inside the pill. */
  range: ReactNode;
  lead: number;
  tone: "ink" | "voice";
}

const VISIBILITY = { clear: "Label readable", partial: "Partly covered", blurred: "Blurred" } as const;

const VERDICT_SOLID: Record<Verdict, { card: string; badge: string; Icon: typeof Check; word: string }> = {
  delivered: { card: "bg-(--pass-soft)", badge: "bg-(--pass) text-white", Icon: Check, word: "Delivered" },
  short: { card: "bg-(--short-soft)", badge: "bg-(--short) text-white", Icon: X, word: "Fell short" },
  review: { card: "bg-(--review-soft)", badge: "bg-(--review) text-white", Icon: CircleHelp, word: "Needs review" },
  pending: { card: "bg-(--wash)", badge: "bg-(--ink-3) text-white", Icon: CircleHelp, word: "Not run" },
};

// The docked video: 72 x 128, inside the dock's left edge.
const DOCK_VIDEO =
  "fixed bottom-[calc(env(safe-area-inset-bottom)+16px)] left-4 z-50 aspect-[9/16] w-[72px] overflow-hidden rounded-[12px] shadow-(--sh-2) ring-1 ring-black/10 sm:left-6";

/** "0:10.6", "0:05" (a whole second drops its ".0"): timecodes for range labels. */
const tc = (sec: number) => timecode(sec).replace(/\.0$/, "");
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const Tc = ({ children }: { children: ReactNode }) => <span className="ed-tc">{children}</span>;
const Range = ({ a, b }: { a: number; b: number }) => (
  <Tc>
    {tc(a)}–{tc(b)}
  </Tc>
);

export function ReportClient({ report, videoUrl, cropUrls, names, creator, title, brand, poster, synthetic = false }: Props) {
  const player = useRef<PlayerHandle>(null);
  const stage = useRef<HTMLDivElement>(null);
  const origin = useRef<HTMLElement | null>(null);
  const ratioRef = useRef(1);
  const wideRef = useRef(false);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [ratio, setRatio] = useState(1);
  const [wide, setWide] = useState(false);
  const [dockHold, setDockHold] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [nowPlaying, setNowPlaying] = useState<string | null>(null);
  const [preview, setPreview] = useState<Segment | null>(null);
  const [lit, setLit] = useState<Lit | null>(null);

  const m = report.metrics;
  const d = report.info.durationSec;
  const verdict = verdictOf(report);
  const counts = termCounts(report.terms);
  const boxes = useMemo(() => report.detections ?? [], [report.detections]);
  const rejectedSegs = useMemo(() => framesToSegments(boxes.filter((b) => b.verdict !== "match").map((b) => b.frame)), [boxes]);
  const rejectedTracks = report.tracks.filter((t) => t.verdict !== "match");
  const longest = useMemo(
    () => m.segments.reduce<Segment | null>((b, s) => (!b || s.endSec - s.startSec > b.endSec - b.startSec ? s : b), null),
    [m.segments],
  );
  const allOn: Segment | null = m.segments.length ? { startSec: m.segments[0].startSec, endSec: m.segments[m.segments.length - 1].endSec } : null;
  const perObject = useMemo(() => {
    const out = new Map<number, { largest: number; area: number }>();
    for (const b of boxes) {
      const cur = out.get(b.objectId);
      if (!cur || b.areaFraction > cur.area) out.set(b.objectId, { largest: b.frame / FPS, area: b.areaFraction });
    }
    return out;
  }, [boxes]);
  const largestMatch = useMemo(() => {
    let best: { t: number; a: number } | null = null;
    for (const b of boxes) if (b.verdict === "match" && (!best || b.areaFraction > best.a)) best = { t: b.frame / FPS, a: b.areaFraction };
    return best;
  }, [boxes]);
  // Open on proof: the largest counted box, or, when nothing counted, the largest box the player will draw (a sure
  // look-alike), so the first frame always shows what the report is about.
  const bestSec = useMemo(() => {
    if (largestMatch) return largestMatch.t;
    let best: { t: number; a: number } | null = null;
    for (const b of boxes)
      if ((b.confidence === undefined || b.confidence >= 0.5) && (!best || b.areaFraction > best.a)) best = { t: b.frame / FPS, a: b.areaFraction };
    return best?.t;
  }, [boxes, largestMatch]);

  // How much of the main player is on screen decides where a proof plays.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        ratioRef.current = e.intersectionRatio;
        setRatio(e.intersectionRatio);
        if (e.intersectionRatio >= 0.5) setDockHold(false);
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const on = () => {
      wideRef.current = mq.matches;
      setWide(mq.matches);
    };
    mq.addEventListener("change", on);
    const id = requestAnimationFrame(on);
    return () => {
      mq.removeEventListener("change", on);
      cancelAnimationFrame(id);
    };
  }, []);
  const docked = !wide && ratio < 0.5 && (playing || dockHold);

  // When playback stops (the stretch ended, the viewer paused, or the video ended) the proof is over: the control,
  // the dock title and the lit evidence all reset.
  const onPlayingChange = useCallback((p: boolean) => {
    setPlaying(p);
    if (p) setStarted(true);
    else {
      setActive(null);
      setNowPlaying(null);
      setLit(null);
    }
  }, []);

  const seek = (sec: number) => {
    player.current?.seek(sec);
    setTime(sec);
    setStarted(true);
    setActive(null);
    setNowPlaying(null);
    setLit(null);
    // Scrubbing with the player off screen brings up the dock so the frame is visible.
    if (!wideRef.current && ratioRef.current < 0.5) setDockHold(true);
  };

  /** Play exactly the stretch where the viewer is: the main player if it is half on screen, else the dock. */
  const show = (e: MouseEvent<HTMLElement>, key: string, proof: Proof, title: string, segs: Segment[], win: Segment | null = null) => {
    if (active === key && playing) {
      player.current?.toggle();
      return;
    }
    origin.current = e.currentTarget;
    setActive(key);
    setNowPlaying(title);
    setLit((l) => ({ segs, window: win, tone: proof.tone, key: (l?.key ?? 0) + 1 }));
    const start = Math.max(0, proof.from - proof.lead);
    player.current?.playFrom(start, proof.to);
    setTime(start);
    setStarted(true);
  };
  const playRange = (e: MouseEvent<HTMLElement>, key: string, from: number, to: number, label: string, tone: Proof["tone"] = "ink", lead = 0.3) =>
    show(e, key, { from, to, label, range: null, lead, tone }, label, [{ startSec: from, endSec: to }]);

  const closeDock = (e: MouseEvent<HTMLElement>) => {
    setDockHold(false);
    if (playing) player.current?.toggle();
    // Return focus to what started playback, for keyboard users only (a pointer tap leaves focus alone).
    if (e.detail === 0) origin.current?.focus({ preventScroll: true });
  };

  const termProof = (t: TermResult): Proof | null => {
    const rule = t.term.rule;
    const ev = t.evidence[0];
    const win = termWindow(rule);
    if (rule?.kind === "min_seconds_within")
      return {
        from: 0,
        to: rule.withinFirstSec,
        label: `Play the first ${rule.withinFirstSec} s`,
        range: <Range a={0} b={rule.withinFirstSec} />,
        lead: 0,
        tone: "ink",
      };
    if (rule?.kind === "min_seconds_total" && allOn)
      return {
        from: allOn.startSec,
        to: allOn.endSec,
        label: `Play all ${tenths(m.secondsOnScreen)} s on screen`,
        range: (
          <>
            {tenths(m.secondsOnScreen)} s across <Range a={allOn.startSec} b={allOn.endSec} />
          </>
        ),
        lead: 0,
        tone: "ink",
      };
    if (rule?.kind === "min_continuous" && longest)
      return {
        from: longest.startSec,
        to: longest.endSec,
        label: "Play the longest run",
        range: (
          <>
            {tenths(longest.endSec - longest.startSec)} s, <Range a={longest.startSec} b={longest.endSec} />
          </>
        ),
        lead: 0,
        tone: "ink",
      };
    if (rule?.kind === "mentioned") {
      const mn = m.mentions.find((x) => !rule.withinFirstSec || x.startSec <= rule.withinFirstSec);
      if (mn)
        return {
          from: mn.startSec,
          to: mn.endSec,
          label: `Hear “${mn.text}”`,
          range: <Range a={mn.startSec} b={mn.endSec} />,
          lead: 0.8,
          tone: "voice",
        };
      return win
        ? { from: 0, to: win.endSec, label: `Play the first ${win.endSec} s`, range: <Range a={0} b={win.endSec} />, lead: 0, tone: "voice" }
        : null;
    }
    if (rule?.kind === "first_seen_before") {
      if (m.firstSeenSec !== null)
        return {
          from: m.firstSeenSec,
          to: m.firstSeenSec + 1.5,
          label: "Play the first sighting",
          range: (
            <>
              at <Tc>{timecode(m.firstSeenSec)}</Tc>
            </>
          ),
          lead: 0.3,
          tone: "ink",
        };
      return { from: 0, to: rule.seconds, label: `Play the first ${rule.seconds} s`, range: <Range a={0} b={rule.seconds} />, lead: 0, tone: "ink" };
    }
    if (rule?.kind === "min_area" && (ev || largestMatch)) {
      const at = ev?.startSec ?? largestMatch!.t;
      const end = ev?.endSec ?? at + 1.5;
      return { from: at, to: end, label: "Play it at its largest", range: <Range a={at} b={end} />, lead: 0.3, tone: "ink" };
    }
    if (ev)
      return { from: ev.startSec, to: ev.endSec, label: "Play the proof", range: <Range a={ev.startSec} b={ev.endSec} />, lead: 0.3, tone: "ink" };
    return null;
  };

  const counted = countedBefore(m, time);
  const tone = VERDICT_SOLID[verdict];
  const found = m.secondsOnScreen > 0;
  const n = report.terms.length;
  const failedTerms = report.terms.filter((t) => t.pass === false);
  const headline =
    verdict === "delivered"
      ? `${brand} was on screen, and the contract was met.`
      : verdict === "short"
        ? found
          ? `${brand} was on screen, but the contract fell short.`
          : `${brand} was never on screen, so the contract fell short.`
        : verdict === "review"
          ? n
            ? `${brand} was on screen; a person needs to check ${counts.unchecked === 1 ? "one term" : `${counts.unchecked} terms`}.`
            : `No contract terms were set, so a person needs to check this one.`
          : `Not analyzed yet.`;
  const termsLine = !n
    ? ""
    : verdict === "delivered"
      ? n === 1
        ? "The contract term was met."
        : n === 2
          ? "Both contract terms met."
          : `All ${n} contract terms met.`
      : verdict === "short"
        ? `${counts.failed} of ${plural(n, "contract term")} missed${counts.unchecked ? `, ${counts.unchecked} not checkable` : ""}.`
        : `${counts.unchecked} of ${plural(n, "term")} could not be checked automatically.`;
  const modelLine = synthetic
    ? "Preview: numbers from hand-checked labels, not a live model run."
    : found
      ? `SAM 3.1 searched all ${report.info.frameCount} frames for “${report.prompt}”; ${
          rejectedTracks.length
            ? `Muse Spark rejected ${plural(rejectedTracks.length, "look-alike")}.`
            : `Muse Spark confirmed it was the ${brand} product.`
        }`
      : `SAM 3.1 searched all ${report.info.frameCount} frames for “${report.prompt}” and never found the ${brand} product.${
          rejectedTracks.length ? ` Muse Spark rejected ${plural(rejectedTracks.length, "look-alike")}.` : ""
        }`;
  const attempts = report.promptAttempts && report.promptAttempts.length > 1 ? report.promptAttempts : null;
  const recovery = attempts
    ? `${attempts
        .slice(0, -1)
        .map((a) => `“${a.prompt}” ${a.objects ? `found ${plural(a.objects, "object")}, none the product` : "found nothing"}`)
        .join(", then ")}, so Muse Spark suggested “${attempts[attempts.length - 1].prompt}”, and SAM ${
        attempts[attempts.length - 1].matched ? "found it" : "still found nothing"
      }.`
    : null;
  const objectName = (id: number, match: boolean) => names[id] ?? (match ? `${brand} ${report.prompt}` : `Another ${report.prompt}`);
  const hasMatchTrack = report.tracks.some((t) => t.verdict === "match");
  const isOn = (key: string) => active === key && playing;

  return (
    <div className="grid gap-x-8 gap-y-4 sm:gap-y-8 md:grid-cols-[minmax(0,300px)_minmax(0,1fr)] lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:gap-x-12">
      {/* Player on a paper card: first on a phone, sized so the verdict and its chips fit the first screen; sticky from tablet up. */}
      <div className="min-w-0 md:sticky md:top-[76px] md:self-start">
        <div
          ref={stage}
          className="relative rounded-(--r-card) bg-(--wash) p-3 shadow-[inset_0_0_0_1px_var(--hair)] sm:p-4 md:max-h-[calc(100svh-120px)] lg:p-5"
        >
          <div className="relative mx-auto w-[min(100%,calc(min(52svh,calc(100svh-370px))*0.5625))] sm:w-[min(100%,calc(min(56svh,calc(100svh-380px))*0.5625))] md:w-[min(100%,calc((100svh-160px)*0.5625))]">
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
              onDockedTap={() => stage.current?.scrollIntoView({ block: "center", behavior: "smooth" })}
              poster={poster}
              showBoxes={!synthetic}
              dockClassName={DOCK_VIDEO}
              rounded="rounded-[16px]"
              initialSec={bestSec}
            />
          </div>
        </div>
      </div>

      <div className="min-w-0 space-y-10">
        {/* Verdict as a sentence, with its proof chips and, when it fell short, each missed term. */}
        <header className={`rounded-(--r-card) p-4 sm:p-6 ${tone.card}`}>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 text-[14px] text-(--ink-2)">
            <span className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-semibold ${tone.badge}`}>
              <tone.Icon className="size-4" strokeWidth={3} aria-hidden />
              {tone.word}
            </span>
            <span className="font-semibold text-(--ink)">{title}</span>
            <span aria-hidden>·</span>
            <span className="truncate">{creator}</span>
          </div>
          <h1 className="ed-display mt-3 text-[24px] leading-[1.1] sm:mt-4 sm:text-[34px] md:text-[30px] lg:text-[42px]">{headline}</h1>
          <div className="mt-3 flex flex-wrap gap-2 sm:mt-4">
            {allOn && (
              <Chip
                on={isOn("chip-on")}
                label={`Play all ${tenths(m.secondsOnScreen)} seconds on screen`}
                onClick={(e) =>
                  show(
                    e,
                    "chip-on",
                    { from: allOn.startSec, to: allOn.endSec, label: "", range: null, lead: 0, tone: "ink" },
                    `All ${tenths(m.secondsOnScreen)} s on screen`,
                    m.segments,
                  )
                }
                icon={<Swatch kind="signal" />}
              >
                <span className="font-semibold text-(--ink)">{tenths(m.secondsOnScreen)} s</span> on screen · {percent(m.shareOfVideo)}
              </Chip>
            )}
            {rejectedSegs.length > 0 && (
              <Chip
                on={isOn("chip-reject")}
                label="Play the rejected look-alike"
                onClick={(e) => playRange(e, "chip-reject", rejectedSegs[0].startSec, rejectedSegs[0].endSec, "Look-alike, not counted")}
                icon={<ScanLine className="size-4 text-(--reject)" strokeWidth={2.25} aria-hidden />}
              >
                <span className="font-semibold text-(--ink)">{rejectedTracks.length || 1}</span> look-alike
                {(rejectedTracks.length || 1) === 1 ? "" : "s"} rejected
              </Chip>
            )}
          </div>
          {verdict === "short" && failedTerms.length > 0 && (
            <ul className="mt-4 space-y-1.5 text-[14.5px] leading-[1.45]" aria-label="Missed terms">
              {failedTerms.map((t) => (
                <li key={t.term.text} className="flex gap-2">
                  <X className="mt-[3px] size-4 shrink-0 text-(--short)" strokeWidth={3} aria-label="Missed" />
                  <span>
                    <span className="font-semibold text-(--ink)">{t.term.text}</span>{" "}
                    <span className="text-(--ink-2)">· {t.detail.replace(/\.$/, "")}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 max-w-[62ch] text-[14.5px] leading-[1.55] text-(--ink-2)">
            {termsLine} {modelLine}
          </p>
          {recovery && (
            <p className="mt-2 max-w-[62ch] text-[14.5px] leading-[1.55] text-(--ink-2)">
              {recovery}{" "}
              <a
                href="#search"
                className="ed-press -my-2 inline-flex min-h-11 items-center font-semibold text-(--ink) underline decoration-(--hair-2) underline-offset-4 active:opacity-70"
              >
                See each search
              </a>
            </p>
          )}
        </header>

        {/* Contract terms: the whole row plays what it proves. */}
        <section aria-labelledby="terms-h">
          <h2 id="terms-h" className="ed-display text-[26px] leading-tight">
            Contract
          </h2>
          <p className="mt-1 text-[14px] text-(--ink-3)">Select a term to play its proof.</p>
          <ol className="mt-4 space-y-2.5">
            {report.terms.map((t, i) => {
              const state = t.pass === true ? "pass" : t.pass === false ? "fail" : "unsure";
              const Icon = state === "pass" ? Check : state === "fail" ? X : CircleHelp;
              const proof = termProof(t);
              const key = `term-${i}`;
              const live = isOn(key);
              const mark = (
                <span
                  className={[
                    "grid size-8 place-items-center rounded-full",
                    {
                      pass: "bg-(--pass-soft) text-(--pass)",
                      fail: "bg-(--short-soft) text-(--short)",
                      unsure: "bg-(--review-soft) text-(--review)",
                    }[state],
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
                  <li
                    key={t.term.text}
                    className="grid min-h-[72px] grid-cols-[32px_1fr] items-start gap-3 rounded-(--r-inner) bg-(--card) p-4 shadow-(--sh-1) ring-1 ring-(--hair)"
                  >
                    {mark}
                    <span className="min-w-0">
                      {text}
                      <span className="mt-2 block text-[13px] text-(--ink-3)">Nothing on screen or heard to play for this term.</span>
                    </span>
                  </li>
                );
              const segs =
                t.term.rule?.kind === "min_seconds_total"
                  ? m.segments
                  : proof.tone === "ink" && t.evidence.length
                    ? t.evidence
                    : [{ startSec: proof.from, endSec: proof.to }];
              return (
                <li key={t.term.text}>
                  <button
                    type="button"
                    aria-pressed={live}
                    aria-label={`${live ? "Pause" : "Play"} proof: ${t.term.text}`}
                    onClick={(e) => show(e, key, proof, t.term.text, segs, termWindow(t.term.rule))}
                    onPointerEnter={(e) => e.pointerType === "mouse" && setPreview(termWindow(t.term.rule))}
                    onPointerLeave={() => setPreview(null)}
                    className="ed-press ed-press-soft group grid min-h-[72px] w-full grid-cols-[32px_1fr] items-start gap-x-3 gap-y-3 rounded-(--r-inner) bg-(--card) p-4 text-left shadow-(--sh-1) ring-1 ring-(--hair) hover:ring-(--hair-2) active:bg-(--wash)"
                  >
                    {mark}
                    {text}
                    <span
                      className={[
                        "col-start-2 inline-flex flex-col items-start justify-self-start rounded-[14px] px-3 py-2 transition-colors duration-100",
                        live ? "bg-(--ink) text-white" : "bg-(--wash) text-(--ink) group-hover:bg-(--hair)",
                      ].join(" ")}
                    >
                      <span className="inline-flex items-center gap-2 text-[13.5px] font-semibold">
                        {live ? (
                          <Pause className="size-3.5" fill="currentColor" strokeWidth={0} aria-hidden />
                        ) : (
                          <Play className="size-3.5" fill="currentColor" strokeWidth={0} aria-hidden />
                        )}
                        <Reserve on={live} on-label="Playing" off-label={proof.label} />
                      </span>
                      <span className={`mt-0.5 pl-[22px] text-[12px] ${live ? "text-white/70" : "text-(--ink-3)"}`}>{proof.range}</span>
                    </span>
                  </button>
                </li>
              );
            })}
            {!n && <li className="rounded-(--r-inner) bg-(--card) p-4 text-(--ink-3)">No contract terms were set for this campaign.</li>}
          </ol>
        </section>

        {/* The lane timeline. */}
        <section aria-labelledby="tl-h">
          <h2 id="tl-h" className="ed-display mb-4 text-[26px] leading-tight">
            Timeline
          </h2>
          <div className="rounded-(--r-card) bg-(--card) p-4 shadow-(--sh-2) ring-1 ring-(--hair) sm:p-5">
            <div className="mb-3 flex min-h-6 items-baseline justify-between gap-3 text-[14px] text-(--ink-2)">
              {started ? (
                <>
                  <span>
                    <span className="font-semibold text-(--ink)">
                      <Figure value={counted} /> s
                    </span>{" "}
                    counted so far
                  </span>
                  <Tc>{timecode(time)}</Tc>
                </>
              ) : (
                <span>Drag or use the arrow keys to move through the video; Space plays.</span>
              )}
            </div>
            <ReportLanes
              durationSec={d}
              segments={m.segments}
              mentions={m.mentions}
              rejected={rejectedSegs}
              playheadSec={time}
              playing={playing}
              lit={lit}
              preview={preview}
              firstSeenSec={m.firstSeenSec}
              longest={longest}
              onSeek={seek}
              onToggle={() => player.current?.toggle()}
              noAudio={synthetic}
            />
            <p className="mt-3 border-t border-(--hair) pt-3 text-[12.5px] leading-[1.5] text-(--ink-3)">
              {synthetic ? (
                "Preview reports mark when the product is on screen, not where, so no boxes are drawn on the video."
              ) : (
                <>
                  Boxes on the video come from SAM 3.1 tracking &ldquo;{report.prompt}&rdquo;.
                  {hasMatchTrack && " Lime is counted."}
                  {rejectedTracks.length > 0 && " Dashed red was rejected by Muse Spark as a look-alike."}
                </>
              )}
            </p>
          </div>
        </section>

        {/* Screen time: every figure plays its moment. */}
        <section aria-labelledby="time-h">
          <h2 id="time-h" className="ed-display text-[26px] leading-tight">
            Screen time
          </h2>
          {allOn ? (
            <button
              type="button"
              aria-pressed={isOn("big-on")}
              aria-label={`Play all ${tenths(m.secondsOnScreen)} seconds on screen`}
              onClick={(e) =>
                show(
                  e,
                  "big-on",
                  { from: allOn.startSec, to: allOn.endSec, label: "", range: null, lead: 0, tone: "ink" },
                  `All ${tenths(m.secondsOnScreen)} s on screen`,
                  m.segments,
                )
              }
              className="ed-press ed-press-soft mt-3 flex w-full flex-wrap items-end justify-between gap-x-4 gap-y-2 rounded-(--r-card) px-1 py-2 text-left active:bg-(--wash)"
            >
              <span className="min-w-0">
                <span className="flex items-baseline gap-2">
                  <span className="ed-num text-[72px] leading-none sm:text-[88px]">
                    <Figure value={m.secondsOnScreen} />
                  </span>
                  <span className="ed-display text-[26px] text-(--ink-2)">s</span>
                </span>
                <span className="mt-1 block text-[15px] text-(--ink-2)">on screen of {tenths(d)} s</span>
              </span>
              <span
                className={`inline-flex h-11 items-center gap-2 rounded-full pr-4 pl-3 text-[13.5px] font-semibold ${isOn("big-on") ? "bg-(--ink) text-white" : "bg-(--wash) text-(--ink)"}`}
              >
                {isOn("big-on") ? (
                  <Pause className="size-3.5" fill="currentColor" strokeWidth={0} aria-hidden />
                ) : (
                  <Play className="size-3.5" fill="currentColor" strokeWidth={0} aria-hidden />
                )}
                <Reserve on={isOn("big-on")} on-label="Playing" off-label="Play every second counted" />
              </span>
            </button>
          ) : (
            <p className="mt-3 px-1 py-2">
              <span className="flex items-baseline gap-2">
                <span className="ed-num text-[72px] leading-none text-(--ink-3) sm:text-[88px]">0.0</span>
                <span className="ed-display text-[26px] text-(--ink-3)">s</span>
              </span>
              <span className="mt-1 block text-[15px] text-(--ink-2)">{brand} was never confirmed on screen.</span>
            </p>
          )}

          <ul className="mt-5 divide-y divide-(--hair) overflow-hidden rounded-(--r-card) bg-(--card) shadow-(--sh-1) ring-1 ring-(--hair)">
            <MetricRow
              label="Share of the video"
              hint={`Of the ${tenths(d)} s video`}
              value={percent(m.shareOfVideo)}
              caption={allOn ? <Range a={allOn.startSec} b={allOn.endSec} /> : undefined}
              on={isOn("num-share")}
              onClick={
                allOn
                  ? (e) =>
                      show(
                        e,
                        "num-share",
                        { from: allOn.startSec, to: allOn.endSec, label: "", range: null, lead: 0, tone: "ink" },
                        "Share of the video",
                        m.segments,
                      )
                  : undefined
              }
            />
            <MetricRow
              label="First seen"
              hint="When SAM 3.1 first found it"
              value={m.firstSeenSec === null ? "Never" : `${tenths(m.firstSeenSec)} s`}
              caption={m.firstSeenSec !== null ? <Tc>{timecode(m.firstSeenSec)}</Tc> : undefined}
              on={isOn("num-first")}
              onClick={m.firstSeenSec === null ? undefined : (e) => playRange(e, "num-first", m.firstSeenSec!, m.firstSeenSec! + 1.5, "First seen")}
            />
            <MetricRow
              label="Longest continuous run"
              hint="Without leaving the frame"
              value={`${tenths(longest ? longest.endSec - longest.startSec : 0)} s`}
              caption={longest ? <Range a={longest.startSec} b={longest.endSec} /> : undefined}
              on={isOn("num-longest")}
              onClick={longest ? (e) => playRange(e, "num-longest", longest.startSec, longest.endSec, "Longest run", "ink", 0) : undefined}
            />
            <MetricRow
              label="Size in frame"
              hint={largestMatch ? `Average; largest ${percent(largestMatch.a, 1)} of the frame` : "Average share of the frame"}
              value={percent(m.avgAreaFraction, 1)}
              caption={largestMatch ? <Tc>{timecode(largestMatch.t)}</Tc> : undefined}
              on={isOn("num-size")}
              onClick={largestMatch ? (e) => playRange(e, "num-size", largestMatch.t, largestMatch.t + 1.2, "Largest in frame") : undefined}
            />
            <MetricRow
              label="Prominence"
              hint="Above 50 means clearly featured; from time on screen, size, centering and how early it appears."
              value={`${Math.round(m.prominenceScore)}`}
              suffix="/ 100"
              caption={largestMatch ? <Tc>{timecode(largestMatch.t)}</Tc> : undefined}
              on={isOn("num-prom")}
              onClick={largestMatch ? (e) => playRange(e, "num-prom", largestMatch.t, largestMatch.t + 1.2, "Most prominent moment") : undefined}
            />
            <MetricRow
              label="Spoken mentions"
              hint={
                m.mentions[0]
                  ? `“${m.mentions[0].text}”, by Voice Transcribe`
                  : synthetic
                    ? "Audio is not analyzed in the preview"
                    : "Not heard by Voice Transcribe"
              }
              value={`${m.mentions.length}`}
              caption={m.mentions[0] ? <Tc>{timecode(m.mentions[0].startSec)}</Tc> : undefined}
              on={isOn("num-mentions")}
              onClick={
                m.mentions[0]
                  ? (e) => playRange(e, "num-mentions", m.mentions[0].startSec, m.mentions[0].endSec, `Hear “${m.mentions[0].text}”`, "voice", 0.8)
                  : undefined
              }
            />
          </ul>
        </section>

        {/* The objects checked, kept and rejected. */}
        <section aria-labelledby="found-h">
          <h2 id="found-h" className="ed-display text-[26px] leading-tight">
            Objects checked
          </h2>
          <p className="mt-1 max-w-[60ch] text-[14px] text-(--ink-3)">
            SAM 3.1 tracked them; Muse Spark checked each against the brief. Rejected objects are shown for transparency and never count.
          </p>
          {attempts && (
            <ol id="search" className="mt-4 scroll-mt-[80px] space-y-3 rounded-(--r-inner) bg-(--wash) p-4 text-[14.5px] text-(--ink-2)">
              {attempts.map((a, i) => (
                <li key={a.prompt} className="grid grid-cols-[22px_1fr] gap-2.5">
                  <span className="grid size-[22px] place-items-center rounded-full bg-(--card) text-[12px] font-semibold text-(--ink) shadow-(--sh-1) tabular">
                    {i + 1}
                  </span>
                  <span>
                    SAM searched for <span className="font-semibold text-(--ink)">&ldquo;{a.prompt}&rdquo;</span>:{" "}
                    {a.matched
                      ? `found the product${a.objects > a.matched ? ` among ${a.objects} objects` : ""}.`
                      : a.objects
                        ? `${plural(a.objects, "object")}, none the product.`
                        : "nothing."}
                    {a.next && attempts[i + 1] && (
                      <span className="mt-1 block text-(--ink-3)">
                        Muse Spark watched the video and suggested &ldquo;{attempts[i + 1].prompt}&rdquo;: {a.next}
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
              const key = `obj-${t.objectId}`;
              const live = isOn(key);
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
                      {match ? "Counted · SAM 3.1" : t.verdict === "lookalike" ? "Look-alike · Muse Spark" : "Unclear · Muse Spark"}
                    </span>
                    <span className="mt-2 block text-[16px] leading-snug font-semibold">{name}</span>
                    <span className="mt-1 block text-[14px] leading-[1.5] text-(--ink-2)">{t.reason}</span>
                    <span className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-(--ink-3)">
                      {match && <span>{VISIBILITY[t.visibility]}</span>}
                      {at && (
                        <span className="inline-flex items-center gap-1 font-semibold text-(--ink)">
                          {live ? (
                            <Pause className="size-3" fill="currentColor" strokeWidth={0} aria-hidden />
                          ) : (
                            <Play className="size-3" fill="currentColor" strokeWidth={0} aria-hidden />
                          )}
                          {live ? (
                            "Playing"
                          ) : (
                            <>
                              Largest at <Tc>{timecode(at.largest)}</Tc>
                            </>
                          )}
                        </span>
                      )}
                    </span>
                  </span>
                </>
              );
              const cls =
                "grid h-full w-full grid-cols-[96px_1fr] gap-4 rounded-(--r-card) bg-(--card) p-3 text-left shadow-(--sh-1) ring-1 ring-(--hair)";
              return (
                <li key={t.objectId}>
                  {at ? (
                    <button
                      type="button"
                      aria-pressed={live}
                      aria-label={`${live ? "Pause" : "Play"}: ${name}`}
                      onClick={(e) => playRange(e, key, at.largest, at.largest + 1.5, name)}
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
            {!report.tracks.length && (
              <li className="rounded-(--r-inner) bg-(--card) p-4 text-(--ink-3)">Nothing matching &ldquo;{report.prompt}&rdquo; appeared.</li>
            )}
          </ul>
        </section>

        {/* Spoken mentions */}
        <section aria-labelledby="said-h">
          <h2 id="said-h" className="ed-display text-[26px] leading-tight">
            Said aloud
          </h2>
          <p className="mt-1 text-[14px] text-(--ink-3)">Heard by Muse Voice Transcribe.{m.mentions.length > 0 && " Select one to hear it."}</p>
          <ul className="mt-4 space-y-2">
            {m.mentions.map((mn, i) => {
              const key = `mention-${i}`;
              const live = isOn(key);
              return (
                <li key={mn.startSec}>
                  <button
                    type="button"
                    aria-pressed={live}
                    aria-label={`${live ? "Pause" : "Play"} mention: ${mn.text}`}
                    onClick={(e) => playRange(e, key, mn.startSec, mn.endSec, `Hear “${mn.text}”`, "voice", 0.8)}
                    className="ed-press ed-press-soft flex min-h-14 w-full items-center gap-3 rounded-(--r-inner) bg-(--card) px-4 py-3 text-left shadow-(--sh-1) ring-1 ring-(--hair) hover:ring-(--hair-2) active:bg-(--voice-soft)"
                  >
                    <span
                      className={`grid size-9 shrink-0 place-items-center rounded-full ${live ? "bg-(--voice) text-white" : "bg-(--voice-soft) text-(--voice)"}`}
                    >
                      {live ? (
                        <Pause className="size-3.5" fill="currentColor" strokeWidth={0} aria-hidden />
                      ) : (
                        <Mic className="size-4" strokeWidth={2.25} aria-hidden />
                      )}
                    </span>
                    <span className="min-w-0 flex-1 text-[16px] font-medium">&ldquo;{mn.text}&rdquo;</span>
                    <span className="text-[13px] text-(--voice)">
                      {live ? <span className="font-semibold">Playing</span> : <Tc>{timecode(mn.startSec)}</Tc>}
                    </span>
                  </button>
                </li>
              );
            })}
            {!m.mentions.length && (
              <li className="rounded-(--r-inner) bg-(--card) p-4 text-(--ink-3) ring-1 ring-(--hair)">
                {synthetic ? "Audio is not analyzed in the preview." : "The brand name was not heard."}
              </li>
            )}
          </ul>
          <div className="mt-10 border-t border-(--hair) pt-4 text-[12.5px] leading-[1.6] text-(--ink-3)">
            {synthetic ? (
              <p>
                Preview: these numbers come from hand-checked labels run through Screen-Time&rsquo;s real metrics and contract code, not from a live
                model run.
              </p>
            ) : (
              <>
                <p>
                  Analyzed {report.info.frameCount} frames at 15 fps · Meta API cost ${report.cost.usd.toFixed(2)}
                </p>
                <p>SAM tracking + Muse Spark + Voice Transcribe</p>
              </>
            )}
          </div>
        </section>
      </div>

      {/* Phone mini player: while a proof plays (or the viewer scrubs) with the main player out of view. */}
      {docked && (
        <div
          role="region"
          aria-label="Mini player"
          className="ed-glass ed-dock-in fixed right-2 bottom-[calc(env(safe-area-inset-bottom)+8px)] left-2 z-40 rounded-[20px] py-2 pr-2 pl-[92px] shadow-(--sh-3) ring-1 ring-black/5 sm:right-auto sm:left-4 sm:w-[520px]"
        >
          <div className="flex min-h-[128px] items-center gap-1.5">
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
              <p className="line-clamp-2 text-[13.5px] leading-[1.3] font-semibold" aria-live="polite">
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
                evidenceTone={lit?.tone ?? "ink"}
                flashKey={lit?.key ?? 0}
                onSeek={seek}
                size="compact"
                ruler={false}
                progress={playing ? time : null}
              />
              <p className="flex justify-between gap-2 text-[12.5px] text-(--ink-2)">
                <span>
                  <span className="font-semibold text-(--ink)">
                    <Figure value={counted} /> s
                  </span>{" "}
                  counted
                </span>
                <Tc>{timecode(time)}</Tc>
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-center gap-2">
              <button
                type="button"
                onClick={(e) => closeDock(e)}
                className="ed-press grid size-11 place-items-center rounded-full bg-(--card) text-(--ink) shadow-(--sh-1) ring-1 ring-(--hair) active:bg-(--wash)"
                aria-label="Close the mini player"
              >
                <X className="size-[18px]" strokeWidth={2.5} />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (playing) setDockHold(true);
                  player.current?.toggle();
                }}
                className="ed-press grid size-11 place-items-center rounded-full bg-(--ink) text-white active:bg-black"
                aria-label={playing ? "Pause" : "Play"}
              >
                {playing ? (
                  <Pause className="size-4" fill="currentColor" strokeWidth={0} />
                ) : (
                  <Play className="ml-0.5 size-4" fill="currentColor" strokeWidth={0} />
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Both labels occupy the same cell, so switching to "Playing" never changes the control's width. */
function Reserve({ on, "on-label": onLabel, "off-label": offLabel }: { on: boolean; "on-label": string; "off-label": string }) {
  return (
    <span className="grid">
      <span className={`[grid-area:1/1] ${on ? "invisible" : ""}`}>{offLabel}</span>
      <span className={`[grid-area:1/1] ${on ? "" : "invisible"}`} aria-hidden={!on}>
        {onLabel}
      </span>
    </span>
  );
}

function Chip({
  on,
  label,
  onClick,
  icon,
  children,
}: {
  on: boolean;
  label: string;
  onClick: (e: MouseEvent<HTMLElement>) => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? "Pause" : label}
      onClick={onClick}
      className="ed-press ed-press-soft inline-flex min-h-11 items-center gap-2 rounded-full bg-(--card) px-3.5 text-[14px] text-(--ink-2) shadow-(--sh-1) hover:shadow-(--sh-2) active:bg-(--wash)"
    >
      {icon}
      <span className="tabular">{children}</span>
      <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-(--ink)">
        {on ? (
          <Pause className="size-3" fill="currentColor" strokeWidth={0} aria-hidden />
        ) : (
          <Play className="size-3 text-(--ink-3)" fill="currentColor" strokeWidth={0} aria-hidden />
        )}
        <span className="grid">
          <span className={`[grid-area:1/1] ${on ? "" : "invisible"}`}>Playing</span>
        </span>
      </span>
    </button>
  );
}

function MetricRow({
  label,
  hint,
  value,
  suffix,
  caption,
  on = false,
  onClick,
}: {
  label: string;
  hint?: ReactNode;
  value: string;
  suffix?: string;
  caption?: ReactNode;
  on?: boolean;
  onClick?: (e: MouseEvent<HTMLElement>) => void;
}) {
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium">{label}</span>
        {hint && <span className="block text-[13px] leading-[1.45] text-(--ink-3)">{hint}</span>}
      </span>
      <span className="flex shrink-0 flex-col items-end">
        <span className="flex items-baseline gap-1">
          <span className="ed-num text-[24px] leading-none">{value}</span>
          {suffix && <span className="text-[13px] text-(--ink-3)">{suffix}</span>}
        </span>
        {caption && <span className="mt-1 text-[12px] text-(--ink-3)">{caption}</span>}
      </span>
      {onClick && (
        <span
          className={`grid size-8 shrink-0 place-items-center rounded-full ${on ? "bg-(--ink) text-white" : "bg-(--wash) text-(--ink-2)"}`}
          aria-hidden
        >
          {on ? (
            <Pause className="size-3" fill="currentColor" strokeWidth={0} />
          ) : (
            <Play className="ml-px size-3" fill="currentColor" strokeWidth={0} />
          )}
        </span>
      )}
    </>
  );
  return onClick ? (
    <li>
      <button
        type="button"
        aria-pressed={on}
        aria-label={`${on ? "Pause" : "Play"}: ${label}`}
        onClick={onClick}
        className="ed-press-soft ed-press flex min-h-[64px] w-full items-center gap-3 px-4 py-3 text-left hover:bg-(--paper) active:bg-(--wash)"
      >
        {body}
      </button>
    </li>
  ) : (
    <li className="flex min-h-[64px] items-center gap-3 px-4 py-3">{body}</li>
  );
}
