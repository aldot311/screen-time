"use client";

// "Check it yourself": the accuracy section's player. One labelled Reel plays muted on the left (only the selected
// Reel's video loads), and under it two strips run the Reel's length: what a person labelled, in grey, and what
// Screen-Time counted, in lime, with the frames where they disagree in red (solid: counted but not labelled, an
// over-count; outlined: labelled but not counted, a miss). The playhead runs across both with the video, and the
// readout adds up labelled and counted seconds as they play. Each row of the table below is a button that loads its
// Reel; the chevron still opens the report.
//
// It starts by itself (muted) once half of it is on screen, pauses when scrolled away, and with reduced motion waits
// on a Play control. A video that will not load leaves its still and the strips, which carry the whole answer anyway.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent } from "react";
import { ChevronRight, Play } from "lucide-react";
import { FPS } from "@/lib/types";
import { tenths, timecode } from "@/components/format";
import { clipLabel, pct, pct0, targetName, type SampleRow } from "./accuracy-summary";
import { CHECK_SELECT_EVENT, firstDisagreement, markSegments, soFar, type CheckSelectDetail, type PackedBox } from "./check-player-data";
import { Player, type OverlayBox, type PlayerHandle } from "./player";
import { PendingLink } from "./pending-link";
import { Figure } from "./bits";
import { scrubKey, useScrubPointer } from "./scrub";

/** One Reel as the player needs it, built on the server from the label file, the scored run and the stored video. */
export interface CheckReelView {
  clip: string;
  target: string;
  marks: string;
  precision: number | null;
  recall: number | null;
  /** The normalized video, when the store has it. */
  videoUrl?: string;
  poster?: string;
  width: number;
  height: number;
  /** SAM's boxes from the same run, when the stored report is that run. */
  boxes: PackedBox[];
}

export type CheckRow = SampleRow & { href?: string };

interface Props {
  reels: CheckReelView[];
  rows: CheckRow[];
  /** The clip selected first. */
  initialClip?: string;
}

