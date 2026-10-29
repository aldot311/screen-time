"use client";

// The contract as tappable terms. Each card is a term the checker knows how to measure, with its numbers editable in
// place; "Write your own" takes anything else in plain English. The picker produces the same plain-English
// contractTerms array the API has always taken: Muse Spark still turns each line into a typed rule.
import { useId, type ReactNode } from "react";
import { Check, CircleAlert } from "lucide-react";

export type TermId = "total" | "within" | "mention" | "continuous" | "area" | "disclose";

export interface TermState {
  on: Record<TermId, boolean>;
  total: string;
  withinSec: string;
  withinFirst: string;
  mention: string;
  continuous: string;
  areaPct: string;
  areaSec: string;
  ownOn: boolean;
  own: string;
}

/** Pre-selected: 3 s in total, 2 s in the first 5 s, say the brand once, disclose. */
export const DEFAULT_TERMS: TermState = {
  on: { total: true, within: true, mention: true, continuous: false, area: false, disclose: true },
  total: "3",
  withinSec: "2",
  withinFirst: "5",
  mention: "1",
  continuous: "2",
  areaPct: "10",
  areaSec: "2",
  ownOn: false,
  own: "",
};

const num = (s: string) => (s.trim() === "" ? NaN : Number(s.trim().replace(",", ".")));
const secs = (n: number) => `${n} second${n === 1 ? "" : "s"}`;

/** What each kind of number accepts: seconds from 0.1 in steps of 0.1, percent and counts as whole numbers. */
const KIND = {
  seconds: { min: 0.1, decimals: 1, message: "Use seconds from 0.1, in steps of 0.1." },
  percent: { min: 1, decimals: 0, message: "Use a whole percent from 1 to 100." },
  count: { min: 1, decimals: 0, message: "Use a whole number of times, 1 or more." },
} as const;

/**
 * The number exactly as it will be written into the term, or null when it is not one the term can take. Nothing is
 * rounded: "0.001" is refused rather than written as "0".
 */
export function readNumber(v: string, kind: keyof typeof KIND): number | null {
  const t = v.trim().replace(",", ".");
  const m = /^(\d{1,4})(?:\.(\d+))?$/.exec(t);
  if (!m) return null;
  const decimals = (m[2] ?? "").replace(/0+$/, "").length;
  const n = Number(t);
  if (decimals > KIND[kind].decimals || n < KIND[kind].min) return null;
  if (kind === "percent" && n > 100) return null;
  return n;
}

/** The terms as the API takes them, plus a problem per card that needs fixing first. */
export function termsFrom(s: TermState): { terms: string[]; problems: Partial<Record<TermId | "own", string>> } {
  const terms: string[] = [];
  const problems: Partial<Record<TermId | "own", string>> = {};
  const read = (id: TermId, v: string, kind: keyof typeof KIND) => {
    const n = readNumber(v, kind);
    if (n === null) problems[id] ??= KIND[kind].message;
    return n;
  };
  if (s.on.total) {
    const n = read("total", s.total, "seconds");
    if (n !== null) terms.push(`On screen at least ${secs(n)} in total`);
  }
  if (s.on.within) {
    const a = read("within", s.withinSec, "seconds");
    const b = read("within", s.withinFirst, "seconds");
    if (a !== null && b !== null) {
      if (a > b) problems.within = `${a} s cannot fit in the first ${b} s.`;
      else terms.push(`On screen at least ${secs(a)} within the first ${secs(b)}`);
    }
  }
  if (s.on.mention) {
    const n = read("mention", s.mention, "count");
    if (n !== null) terms.push(`Say the brand name at least ${n === 1 ? "once" : `${n} times`}`);
  }
  if (s.on.continuous) {
    const n = read("continuous", s.continuous, "seconds");
    if (n !== null) terms.push(`One continuous shot of at least ${secs(n)}`);
  }
  if (s.on.area) {
    const p = read("area", s.areaPct, "percent");
    const n = read("area", s.areaSec, "seconds");
    if (p !== null && n !== null) terms.push(`Product fills at least ${p}% of the frame for ${secs(n)}`);
  }
  if (s.on.disclose) terms.push("Disclose the sponsorship (#ad or “sponsored”)");
  if (s.ownOn) {
    const lines = s.own
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) problems.own = "Write a term, or untick Write your own.";
    terms.push(...lines);
  }
  return { terms, problems };
}

