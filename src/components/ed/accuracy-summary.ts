// What the landing page and /accuracy say about accuracy, computed from the measured data (src/lib/accuracy-data.json,
// written by `pnpm accuracy -- --json`), so a re-measure on new clips changes every figure, example and clip name on
// the site without anyone editing the copy. Nothing here invents a number: a sentence whose figure is missing is left out.

export interface AccuracyRow {
  clip: string;
  target: string;
  truthSec: number;
  predictedSec: number;
  precision: number | null;
  recall: number | null;
}

export interface AccuracyScore {
  mode: string;
  rows: AccuracyRow[];
  precision: number | null;
  recall: number | null;
  f1: number | null;
  meanAbsErrorSec: number;
  falseSecondsOnEmptyClips: number;
}

export interface AccuracyData {
  measuredAt: string;
  fps: number;
  scores: AccuracyScore[];
}

/** "97.7%" from 0.977, "n/a" when there was nothing to measure. */
export const pct = (x: number | null) => (x === null ? "n/a" : `${(x * 100).toFixed(1)}%`);

/** "95%" for table cells, "–" when there was nothing to measure. */
export const pct0 = (x: number | null) => (x === null ? "–" : `${Math.round(x * 100)}%`);

/** The two scored modes: SAM 3.1 alone, and SAM 3.1 + Muse Spark (what the app reports). Looked up by mode, with the
 *  file's order (sam, then verified) as the fallback. */
export function scoresOf(d: AccuracyData): { sam: AccuracyScore; verified: AccuracyScore } {
  return {
    sam: d.scores.find((s) => s.mode === "sam") ?? d.scores[0],
    verified: d.scores.find((s) => s.mode === "verified") ?? d.scores[d.scores.length - 1],
  };
}

/** "lacroix-can" → "LaCroix can", "stanley-tumbler" → "Stanley tumbler": a target id read as a product. */
export function targetName(target: string): string {
  const words = target.replace(/[-_]+/g, " ").trim();
  const named = words.replace(/\blacroix\b/gi, "LaCroix");
  return named.charAt(0).toUpperCase() + named.slice(1);
}

/** "stock/stock01" → "stock01": the folder is not part of the clip's name. */
export const clipName = (clip: string) => clip.replace(/^.*\//, "");

/** A clip with nothing to find: a look-alike (SAM alone counted something there) or no product at all. */
export type ZeroKind = "lookalike" | "empty";

function zeroKind(row: AccuracyRow, sam: AccuracyScore): ZeroKind | null {
  if (row.truthSec > 0) return null;
  const alone = sam.rows.find((r) => r.clip === row.clip && r.target === row.target);
  return (alone?.predictedSec ?? 0) > 0 ? "lookalike" : "empty";
}

export interface Summary {
  measuredAt: string;
  fps: number;
  targets: number;
  clips: number;
  /** Clips with more than one product checked, each on its own. */
  multiProductClips: number;
  stockClips: number;
  lookalikeClips: number;
  emptyClips: number;
  sam: AccuracyScore;
  verified: AccuracyScore;
}

export function summarize(d: AccuracyData): Summary {
  const { sam, verified } = scoresOf(d);
  const perClip = new Map<string, number>();
  for (const r of verified.rows) perClip.set(r.clip, (perClip.get(r.clip) ?? 0) + 1);
  const kinds = verified.rows.map((r) => zeroKind(r, sam));
  return {
    measuredAt: d.measuredAt,
    fps: d.fps,
    targets: verified.rows.length,
    clips: perClip.size,
    multiProductClips: [...perClip.values()].filter((n) => n > 1).length,
    stockClips: [...perClip.keys()].filter((c) => c.startsWith("stock/")).length,
    lookalikeClips: kinds.filter((k) => k === "lookalike").length,
    emptyClips: kinds.filter((k) => k === "empty").length,
    sam,
    verified,
  };
}

/** Seconds counted that the labels mark as not on screen, and real seconds that were not counted. */
export function missSeconds(r: AccuracyRow): { extraSec: number; missedSec: number } {
  return {
    extraSec: r.precision === null ? 0 : r.predictedSec * (1 - r.precision),
    missedSec: r.recall === null ? 0 : r.truthSec * (1 - r.recall),
  };
}

/** The row with the lowest precision and the (other) row with the lowest recall, when either is below 100%. */
export function weakest(rows: AccuracyRow[]): { precision?: AccuracyRow; recall?: AccuracyRow } {
  const low = (key: "precision" | "recall", skip?: AccuracyRow) =>
    rows
      .filter((r) => r !== skip && r[key] !== null && (r[key] as number) < 1)
      .reduce<AccuracyRow | undefined>((min, r) => (!min || (r[key] as number) < (min[key] as number) ? r : min), undefined);
  const precision = low("precision");
  return { precision, recall: low("recall", precision) };
}

export interface SampleRow extends AccuracyRow {
  weak?: "precision" | "recall";
  zero?: ZeroKind;
  note?: string;
}

/**
 * A short, honest sample of the rows for the landing page: the clearest checks, then the weakest precision and the
 * weakest recall on purpose, then the clips that must count 0 s (a look-alike, no product). At most `n` rows.
 */
export function sampleRows(d: AccuracyData, n = 7): SampleRow[] {
  const { sam, verified } = scoresOf(d);
  const rows = verified.rows;
  const perClip = new Map<string, number>();
  for (const r of rows) perClip.set(r.clip, (perClip.get(r.clip) ?? 0) + 1);
  const weak = weakest(rows);
  const zeros = rows.filter((r) => r.truthSec === 0).slice(0, 2);
  // A look-alike counted by mistake is both a must-be-0 clip and the weakest precision: list it once.
  const picked = [...new Set([weak.precision, weak.recall, ...zeros])].filter((r): r is AccuracyRow => r !== undefined);
  const fill = rows
    .filter((r) => !picked.includes(r))
    .sort((a, b) => b.truthSec - a.truthSec)
    .slice(0, Math.max(0, n - picked.length));
  return [...fill, ...picked].slice(0, n).map((r) => {
    const zero = zeroKind(r, sam) ?? undefined;
    const note =
      zero === "lookalike"
        ? "Only a look-alike in shot, must count 0"
        : zero === "empty"
          ? "No product in the video, must count 0"
          : (perClip.get(r.clip) ?? 0) > 1
            ? "One of two products in the same shot"
            : undefined;
    return { ...r, weak: r === weak.precision ? "precision" : r === weak.recall ? "recall" : undefined, zero, note };
  });
}
