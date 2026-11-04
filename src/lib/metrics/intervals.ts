// How sure the accuracy figures are, in two plain methods: an exact binomial interval for a count (objects judged
// correctly), and a bootstrap that resamples whole clips for the per-frame scores. Frames of one clip are not
// independent (a can in frame 40 is almost always in frame 41), so the clip is the unit that gets resampled.

/** Per-frame counts for one clip: frames counted that were right, counted that were wrong, and missed. */
export interface FrameCounts {
  tp: number;
  fp: number;
  fn: number;
}

export interface Scores {
  precision: number | null;
  recall: number | null;
  f1: number | null;
}

/** Precision, recall and F1 from summed frame counts, as scripts/accuracy.mts scores them: precision is undefined
 *  when nothing was counted, recall when there was nothing to find, and missing every real frame is an F1 of 0. */
export function scoresOf(c: FrameCounts): Scores {
  const precision = c.tp + c.fp ? c.tp / (c.tp + c.fp) : null;
  const recall = c.tp + c.fn ? c.tp / (c.tp + c.fn) : null;
  const f1 = recall === 0 ? 0 : precision === null || recall === null ? null : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1 };
}

/** A small seeded generator (mulberry32): the same seed gives the same draws on every machine and every run. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Interval {
  lo: number;
  hi: number;
}

export interface BootstrapIntervals {
  precision: Interval | null;
  recall: Interval | null;
  f1: Interval | null;
}

/**
 * 95% percentile intervals for precision, recall and F1: draw as many clips as there are, with replacement, sum their
 * frame counts, score the draw, and repeat. The middle 95% of the scores is the interval. It shows how much the figures
 * depend on which clips are in the set; it says nothing about errors in the labels themselves.
 */
export function clipBootstrap(clips: FrameCounts[], opts: { seed: number; resamples: number; level?: number }): BootstrapIntervals {
  const rand = seededRandom(opts.seed);
  const draws: Record<keyof Scores, number[]> = { precision: [], recall: [], f1: [] };
  if (!clips.length) return { precision: null, recall: null, f1: null };
  for (let b = 0; b < opts.resamples; b++) {
    const sum: FrameCounts = { tp: 0, fp: 0, fn: 0 };
    for (let i = 0; i < clips.length; i++) {
      const c = clips[Math.floor(rand() * clips.length)];
      sum.tp += c.tp;
      sum.fp += c.fp;
      sum.fn += c.fn;
    }
    const s = scoresOf(sum);
    // A draw with nothing counted has no precision (and so on): it is left out of that figure's interval.
    for (const k of ["precision", "recall", "f1"] as const) if (s[k] !== null) draws[k].push(s[k]);
  }
  const tail = (1 - (opts.level ?? 0.95)) / 2;
  const at = (xs: number[], q: number) => xs[Math.min(xs.length - 1, Math.max(0, Math.round(q * (xs.length - 1))))];
  const interval = (xs: number[]): Interval | null => {
    if (!xs.length) return null;
    xs.sort((a, b) => a - b);
    return { lo: at(xs, tail), hi: at(xs, 1 - tail) };
  };
  return { precision: interval(draws.precision), recall: interval(draws.recall), f1: interval(draws.f1) };
}

/** P(X = k) for X ~ Binomial(n, p), in logs so larger n does not overflow. */
function binomialPmf(k: number, n: number, p: number, logFact: number[]): number {
  if (p <= 0) return k === 0 ? 1 : 0;
  if (p >= 1) return k === n ? 1 : 0;
  return Math.exp(logFact[n] - logFact[k] - logFact[n - k] + k * Math.log(p) + (n - k) * Math.log(1 - p));
}

/** The p where a monotone condition flips, to well under a millionth. */
function bisect(flipsAt: (p: number) => boolean): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (flipsAt(mid)) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Exact (Clopper-Pearson) two-sided interval for x successes in n trials: the range of true rates under which a
 * count this extreme would happen more than 2.5% of the time in each tail. 12 of 12 gives 73.5–100%.
 */
export function clopperPearson(x: number, n: number, level = 0.95): Interval {
  if (!Number.isInteger(x) || !Number.isInteger(n) || n <= 0 || x < 0 || x > n) throw new Error(`clopperPearson: bad count ${x} of ${n}`);
  const tail = (1 - level) / 2;
  const logFact = [0];
  for (let i = 1; i <= n; i++) logFact.push(logFact[i - 1] + Math.log(i));
  const atLeast = (p: number) => {
    let s = 0;
    for (let k = x; k <= n; k++) s += binomialPmf(k, n, p, logFact);
    return s;
  };
  const atMost = (p: number) => {
    let s = 0;
    for (let k = 0; k <= x; k++) s += binomialPmf(k, n, p, logFact);
    return s;
  };
  return {
    lo: x === 0 ? 0 : bisect((p) => atLeast(p) >= tail),
    hi: x === n ? 1 : bisect((p) => atMost(p) <= tail),
  };
}