export function TermPicker({
  value,
  onChange,
  showProblems,
}: {
  value: TermState;
  onChange: (next: TermState) => void;
  /** Problems show after the first submit, so a half-typed number is not shouted at. */
  showProblems: boolean;
}) {
  const { terms, problems } = termsFrom(value);
  const set = (p: Partial<TermState>) => onChange({ ...value, ...p });
  const toggle = (id: TermId, on = !value.on[id]) => set({ on: { ...value.on, [id]: on } });
  // Editing a number means the brand wants that term: it switches on.
  const edit = (id: TermId, p: Partial<TermState>) => onChange({ ...value, ...p, on: { ...value.on, [id]: true } });
  const shown = (id: TermId | "own") => (showProblems ? problems[id] : undefined);

  return (
    <div>
      <ul className="space-y-2" aria-label="Contract terms">
        <Card id="total" on={value.on.total} onToggle={toggle} problem={shown("total")}>
          On screen at least <Num label="Seconds on screen in total" value={value.total} onChange={(v) => edit("total", { total: v })} /> seconds in
          total
        </Card>
        <Card id="within" on={value.on.within} onToggle={toggle} problem={shown("within")}>
          On screen at least <Num label="Seconds on screen early" value={value.withinSec} onChange={(v) => edit("within", { withinSec: v })} unit=" s" />{" "}
          within the first <Num label="Opening window in seconds" value={value.withinFirst} onChange={(v) => edit("within", { withinFirst: v })} unit=" s" />
        </Card>
        <Card id="mention" on={value.on.mention} onToggle={toggle} problem={shown("mention")} hint="Voice Transcribe listens for it">
          Say the brand name at least{" "}
          <Num label="Times the brand name is said" value={value.mention} integer onChange={(v) => edit("mention", { mention: v })} />{" "}
          {num(value.mention) === 1 ? "time" : "times"}
        </Card>
        <Card id="continuous" on={value.on.continuous} onToggle={toggle} problem={shown("continuous")}>
          One continuous shot of <Num label="Seconds in one continuous shot" value={value.continuous} onChange={(v) => edit("continuous", { continuous: v })} unit=" s" />
        </Card>
        <Card id="area" on={value.on.area} onToggle={toggle} problem={shown("area")}>
          Product fills <Num label="Percent of the frame" value={value.areaPct} onChange={(v) => edit("area", { areaPct: v })} unit="%" /> of the frame for{" "}
          <Num label="Seconds at that size" value={value.areaSec} onChange={(v) => edit("area", { areaSec: v })} unit=" s" />
        </Card>
        <Card id="disclose" on={value.on.disclose} onToggle={toggle} hint="Said aloud, or #ad, “Sponsored” or “Paid partnership” on screen">
          Disclose the sponsorship (#ad or &ldquo;sponsored&rdquo;)
        </Card>
        <OwnCard value={value} set={set} problem={shown("own")} />
      </ul>
      <p className="mt-3 text-[13.5px] text-(--ink-3)" aria-live="polite">
        {terms.length === 0 ? (
          "No terms chosen. Every video will need a person to review it."
        ) : (
          <>
            <span className="font-semibold text-(--ink-2) tabular">
              {terms.length} term{terms.length === 1 ? "" : "s"}
            </span>{" "}
            will be checked. Muse Spark turns each into a rule, checked to the frame.
          </>
        )}
      </p>
    </div>
  );
}

const CARD = (on: boolean) =>
  [
    "flex min-h-[60px] cursor-pointer items-start gap-3 rounded-(--r-inner) px-3.5 py-2.5 transition-[background-color,box-shadow] duration-150",
    on
      ? "bg-(--card) shadow-(--sh-1) ring-2 ring-(--ink)"
      : "bg-(--card)/55 ring-1 ring-(--hair-2) active:bg-(--wash) [@media(hover:hover)]:hover:bg-(--card) [@media(hover:hover)]:hover:ring-(--ink-3)",
  ].join(" ");

/** The tick: a real checkbox (keyboard, screen readers) drawn as an ink box, with a 44px hit area around it. */
function Tick({ on, id, onChange, labelledBy }: { on: boolean; id: string; onChange: (on: boolean) => void; labelledBy?: string }) {
  return (
    <span className="-m-2.5 grid size-11 shrink-0 place-items-center">
      <input
        id={id}
        type="checkbox"
        checked={on}
        onChange={(e) => onChange(e.target.checked)}
        aria-labelledby={labelledBy}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className={[
          "grid size-6 place-items-center rounded-[7px] transition-[background-color,box-shadow,transform] duration-150 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-(--focus) peer-active:scale-90",
          on ? "bg-(--ink) text-white" : "bg-(--card) ring-[1.5px] ring-(--hair-2) ring-inset",
        ].join(" ")}
      >
        {on && <Check className="size-4" strokeWidth={3} />}
      </span>
    </span>
  );
}

function Card({
  id,
  on,
  onToggle,
  problem,
  hint,
  children,
}: {
  id: TermId;
  on: boolean;
  onToggle: (id: TermId, on: boolean) => void;
  problem?: string;
  hint?: string;
  children: ReactNode;
}) {
  const uid = useId();
  return (
    <li>
      {/* The checkbox is named by the sentence (aria-labelledby, which reads the numbers' values too). No <label> wraps
          the sentence, so a click in a number field only edits it; a click anywhere else on the card toggles the term,
          for pointer users only (keyboard users have the checkbox itself). */}
      <div
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("input, textarea, button, a")) return;
          onToggle(id, !on);
        }}
        className={`${CARD(on)} items-center!`}
      >
        <span className="flex">
          <Tick id={`${uid}-t`} on={on} onChange={(v) => onToggle(id, v)} labelledBy={`${uid}-s`} />
        </span>
        <span className="min-w-0 flex-1 py-1">
          {/* Lines that hold a number field grow to its 44px; plain lines keep a normal measure. */}
          <span id={`${uid}-s`} className={`block text-[15px] leading-[1.5] font-medium text-pretty ${on ? "text-(--ink)" : "text-(--ink-2)"}`}>
            {children}
          </span>
          {hint && <span className="mt-0.5 block text-[12.5px] leading-snug text-(--ink-3)">{hint}</span>}
          {problem && (
            <span role="alert" className="mt-1 flex items-start gap-1.5 text-[13.5px] leading-snug font-medium text-(--short)">
              <CircleAlert className="mt-px size-4 shrink-0" strokeWidth={2.25} aria-hidden />
              {problem}
            </span>
          )}
        </span>
      </div>
    </li>
  );
}

