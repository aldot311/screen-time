// The landing replay's timeline, in the report's encoding at replay scale: one labelled lane per signal. On screen
// (lime, counted seconds only), Look-alike (hatched red, seen but never counted) and Said aloud (violet). Each lane
// draws only what the replay has played so far; the playhead runs across all of them. Display only: the landing
// replay is a loop, not a scrubber.
import { Mic, ScanEye, ScanLine } from "lucide-react";
import type { Mention, Segment } from "@/lib/types";

interface Props {
  durationSec: number;
  segments: Segment[];
  rejected: Segment[];
  mentions: Mention[];
  /** Seconds played so far: lanes fill up to here and the playhead sits here. */
  timeSec: number;
}

export function LandingLanes({ durationSec, segments, rejected, mentions, timeSec }: Props) {
  const d = Math.max(durationSec, 0.001);
  const pct = (s: number) => (Math.min(Math.max(s, 0), d) / d) * 100;
  const upTo = (list: Segment[]) =>
    list.filter((s) => s.startSec < timeSec).map((s) => ({ startSec: s.startSec, endSec: Math.min(s.endSec, timeSec) }));
  const span = (s: Segment, min = 0) => ({ left: `${pct(s.startSec)}%`, width: `max(${min}px, ${pct(s.endSec) - pct(s.startSec)}%)` });

  const lanes = [
    { key: "product", label: "On screen", Icon: ScanEye, h: "h-7", tone: "text-(--signal-ink)" },
    ...(rejected.length ? [{ key: "reject", label: "Look-alike", Icon: ScanLine, h: "h-4", tone: "text-(--reject)" }] : []),
    ...(mentions.length ? [{ key: "voice", label: "Said aloud", Icon: Mic, h: "h-4", tone: "text-(--voice)" }] : []),
  ];

  return (
    <div
      className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3"
      role="img"
      aria-label={`Timeline of the replay: product on screen in lime, look-alikes hatched red, spoken mentions in violet.`}
    >
      <div className="flex flex-col gap-1.5" aria-hidden>
        {lanes.map((l) => (
          <span key={l.key} className={`flex items-center gap-1.5 text-[12px] font-semibold text-(--ink-2) ${l.h}`}>
            <l.Icon className={`size-3.5 shrink-0 ${l.tone}`} strokeWidth={2.25} />
            {l.label}
          </span>
        ))}
      </div>
      <div className="relative flex flex-col gap-1.5" aria-hidden>
        {lanes.map((l) => (
          <div key={l.key} className={`relative overflow-hidden rounded-[6px] bg-(--wash) shadow-[inset_0_0_0_1px_var(--hair)] ${l.h}`}>
            {l.key === "product" &&
              upTo(segments).map((s) => <div key={s.startSec} className="absolute inset-y-0 bg-(--signal)" style={span(s, 2)} />)}
            {l.key === "reject" &&
              upTo(rejected).map((s) => (
                <div
                  key={s.startSec}
                  className="absolute inset-y-[3px] rounded-[3px] border-[1.5px] border-dashed border-(--reject) bg-[repeating-linear-gradient(135deg,rgb(194_57_43/0.2)_0_3px,transparent_3px_7px)]"
                  style={span(s, 4)}
                />
              ))}
            {l.key === "voice" &&
              mentions
                .filter((m) => m.startSec <= timeSec)
                .map((m) => (
                  <div
                    key={m.startSec}
                    className="absolute inset-y-[3px] rounded-[3px] bg-(--voice)"
                    style={span({ startSec: m.startSec, endSec: Math.min(m.endSec, timeSec) }, 4)}
                  />
                ))}
          </div>
        ))}
        <div
          className="pointer-events-none absolute -top-1 -bottom-0.5 w-0.5 -translate-x-1/2 bg-(--ink) transition-[left] duration-75 ease-linear"
          style={{ left: `${pct(timeSec)}%` }}
        >
          <span className="absolute -top-1 left-1/2 size-2.5 -translate-x-1/2 rounded-full bg-(--ink) ring-2 ring-white" />
        </div>
      </div>
    </div>
  );
}
