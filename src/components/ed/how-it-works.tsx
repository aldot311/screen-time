"use client";

// "How it works" on the homepage: the five steps of a campaign as a step switcher with a small animated mock of the
// product beside each one. The steps list sits on the left with a rail beside the active step; the rail fills over the
// step's five seconds and the next step comes up when it is full, until the visitor picks one. Every value in the mocks
// is from a real run in the LaCroix test campaign (Aldo 2's Reel, Peter's Reel), not made up.
import { useEffect, useReducer, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowRight, Check, Clock, Copy, Mic, Play, X } from "lucide-react";
import { timecode, tenths } from "@/components/format";
import { PendingLink } from "./pending-link";
import { CASES, campaignHref, reportHref } from "./judge-path";
import { ADVANCE_MS, initialSwitcher, isRunning, stepForKey, switcherReducer } from "./how-switcher";

/** The LaCroix test campaign's own contract and fee (campaign.json). */
const TERMS = ["On screen at least 3 seconds in total", "Says LaCroix out loud", "Discloses the ad: says it is an ad or sponsored"] as const;
const FEE = "$300";

/** Aldo 2's Reel (video "aldo-2"): its report, as stored. */
const ALDO2 = {
  id: "aldo-2",
  creator: "Aldo 2",
  durationSec: 21.733333333333334,
  onScreenSec: 21.733333333333334,
  prompt: "drink can",
  mentions: [3.369473684210526, 7.782105263157895],
  heard: "La Croix",
  disclosure: { startSec: 12.93017543859649, endSec: 14.401052631578947, text: "this is an ad" },
  product: "LaCroix Strawberry Peach",
  lookalike: "Poppi Raspberry Rose",
};

/** Peter's Reel (video "peter"): held for no ad disclosure; the agent's draft note, word for word (first two paragraphs). */
const PETER_NOTE = [
  "Hey Peter, thanks for your Reel — the can looks great on screen 16.5 s in total and love that you said LaCroix out loud.",
  "One fix before we can wrap: it needs the ad disclosure. Right now there's no “ad” or “sponsored” said or shown on screen, so could you add that both in voice and on-screen text?",
];

const tc = (s: number) => timecode(s).replace(/\.0$/, "");
const at = (s: number) => `${((s / ALDO2.durationSec) * 100).toFixed(2)}%`;
const d = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

interface Step {
  title: string;
  text: string;
  caption: string;
  link?: { href: string; label: string };
  Mock: () => ReactNode;
}

const STEPS: Step[] = [
  {
    title: "Write the terms in plain English",
    text: "Type the contract the way you would say it. Muse Spark reads each line as a rule the checker can measure.",
    caption: "The LaCroix test campaign’s three terms, as written.",
    link: { href: campaignHref, label: "Open the campaign" },
    Mock: TermsMock,
  },
  {
    title: "Send each creator a link",
    text: "A one-time link, no account or password. The creator sends the final cut straight into your campaign.",
    caption: "What a creator sees when they open their link.",
    Mock: LinkMock,
  },
  {
    title: "Run the check",
    text: "SAM 3.1 tracks the product in every frame, Muse Spark rejects look-alikes against your product photo, and Voice Transcribe listens for your brand.",
    caption: `${ALDO2.creator}’s Reel, a real run on Meta’s API: the ${ALDO2.lookalike} in the shot is not counted.`,
    link: { href: reportHref(ALDO2.id), label: "Open the report" },
    Mock: RunMock,
  },
  {
    title: "Pay or hold, with the proof",
    text: "Each Reel gets a pay or hold call. Every term has a play button that jumps to the moment that proves it.",
    caption: `${ALDO2.creator}’s Reel met all three terms, so the call is pay.`,
    link: { href: reportHref(ALDO2.id), label: "Open the report" },
    Mock: VerdictMock,
  },
  {
    title: "The agent drafts the fix",
    text: "When a creator falls short, the follow-up agent drafts the note and a re-cut request. Nothing is sent until you approve.",
    caption: "Peter’s Reel never said it was an ad, so the fee is on hold and the agent drafts the fix.",
    link: { href: reportHref(CASES.agent), label: "Open Peter’s report" },
    Mock: AgentMock,
  },
];

const reduce = switcherReducer(STEPS.length);