const REDUCED = "(prefers-reduced-motion: reduce)";
function subscribeReduced(cb: () => void) {
  const mq = window.matchMedia(REDUCED);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

const ROW_GRID =
  "grid grid-cols-[minmax(0,1fr)_24px] items-center gap-x-3 gap-y-3 px-4 py-4 md:grid-cols-[minmax(0,1fr)_96px_96px_96px_96px_32px] md:gap-x-4 md:px-5 md:py-3.5";

export function CheckAccuracy({ reels, rows, initialClip }: Props) {
  const [clip, setClip] = useState(() => (reels.some((r) => r.clip === initialClip) ? initialClip : reels[0]?.clip));
  const reel = reels.find((r) => r.clip === clip);
  const card = useRef<HTMLDivElement>(null);

  const choose = (next: string, always = false) => {
    if (next === clip && !always) return;
    setClip(next);
    // Bring the player into view if the row picked it from below (or, from a "Watch it" button, wherever it is).
    const el = card.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    if (always || box.top < 64 || box.top > innerHeight * 0.5) {
      el.scrollIntoView({
        block: "start",
        behavior: matchMedia(REDUCED).matches ? "auto" : "smooth",
      });
    }
  };

  // A "Watch it" button elsewhere on the page asks for a Reel by name; only Reels this player has are taken.
  const chooseRef = useRef(choose);
  useEffect(() => {
    chooseRef.current = choose;
  });
  useEffect(() => {
    const onSelect = (e: Event) => {
      const next = (e as CustomEvent<CheckSelectDetail>).detail?.clip;
      if (next && reels.some((r) => r.clip === next)) chooseRef.current(next, true);
    };
    window.addEventListener(CHECK_SELECT_EVENT, onSelect);
    return () => window.removeEventListener(CHECK_SELECT_EVENT, onSelect);
  }, [reels]);

  return (
    <>
      {reel && (
        <div ref={card} className="mt-10 scroll-mt-20">
          <ReelPlayer key={reel.clip} reel={reel} row={rows.find((r) => r.clip === reel.clip && r.target === reel.target)} />
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-(--r-card) bg-(--paper) ring-1 ring-(--hair)">
        <div
          className="hidden grid-cols-[minmax(0,1fr)_96px_96px_96px_96px_32px] gap-4 border-b border-(--hair) px-5 py-3.5 text-[13px] font-medium text-(--ink-3) md:grid"
          aria-hidden
        >
          <span>Product check · pick one to play it above</span>
          <span className="text-right">Labelled</span>
          <span className="text-right">Measured</span>
          <span className="text-right">Precision</span>
          <span className="text-right">Recall</span>
          <span />
        </div>
        <ul className="divide-y divide-(--hair)">
          {rows.map((r) => {
            const playable = reels.some((x) => x.clip === r.clip && x.target === r.target);
            const on = playable && r.clip === clip;
            return (
              <li
                key={`${r.clip}-${r.target}`}
                className={`relative transition-colors duration-200 ${on ? "bg-(--wash)/80" : playable ? "hover:bg-(--wash)/50" : ""} ${ROW_GRID}`}
              >
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    {playable ? (
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => choose(r.clip)}
                        className="ed-press-soft flex min-h-6 items-center gap-2.5 text-left text-[15px] font-semibold after:absolute after:inset-0 after:content-['']"
                      >
                        <span
                          className={[
                            "grid size-5 shrink-0 place-items-center rounded-full transition-[background-color,box-shadow] duration-200",
                            on ? "bg-(--ink) text-white" : "text-transparent shadow-[inset_0_0_0_1.5px_var(--hair-2)]",
                          ].join(" ")}
                          aria-hidden
                        >
                          <Play className="ml-px size-2.5" fill="currentColor" strokeWidth={0} />
                        </span>
                        <span>
                          <span className="font-medium text-(--ink-3)">{clipLabel(r.clip)}</span> · {targetName(r.target)}
                          <span className="sr-only">: play it in the player above</span>
                        </span>
                      </button>
                    ) : (
                      <span className="text-[15px] font-semibold">
                        <span className="font-medium text-(--ink-3)">{clipLabel(r.clip)}</span> · {targetName(r.target)}
                      </span>
                    )}
                    {r.weak && <WeakTag label={`Weakest ${r.weak}`} />}
                  </span>
                  {r.note && <span className={`mt-0.5 block text-[13px] text-(--ink-3) ${playable ? "pl-[30px]" : ""}`}>{r.note}</span>}
                </span>
                {r.href ? (
                  <PendingLink
                    href={r.href}
                    hint="none"
                    className="relative z-10 -m-2.5 grid size-11 place-items-center self-center rounded-full text-(--ink-3) hover:bg-(--wash) hover:text-(--ink) active:bg-(--hair) md:order-last md:justify-self-end"
                    aria-label={`Open ${clipLabel(r.clip)}’s report`}
                  >
                    <ChevronRight className="size-5" strokeWidth={2.25} aria-hidden />
                  </PendingLink>
                ) : (
                  <span className="md:order-last" aria-hidden />
                )}
                <dl className="col-span-2 grid grid-cols-4 gap-2 text-[12px] text-(--ink-3) md:col-span-4 md:col-start-2 md:row-start-1 md:grid-cols-subgrid md:gap-4">
                  <Stat label="Labelled" value={`${tenths(r.truthSec)} s`} />
                  <Stat label="Measured" value={`${tenths(r.predictedSec)} s`} strong />
                  <Stat label="Precision" value={pct0(r.precision)} strong={r.weak === "precision"} />
                  <Stat label="Recall" value={pct0(r.recall)} strong={r.weak === "recall"} />
                </dl>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}

function ReelPlayer({ reel, row }: { reel: CheckReelView; row?: CheckRow }) {
  const duration = reel.marks.length / FPS;
  const player = useRef<PlayerHandle>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(!reel.videoUrl);
  const reduced = useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCED).matches,
    () => false,
  );
  const name = clipLabel(reel.clip);

  // Muted autoplay once half the player is on screen, a pause when it leaves; never with reduced motion.
  const autoPaused = useRef(false);
  const started = useRef(false);
  useEffect(() => {
    const el = frame.current;
    if (!el || failed || reduced) return;
    const io = new IntersectionObserver(
      ([e]) => {
        const p = player.current;
        if (!p) return;
        if (e.isIntersecting && (!started.current || autoPaused.current)) {
          started.current = true;
          autoPaused.current = false;
          p.play();
        } else if (!e.isIntersecting && started.current && !autoPaused.current) {
          autoPaused.current = true;
          p.pause();
        }
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [failed, reduced]);

  const boxes = useMemo<OverlayBox[]>(
    () =>
      reel.boxes.map(([f, objectId, match, x1, y1, x2, y2, conf]) => ({
        frame: f,
        objectId,
        verdict: match ? "match" : "lookalike",
        box: { x1, y1, x2, y2 },
        confidence: conf < 0 ? undefined : conf / 100,
      })),
    [reel.boxes],
  );
  const lanes = useMemo(
    () => ({
      labelled: markSegments(reel.marks, "=-"),
      agree: markSegments(reel.marks, "="),
      over: markSegments(reel.marks, "+"),
      miss: markSegments(reel.marks, "-"),
    }),
    [reel.marks],
  );
  const jump = firstDisagreement(reel.marks);
  // Without a video the strips are the whole answer: read the readout at the end.
  const at = failed ? duration : time;
  const sum = soFar(reel.marks, at);
  const whole = soFar(reel.marks, duration);

  const seek = (sec: number) => {
    const s = Math.min(Math.max(0, sec), duration);
    if (failed) return;
    player.current?.seek(s);
    setTime(s);
  };
  const showJump = () => {
    if (!jump) return;
    // A second of lead-in and half a second after, so the change is seen in context; then it stops on the end.
    started.current = true;
    player.current?.playFrom(Math.max(0, jump.startSec - 1), Math.min(duration, jump.endSec + 0.5));
  };

  return (
    <div className="rounded-(--r-card) bg-(--paper) p-3 ring-1 ring-(--hair) sm:p-5">
      <div className="grid grid-cols-[minmax(0,140px)_minmax(0,1fr)] gap-x-4 gap-y-5 sm:grid-cols-[minmax(0,184px)_minmax(0,1fr)] sm:gap-x-8 lg:grid-cols-[minmax(0,204px)_minmax(0,1fr)]">
        <div ref={frame} className="relative min-w-0 sm:row-span-2">
          {failed ? (
            <div className="relative aspect-[9/16] w-full overflow-hidden rounded-[16px] bg-(--ink) shadow-(--sh-3)">
              {reel.poster && (
                // eslint-disable-next-line @next/next/no-img-element -- a stored still, already a small JPEG
                <img src={reel.poster} alt={`A still from ${name}’s Reel`} className="absolute inset-0 size-full object-cover" />
              )}
              <p className="ed-glass-dark absolute inset-x-2 bottom-2 rounded-[10px] px-2.5 py-1.5 text-[12px] leading-snug text-white">
                The video did not load; the strips show the whole Reel.
              </p>
            </div>
          ) : (
            <>
              <Player
                ref={player}
                src={reel.videoUrl!}
                poster={reel.poster}
                width={reel.width}
                height={reel.height}
                boxes={boxes}
                durationSec={duration}
                onTime={setTime}
                onPlayingChange={setPlaying}
                onError={() => setFailed(true)}
                ambient
                autoPlay={false}
                preload="metadata"
                rounded="rounded-[16px]"
              />
              {!playing && time < 0.05 && (
                <button
                  type="button"
                  onClick={() => {
                    started.current = true;
                    player.current?.play();
                  }}
                  className="ed-press ed-glass-dark absolute top-1/2 left-1/2 inline-flex h-12 -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full pr-5 pl-4 text-[15px] font-semibold whitespace-nowrap text-white shadow-(--sh-2) active:bg-black/60"
                >
                  <Play className="size-4" fill="currentColor" strokeWidth={0} aria-hidden />
                  Play<span className="sr-only"> {name}’s Reel</span>
                </button>
              )}
            </>
          )}
        </div>

        <div className="min-w-0">
          <h3 className="text-[15px] leading-snug font-semibold sm:text-[17px]">
            <span className="font-medium text-(--ink-3)">{name}</span> · {targetName(reel.target)}
          </h3>
          {row?.note && <p className="mt-0.5 text-[13px] leading-snug text-(--ink-3)">{row.note}</p>}

          <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-3 min-[440px]:grid-cols-2 sm:mt-6 sm:flex sm:flex-wrap" aria-live="off">
            <Readout label="Labelled" sub="by a person" value={sum.labelledSec} swatch={GREY} />
            <Readout label="Counted" sub="by Screen-Time" value={sum.countedSec} swatch={LIME} />
          </dl>
          <p className="mt-2 text-[13px] leading-snug text-(--ink-3)">
            {failed ? (
              "over the whole Reel"
            ) : (
              <>
                seconds so far, of <span className="tabular">{tenths(duration)}</span> s
              </>
            )}
          </p>

          <p className="mt-3 min-h-5 text-[13px] leading-snug font-medium text-(--reject)">
            {sum.overSec > 0 && <>{tenths(sum.overSec)} s over-counted</>}
            {sum.overSec > 0 && sum.missSec > 0 && " · "}
            {sum.missSec > 0 && <>{tenths(sum.missSec)} s missed</>}
          </p>
        </div>

        {/* Phone: under the video and the readout, full width. From sm up: the foot of the column beside the video. */}
        <div className="col-span-2 min-w-0 sm:col-span-1 sm:col-start-2 sm:self-end">
          <p className="text-[13px] leading-[1.5] text-(--ink-2)">
            Whole Reel: <span className="tabular">{tenths(whole.labelledSec)}</span> s labelled,{" "}
            <span className="tabular">{tenths(whole.countedSec)}</span> s counted; precision{" "}
            <span className="font-semibold text-(--ink) tabular">{pct(reel.precision)}</span>, recall{" "}
            <span className="font-semibold text-(--ink) tabular">{pct(reel.recall)}</span>.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
            {jump && !failed && (
              <button
                type="button"
                onClick={showJump}
                className="ed-press -ml-1 inline-flex min-h-11 items-center gap-1.5 rounded-full px-1 text-[14px] font-semibold text-(--ink) underline decoration-(--hair-2) decoration-2 underline-offset-4 hover:decoration-(--ink)"
              >
                {jump.kind === "over" ? "Watch the over-count" : "Watch the first miss"}
                <span className="ed-tc inline-block text-[12px] font-normal text-(--ink-3)">{timecode(jump.startSec)}</span>
              </button>
            )}
            {row?.href && (
              <PendingLink
                href={row.href}
                className="inline-flex min-h-11 items-center gap-1 rounded-full text-[14px] font-semibold text-(--ink-2) hover:text-(--ink)"
              >
                Open {name}’s report <ChevronRight className="size-4" strokeWidth={2.25} aria-hidden />
              </PendingLink>
            )}
          </div>
        </div>

        <div className="col-span-2">
          <CheckLanes
            duration={duration}
            time={at}
            lanes={lanes}
            onSeek={failed ? undefined : seek}
            onToggle={() => player.current?.toggle()}
            name={name}
          />
          <p className="mt-3 max-w-[100ch] text-[13px] leading-[1.55] text-(--ink-3)">
            <span className="mr-1.5 inline-block h-2.5 w-3.5 rounded-[2px] bg-(--reject) align-[-1px]" aria-hidden />
            Red is where they disagree: solid where Screen-Time counted a frame the person did not label (an over-count), outlined where it missed a
            labelled frame. Per frame, at 15 frames a second.
          </p>
        </div>
      </div>
    </div>
  );
}

const GREY = "bg-(--ink-3)/55";
const LIME = "bg-(--signal) ring-1 ring-(--signal-ink)/15";

interface Seg {
  startSec: number;
  endSec: number;
}

function CheckLanes({
  duration,
  time,
  lanes,
  onSeek,
  onToggle,
  name,
}: {
  duration: number;
  time: number;
  lanes: { labelled: Seg[]; agree: Seg[]; over: Seg[]; miss: Seg[] };
  onSeek?: (sec: number) => void;
  onToggle: () => void;
  name: string;
}) {
  const d = Math.max(duration, 0.001);
  const pctOf = (s: number) => (Math.min(Math.max(s, 0), d) / d) * 100;
  const span = (s: Seg, min = 2): CSSProperties => ({
    left: `${pctOf(s.startSec)}%`,
    width: `max(${min}px, ${pctOf(s.endSec) - pctOf(s.startSec)}%)`,
  });
  const track = useRef<HTMLDivElement>(null);
  const seekFrom = (clientX: number) => {
    const el = track.current;
    if (!el || !onSeek) return;
    const r = el.getBoundingClientRect();
    onSeek(((clientX - r.left) / r.width) * d);
  };
  const { handlers } = useScrubPointer(seekFrom);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!onSeek) return;
    const next = scrubKey(e.key, e.shiftKey, time, d);
    if (next === null) return;
    e.preventDefault();
    if (next === "toggle") onToggle();
    else onSeek(next);
  };
  const lane = "relative h-6 overflow-hidden rounded-[6px] bg-(--wash) shadow-[inset_0_0_0_1px_var(--hair)] sm:h-7";

  return (
    <div>
      {/* Phone: each lane's name sits over it inside the track. From sm up the names make a column on the left. */}
      <div className="sm:grid sm:grid-cols-[208px_minmax(0,1fr)] sm:gap-x-4">
        <div className="hidden flex-col gap-1.5 sm:flex" aria-hidden>
          <LaneLabel title="Labelled" sub="checked by a person" swatch={GREY} />
          <LaneLabel title="Counted" sub="by Screen-Time" swatch={LIME} />
        </div>
        <div
          ref={track}
          role={onSeek ? "slider" : "img"}
          tabIndex={onSeek ? 0 : undefined}
          aria-label={onSeek ? `Position in ${name}’s Reel` : `Labelled and counted frames of ${name}’s Reel`}
          aria-valuemin={onSeek ? 0 : undefined}
          aria-valuemax={onSeek ? Number(d.toFixed(1)) : undefined}
          aria-valuenow={onSeek ? Number(time.toFixed(1)) : undefined}
          aria-valuetext={onSeek ? `${timecode(time)} of ${timecode(d)}` : undefined}
          onKeyDown={onKey}
          {...(onSeek ? handlers : {})}
          className={`relative flex flex-col gap-1.5 rounded-[6px] outline-offset-4 ${onSeek ? "cursor-ew-resize touch-pan-y select-none" : ""}`}
        >
          <LaneLabel className="relative z-10 w-fit bg-(--paper) pr-1.5 sm:hidden" title="Labelled" sub="checked by a person" swatch={GREY} />
          <div className={lane}>
            {lanes.labelled.map((s) => (
              <div key={s.startSec} className="absolute inset-y-0 bg-(--ink-3)/55" style={span(s)} />
            ))}
          </div>
          <LaneLabel className="relative z-10 mt-1.5 w-fit bg-(--paper) pr-1.5 sm:hidden" title="Counted" sub="by Screen-Time" swatch={LIME} />
          <div className={lane}>
            {lanes.agree.map((s) => (
              <div key={s.startSec} className="absolute inset-y-0 bg-(--signal)" style={span(s)} />
            ))}
            {lanes.over.map((s) => (
              <div key={`o${s.startSec}`} className="absolute inset-y-0 bg-(--reject)" style={span(s, 3)} />
            ))}
            {lanes.miss.map((s) => (
              <div
                key={`m${s.startSec}`}
                className="absolute inset-y-[3px] rounded-[3px] border-[1.5px] border-dashed border-(--reject)"
                style={span(s, 4)}
              />
            ))}
          </div>
          {onSeek && (
            <div
              className="pointer-events-none absolute -top-1 -bottom-0.5 w-0.5 -translate-x-1/2 bg-(--ink) transition-[left] duration-75 ease-linear"
              style={{ left: `${pctOf(time)}%` }}
              aria-hidden
            >
              <span className="absolute -top-1 left-1/2 size-2.5 -translate-x-1/2 rounded-full bg-(--ink) ring-2 ring-white" />
            </div>
          )}
        </div>
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-(--ink-3) sm:ml-[224px]" aria-hidden>
        <span className="ed-tc">0:00.0</span>
        <span className="ed-tc">{timecode(d)}</span>
      </div>
    </div>
  );
}

function LaneLabel({ title, sub, swatch, className = "" }: { title: string; sub: string; swatch: string; className?: string }) {
  return (
    <span className={`pointer-events-none flex items-center gap-2 text-[12px] leading-tight whitespace-nowrap sm:h-7 ${className}`}>
      <span className={`inline-block h-3 w-3.5 shrink-0 rounded-[3px] ${swatch}`} aria-hidden />
      <span>
        <span className="font-semibold text-(--ink-2)">{title}</span> <span className="text-(--ink-3)">({sub})</span>
      </span>
    </span>
  );
}

function Readout({ label, sub, value, swatch }: { label: string; sub: string; value: number; swatch: string }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-[13px] leading-snug font-medium text-(--ink-2)">
        <span className={`inline-block h-3 w-3.5 shrink-0 rounded-[3px] ${swatch}`} aria-hidden />
        {label} <span className="font-normal text-(--ink-3)">{sub}</span>
      </dt>
      <dd className="mt-1 flex items-baseline gap-1">
        <span className="ed-num text-[34px] leading-[0.95] sm:text-[44px]">
          <Figure value={value} />
        </span>
        <span className="ed-display text-[16px] text-(--ink-2) sm:text-[18px]">s</span>
      </dd>
    </div>
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

/** Loads a Reel into the check player on the same page and scrolls to it. */
export function WatchReelButton({ clip, name, className = "" }: { clip: string; name: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent<CheckSelectDetail>(CHECK_SELECT_EVENT, { detail: { clip } }))}
      className={`ed-press inline-flex h-11 items-center gap-2 rounded-full bg-(--ink) pr-5 pl-4 text-[14px] font-semibold text-white shadow-(--sh-1) hover:bg-black active:bg-black/80 ${className}`}
    >
      <Play className="size-3.5" fill="currentColor" strokeWidth={0} aria-hidden />
      Watch it<span className="sr-only"> in the player: {name}&rsquo;s Reel</span>
    </button>
  );
}