/** A number written into the sentence. The card ignores clicks that land in it, so editing never toggles the term. */
function Num({
  label,
  value,
  onChange,
  integer = false,
  unit,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  integer?: boolean;
  /** Kept on the number's line, so "2" and "s" never wrap apart. */
  unit?: string;
}) {
  const field = (
    <input
      type="text"
      inputMode={integer ? "numeric" : "decimal"}
      aria-label={label}
      value={value}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, "").slice(0, 5))}
      className="mx-0.5 my-0.5 inline-block h-11 w-[3.4em] rounded-[10px] bg-(--paper) px-1 text-center align-middle text-[16px] font-semibold text-(--ink) tabular ring-1 ring-(--hair-2) outline-none transition-shadow duration-150 focus:bg-(--card) focus:ring-2 focus:ring-(--ink) [@media(hover:hover)]:hover:ring-(--ink-3)"
    />
  );
  return unit ? (
    <span className="whitespace-nowrap">
      {field}
      {unit}
    </span>
  ) : (
    field
  );
}

function OwnCard({ value, set, problem }: { value: TermState; set: (p: Partial<TermState>) => void; problem?: string }) {
  const uid = useId();
  return (
    <li className={CARD(value.ownOn).replace("cursor-pointer ", "") + " flex-col items-stretch gap-0"}>
      <label htmlFor={`${uid}-t`} className="flex cursor-pointer items-center gap-3">
        <span className="flex">
          <Tick id={`${uid}-t`} on={value.ownOn} onChange={(v) => set({ ownOn: v })} />
        </span>
        <span className={`block flex-1 py-2.5 text-[15px] leading-[1.5] font-medium ${value.ownOn ? "text-(--ink)" : "text-(--ink-2)"}`}>
          Write your own
        </span>
      </label>
      {value.ownOn && (
        <div className="mt-1 mb-1 pl-[44px]">
          <textarea
            value={value.own}
            onChange={(e) => set({ own: e.target.value })}
            rows={2}
            aria-label="Your own contract terms, one per line"
            aria-describedby={`${uid}-h`}
            placeholder="e.g. On screen within the first 3 seconds"
            className="block min-h-[76px] w-full resize-none rounded-(--r-ctl) bg-(--paper) px-3 py-2.5 text-[16px] leading-snug ring-1 ring-(--hair-2) outline-none field-sizing-content placeholder:text-(--ink-3) focus:bg-(--card) focus:ring-2 focus:ring-(--ink)"
          />
          <p id={`${uid}-h`} className="mt-1.5 text-[12.5px] leading-snug text-(--ink-3)">
            One per line, in plain English. A term Screen-Time cannot measure is marked &ldquo;needs review&rdquo;, never passed.
          </p>
          {problem && (
            <p role="alert" className="mt-1 flex items-start gap-1.5 text-[13.5px] leading-snug font-medium text-(--short)">
              <CircleAlert className="mt-px size-4 shrink-0" strokeWidth={2.25} aria-hidden />
              {problem}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