export function HowItWorks() {
  const [s, dispatch] = useReducer(reduce, undefined, initialSwitcher);
  // The mocks replay from the start the first time the section comes on screen, not while it is still below the fold.
  const [seen, setSeen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([e]) => {
        dispatch({ type: "view", on: e.isIntersecting });
        if (e.isIntersecting) setSeen(true);
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const running = isRunning(s);
  const step = STEPS[s.active];

  return (
    <div
      ref={root}
      className="grid gap-6 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:gap-14"
      onPointerEnter={(e) => e.pointerType === "mouse" && dispatch({ type: "hover", on: true })}
      onPointerLeave={(e) => e.pointerType === "mouse" && dispatch({ type: "hover", on: false })}
      onFocus={() => dispatch({ type: "focus", on: true })}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) dispatch({ type: "focus", on: false });
      }}
    >
      <ol aria-label="How it works, step by step" className="min-w-0 lg:self-center">
        {STEPS.map((st, i) => {
          const active = i === s.active;
          return (
            <li key={st.title}>
              <button
                ref={(b) => {
                  tabs.current[i] = b;
                }}
                type="button"
                id={`how-step-${i}`}
                aria-pressed={active}
                aria-controls="how-panel"
                onClick={() => dispatch({ type: "select", index: i })}
                onKeyDown={(e) => {
                  const next = stepForKey(e.key, i, STEPS.length);
                  if (next === null) return;
                  e.preventDefault();
                  dispatch({ type: "select", index: next });
                  tabs.current[next]?.focus();
                }}
                className="group relative grid min-h-11 w-full grid-cols-[3px_minmax(0,1fr)] gap-x-5 rounded-(--r-ctl) py-3.5 pr-3 text-left outline-offset-0 hover:bg-(--wash)/50 active:bg-(--wash)"
              >
                {/* The rail: a hairline for every step; for the active one it fills, top to bottom, like the strip. */}
                <span className="relative block h-full overflow-hidden rounded-full bg-(--hair)" aria-hidden>
                  {active && (
                    <span
                      key={`${s.active}-${s.auto}-${seen}`}
                      className={`absolute inset-0 rounded-full bg-(--signal) ${s.auto ? "hw-rail" : ""}`}
                      data-paused={!running}
                      style={{ "--dur": `${ADVANCE_MS}ms` } as CSSProperties}
                      onAnimationEnd={(e) => {
                        if (e.animationName === "hw-rail" && e.target === e.currentTarget) dispatch({ type: "advance" });
                      }}
                    />
                  )}
                </span>
                <span className="min-w-0">
                  <span
                    className={`block text-[17px] leading-snug font-semibold transition-colors duration-200 ${active ? "text-(--ink)" : "text-(--ink-3) group-hover:text-(--ink-2)"}`}
                  >
                    {st.title}
                  </span>
                  {/* A phone shows only the open step's line, so the list and its mock fit on one screen. */}
                  <span className={`mt-1 text-[15px] leading-[1.5] text-(--ink-2) ${active ? "block" : "hidden lg:block lg:text-(--ink-3)"}`}>
                    {st.text}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div
        id="how-panel"
        role="region"
        aria-labelledby={`how-step-${s.active}`}
        aria-live={s.auto ? "off" : "polite"}
        className="min-w-0"
      >
        <div className="relative h-[480px] overflow-hidden rounded-(--r-card) bg-(--paper) ring-1 ring-(--hair) sm:h-[460px]">
          <Ruler />
          <div key={`${s.active}-${seen}`} className="absolute inset-0">
            <step.Mock />
          </div>
        </div>
        <p className="mt-3 flex flex-wrap items-center gap-x-3 px-1 text-[13.5px] leading-[1.5] text-(--ink-3)">
          <span>{step.caption}</span>
          {step.link && (
            <PendingLink
              href={step.link.href}
              className="ed-press -my-2 inline-flex min-h-11 items-center gap-1 rounded-full font-semibold text-(--ink) underline decoration-(--hair-2) decoration-2 underline-offset-4 hover:decoration-(--ink) active:opacity-70"
            >
              {step.link.label} <ArrowRight className="size-3.5" strokeWidth={2.5} aria-hidden />
            </PendingLink>
          )}
        </p>
      </div>
    </div>
  );
}

/** A faint time ruler along the stage's bottom edge: the tape every mock sits on. */
function Ruler() {
  return (
    <div
      className="absolute inset-x-0 bottom-0 h-5 opacity-60"
      style={{ backgroundImage: "repeating-linear-gradient(90deg, var(--hair-2) 0 1px, transparent 1px 12px)", maskImage: "linear-gradient(to top, black, transparent)" }}
      aria-hidden
    />
  );
}

const card = "rounded-(--r-inner) bg-(--card) shadow-(--sh-2) ring-1 ring-(--hair)";
const label = "text-[12.5px] font-semibold text-(--ink-3)";

/** The pointer that taps a control: place it inside a relative wrapper; its tip lands on the wrapper's centre. */
function Tap({ ms, className = "left-1/2 top-1/2" }: { ms: number; className?: string }) {
  return (
    <span className={`pointer-events-none absolute z-20 ${className}`} aria-hidden>
      <span className="hw-ring absolute -top-4 -left-4 block size-8 rounded-full bg-(--ink)/25" style={d(ms + 960)} />
      <svg viewBox="0 0 24 24" className="hw-cursor relative block size-6 drop-shadow-[0_2px_3px_rgb(20_19_15/0.3)]" style={d(ms)}>
        <path d="M3.5 2.5v16.2l4.3-4.1 2.8 6.3 2.9-1.3-2.8-6.2h6z" fill="var(--ink)" stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/** A step dot that starts as its number and ticks to done at `ms`. */
function TickDot({ n, ms }: { n: number; ms: number }) {
  return (
    <span className="relative grid size-6 shrink-0 place-items-center rounded-full bg-(--wash) text-[12px] font-semibold text-(--ink-3) tabular" aria-hidden>
      {n}
      <span className="hw-pop absolute inset-0 grid place-items-center rounded-full bg-(--pass-soft) text-(--pass)" style={d(ms)}>
        <Check className="size-3.5" strokeWidth={3} />
      </span>
    </span>
  );
}

function TermsMock() {
  const rules = ["seconds on screen in total ≥ 3", "“LaCroix” said out loud ≥ 1 time", "an ad disclosure, said or shown"];
  return (
    <div className="grid h-full place-items-center p-4 sm:p-8">
      <div className="hw-float w-full max-w-[440px]">
        <div className={`${card} hw-in`} style={d(80)}>
          <div className="flex items-baseline justify-between gap-3 border-b border-(--hair) px-4 py-3">
            <span className="text-[14px] font-semibold">Contract terms</span>
            <span className="text-[12.5px] text-(--ink-3) tabular">LaCroix · {FEE} per Reel</span>
          </div>
          <ul className="divide-y divide-(--hair)">
            {TERMS.map((t, i) => {
              const tapped = i === TERMS.length - 1;
              return (
                <li key={t} className="hw-in grid grid-cols-[22px_minmax(0,1fr)] gap-x-3 px-4 py-3" style={d(250 + i * 260)}>
                  <span className="relative mt-px grid size-[22px] place-items-center rounded-[7px] bg-(--card) ring-[1.5px] ring-(--hair-2)">
                    <span
                      className={`absolute inset-0 grid place-items-center rounded-[7px] bg-(--ink) text-white ${tapped ? "hw-pop" : ""}`}
                      style={tapped ? d(2100) : undefined}
                    >
                      <Check className="size-3.5" strokeWidth={3.25} aria-hidden />
                    </span>
                    {tapped && <Tap ms={1150} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[14.5px] leading-snug font-medium">{t}</span>
                    <span className="hw-in mt-1.5 flex flex-wrap items-center gap-1.5 text-[12.5px] text-(--ink-2)" style={d(2500 + i * 220)}>
                      <span className="font-semibold text-(--ink-3)">Muse Spark rule</span>
                      <span className="rounded-full bg-(--wash) px-2 py-0.5">{rules[i]}</span>
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

function LinkMock() {
  return (
    <div className="relative h-full">
      {/* The brand's side: the link, copied. */}
      <div className={`${card} hw-in absolute top-5 right-14 left-4 p-4 sm:top-8 sm:right-auto sm:left-8 sm:w-[340px]`} style={d(80)}>
        <p className={label}>Request video from creator</p>
        <p className="mt-1.5 text-[14px] leading-snug">
          Send this to <span className="font-semibold">{ALDO2.creator}</span>. It works once.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate rounded-[10px] bg-(--wash) px-3 py-2 text-[12.5px] text-(--ink-2)" aria-hidden>
            …/submit/<span className="tracking-[0.2em] text-(--ink-3)">••••••••</span>
          </span>
          <span className="relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-(--ink) px-3.5 text-[13px] font-semibold text-white">
            <span className="hw-out inline-flex items-center gap-1.5 opacity-0" style={d(1250)}>
              <Copy className="size-3.5" aria-hidden /> Copy link
            </span>
            <span className="hw-pop absolute inset-0 inline-flex items-center justify-center gap-1.5" style={d(1300)}>
              <Check className="size-3.5" strokeWidth={3} aria-hidden /> Copied
            </span>
            <Tap ms={400} />
          </span>
        </div>
      </div>
      {/* The creator's side: their page, the upload, and the thank-you. */}
      <div className="hw-float absolute right-4 bottom-7 w-[228px] sm:right-10 sm:bottom-10 sm:w-[250px]" style={d(1200)}>
        <div className={`hw-slide rounded-[22px] bg-(--card) p-4 shadow-(--sh-3) ring-1 ring-(--hair)`} style={d(1600)}>
          <p className="ed-display text-[18px] leading-[1.1]">Screen-Time asked for your video, {ALDO2.creator}</p>
          <p className="mt-2 text-[12.5px] leading-[1.45] text-(--ink-2)">Send the final cut you posted or will post.</p>
          <div className="relative mt-3.5 h-11">
            <span className="hw-out absolute inset-0 overflow-hidden rounded-full bg-(--ink) opacity-0" style={d(3500)}>
              <span className="hw-grow absolute inset-y-0 left-0 w-full bg-white/18" style={{ ...d(2150), "--dur": "1300ms" } as CSSProperties} />
              <span className="relative flex h-full items-center justify-center text-[13.5px] font-semibold text-white">Sending…</span>
            </span>
            <span
              className="hw-pop absolute inset-0 flex items-center justify-center gap-1.5 rounded-full bg-(--pass-soft) text-[13.5px] font-semibold text-(--pass)"
              style={d(3550)}
            >
              <Check className="size-4" strokeWidth={3} aria-hidden /> Sent. Thank you.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function RunMock() {
  const chip = "inline-flex h-6 items-center rounded-full px-2.5 text-[12px] font-semibold";
  const heard = [
    ...ALDO2.mentions.map((t) => ({ text: ALDO2.heard, t })),
    { text: ALDO2.disclosure.text, t: ALDO2.disclosure.startSec },
  ].sort((a, b) => a.t - b.t);
  return (
    <div className="flex h-full items-center justify-center gap-6 p-3 sm:p-8">
      {/* A drawing of the tracked frame, not footage: the counted can boxed in lime, the look-alike dashed red. */}
      <div className="hw-in relative hidden aspect-[9/16] w-[150px] shrink-0 overflow-hidden rounded-[14px] bg-(--ink) shadow-(--sh-2) md:block" style={d(80)} aria-hidden>
        <span className="hw-pop absolute top-[44%] left-[16%] h-[24%] w-[26%] rounded-[3px] border-2 border-(--signal)" style={d(700)}>
          <span className="absolute -top-[18px] left-[-2px] rounded-[3px] bg-(--signal) px-1 text-[9.5px] font-semibold whitespace-nowrap text-(--signal-ink)">LaCroix</span>
        </span>
        <span className="hw-pop absolute top-[58%] left-[58%] h-[22%] w-[24%] rounded-[3px] border-2 border-dashed border-(--reject)" style={d(1500)}>
          <span className="absolute -top-[18px] left-[-2px] rounded-[3px] bg-(--reject) px-1 text-[9.5px] font-semibold whitespace-nowrap text-white">Poppi</span>
        </span>
        <span className="absolute inset-x-3 bottom-3 h-1.5 overflow-hidden rounded-full bg-white/15">
          <span className="hw-grow absolute inset-0 bg-(--signal)" style={{ ...d(2900), "--dur": "700ms" } as CSSProperties} />
        </span>
      </div>

      <div className={`${card} hw-in w-full max-w-[420px] p-3.5 sm:p-4`} style={d(150)}>
        <p className="flex items-baseline justify-between gap-3">
          <span className="text-[14px] font-semibold">
            {ALDO2.creator}&rsquo;s Reel · <span className="tabular">{tenths(ALDO2.durationSec)}</span> s
          </span>
          <span className="relative text-[12.5px] font-semibold">
            <span className="hw-out text-(--ink-3) opacity-0" style={d(3300)}>
              Checking…
            </span>
            <span className="hw-pop absolute right-0 bottom-0 text-(--pass)" style={d(3350)}>
              Done
            </span>
          </span>
        </p>
        <ol className="mt-3 space-y-2.5 sm:space-y-3">
          <RunRow n={1} ms={600} title="Track product (SAM 3.1)">
            Tracked 2 objects from <span className="font-semibold text-(--ink)">“{ALDO2.prompt}”</span>
          </RunRow>
          <RunRow n={2} ms={1400} title="Reject look-alikes (Muse Spark)">
            <span className="flex flex-col items-start gap-1.5">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className={`${chip} bg-(--ink) text-white`}>Counted</span>
                <span>{ALDO2.product}</span>
              </span>
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className={`${chip} border border-dashed border-(--reject) bg-(--card) text-(--reject)`}>Not counted · look-alike</span>
                <span>{ALDO2.lookalike}</span>
              </span>
            </span>
          </RunRow>
          <RunRow n={3} ms={2200} title="Listen for the brand (Voice Transcribe)">
            <span className="flex flex-wrap gap-1.5">
              {heard.map((h) => (
                <span key={h.t} className="inline-flex h-6 items-center gap-1 rounded-full bg-(--voice-soft) px-2 text-[11.5px] sm:text-[12px] font-semibold text-(--voice)">
                  <Mic className="size-3" strokeWidth={2.5} aria-hidden />“{h.text}”<span className="ed-tc font-normal">{tc(h.t)}</span>
                </span>
              ))}
            </span>
          </RunRow>
          <RunRow n={4} ms={3000} title="Measure screen time">
            <span className="rounded-[4px] bg-(--signal) px-1 font-semibold text-(--signal-ink) tabular">{tenths(ALDO2.onScreenSec)} s</span> on screen
          </RunRow>
        </ol>
      </div>
    </div>
  );
}

function RunRow({ n, ms, title, children }: { n: number; ms: number; title: string; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[24px_minmax(0,1fr)] gap-x-3">
      <TickDot n={n} ms={ms} />
      <span className="min-w-0">
        <span className="block text-[13.5px] leading-6 font-semibold">{title}</span>
        <span className="hw-in mt-1 block text-[12.5px] leading-[1.45] text-(--ink-2)" style={d(ms + 120)}>
          {children}
        </span>
      </span>
    </li>
  );
}

function VerdictMock() {
  const proofs = [
    { text: TERMS[0], detail: `On screen ${tenths(ALDO2.onScreenSec)} s in total (needs 3 s)`, t: 0 },
    { text: TERMS[1], detail: `Mentioned ${ALDO2.mentions.length} times (needs 1 time)`, t: ALDO2.mentions[0] },
    { text: "Discloses the ad", detail: `Said “${ALDO2.disclosure.text}” at ${tc(ALDO2.disclosure.startSec)}`, t: ALDO2.disclosure.startSec },
  ];
  const win = ALDO2.disclosure;
  return (
    <div className="grid h-full place-items-center p-4 sm:p-8">
      <div className="hw-float w-full max-w-[460px]">
        <div className={`${card} hw-in p-4`} style={d(80)}>
          <div className="flex items-start justify-between gap-3">
            <span>
              <span className="block text-[14px] font-semibold">{ALDO2.creator}&rsquo;s Reel</span>
              <span className="block text-[12.5px] text-(--ink-2)">Delivered · all 3 terms met</span>
            </span>
            <span className="hw-pop inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-(--pass-soft) px-3 text-[14px] font-semibold text-(--pass)" style={d(450)}>
              <Check className="size-4" strokeWidth={3} aria-hidden /> Pay {FEE}
            </span>
          </div>
          <ul className="mt-3 divide-y divide-(--hair) border-y border-(--hair)">
            {proofs.map((p, i) => (
              <li key={p.text} className="hw-in grid grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-x-2.5 py-2.5" style={d(700 + i * 200)}>
                <Check className="size-4 text-(--pass)" strokeWidth={3} aria-label="Met" />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] leading-snug font-semibold">{p.text}</span>
                  <span className="block truncate text-[12px] leading-snug text-(--ink-2)">{p.detail}</span>
                </span>
                <span className="relative inline-flex h-8 items-center gap-1.5 rounded-full bg-(--card) pr-2.5 pl-2 ring-1 ring-(--hair-2)">
                  <Play className="size-3.5 fill-current" aria-hidden />
                  <span className="ed-tc text-[11.5px]">{tc(p.t)}</span>
                  {i === 2 && <Tap ms={1500} className="left-1/3 top-1/2" />}
                </span>
              </li>
            ))}
          </ul>
          {/* The strip for this Reel: lime the whole way (on screen all 21.7 s), violet where "La Croix" was heard. */}
          <div className="relative mt-4 h-9 overflow-hidden rounded-[6px] bg-(--wash)" aria-hidden>
            <span className="absolute inset-y-0 rounded-[2px] bg-(--signal)" style={{ left: 0, width: at(ALDO2.onScreenSec) }} />
            {ALDO2.mentions.map((m) => (
              <span key={m} className="absolute bottom-0 h-1/2 w-[3px] rounded-t-full bg-(--voice)" style={{ left: at(m) }} />
            ))}
            <span
              className="hw-pop absolute inset-y-0 rounded-[3px] shadow-[inset_0_0_0_2px_var(--ink)]"
              style={{ left: at(win.startSec), width: at(win.endSec - win.startSec), ...d(2550) }}
            />
            <span className="hw-seek absolute inset-y-0 w-0.5 -translate-x-1/2 bg-(--ink)" style={{ "--to": at(win.startSec), ...d(2450) } as CSSProperties}>
              <span className="absolute -top-0.5 left-1/2 size-2 -translate-x-1/2 rounded-full bg-(--ink)" />
            </span>
          </div>
          <div className="ed-tc mt-1 flex justify-between text-[11px] text-(--ink-3)" aria-hidden>
            <span>0:00</span>
            <span>{tc(ALDO2.durationSec)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function AgentMock() {
  const tools = ["Read the report", "Checked the creator's other videos", "Drafted a note to the creator"];
  return (
    <div className="relative h-full">
      <div className={`${card} hw-in absolute top-4 left-4 w-[230px] p-3.5 sm:top-8 sm:left-8 sm:w-[260px]`} style={d(80)}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[14px] font-semibold">Peter&rsquo;s Reel</span>
          <span className="inline-flex h-7 items-center gap-1 rounded-full bg-(--short-soft) px-2.5 text-[13px] font-semibold text-(--short)">
            <X className="size-3.5" strokeWidth={3} aria-hidden /> Hold {FEE}
          </span>
        </div>
        <p className="mt-1.5 text-[12.5px] text-(--ink-2)">Sponsorship not disclosed</p>
      </div>

      <div className="hw-float absolute right-4 bottom-5 left-8 sm:right-8 sm:bottom-9 sm:left-auto sm:w-[400px]" style={d(900)}>
        <div className={`hw-slide rounded-(--r-inner) bg-(--card) p-4 shadow-(--sh-3) ring-1 ring-(--hair)`} style={d(600)}>
          <p className="text-[14px] font-semibold">Follow-up agent</p>
          <p className="text-[12px] text-(--ink-3)">Muse Spark with tools · you approve anything sent</p>
          <ul className="mt-2.5 space-y-1">
            {tools.map((t, i) => (
              <li key={t} className="hw-in flex items-center gap-2 text-[12.5px] text-(--ink-2)" style={d(1000 + i * 300)}>
                <Check className="size-3.5 shrink-0 text-(--pass)" strokeWidth={3} aria-hidden />
                {t}
              </li>
            ))}
          </ul>
          <p className="hw-in mt-3 text-[12.5px] font-semibold" style={d(1900)}>
            Draft note to Peter
          </p>
          <div
            className="mt-1 h-[84px] overflow-hidden rounded-[10px] bg-(--wash)/70 px-3 py-2 sm:h-[118px]"
            style={{ maskImage: "linear-gradient(to bottom, black 70%, transparent)" }}
          >
            <div className="hw-write space-y-2 text-[12.5px] leading-[1.45] text-(--ink)" style={{ ...d(2000), "--dur": "1700ms" } as CSSProperties}>
              {PETER_NOTE.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
          </div>
          <p className="hw-in mt-2.5 flex items-center gap-1.5 text-[12.5px] font-medium text-(--ink-2)" style={d(3700)}>
            <Clock className="size-3.5 shrink-0" aria-hidden /> Waiting for you: a re-cut request
          </p>
        </div>
      </div>
    </div>
  );
}
