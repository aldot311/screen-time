import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FPS, type Segment } from "@/lib/types";

// Runs scripts/accuracy.mts end to end against a throwaway data/ folder.
const root = resolve(__dirname, "../../..");
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

interface Clip {
  ranges: [number, number][];
  segments?: Segment[];
  visibleFrames?: number[];
  checkedBy?: string;
  /** The run's receipt start; every clip gets one unless it is set to null. */
  startedAt?: string | null;
  /** More fields for the label file (the spoken terms) and the report (mentions, terms, disclosure). */
  label?: Record<string, unknown>;
  report?: Record<string, unknown>;
}

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "accuracy-"));
  dirs.push(dir);
  return dir;
}

function script(cwd: string, args: string[] = []): string {
  const r = spawnSync(
    join(root, "node_modules/.bin/tsx"),
    ["--tsconfig", join(root, "tsconfig.json"), join(root, "scripts/accuracy.mts"), ...args],
    { cwd, encoding: "utf8" },
  );
  if (r.status !== 0) throw new Error(`accuracy.mts exited ${r.status}: ${r.stderr}`);
  return r.stdout + r.stderr;
}

function runAccuracy(clips: Record<string, Clip>, args: string[] = []): { out: string; json: () => Record<string, unknown> } {
  const dir = tempDir();
  mkdirSync(join(dir, "data/labels"), { recursive: true });
  for (const [clip, c] of Object.entries(clips)) {
    mkdirSync(dirname(join(dir, "data/labels", `${clip}.json`)), { recursive: true });
    writeFileSync(
      join(dir, "data/labels", `${clip}.json`),
      JSON.stringify({ id: clip, ...(c.checkedBy !== undefined ? { checkedBy: c.checkedBy } : {}), ...c.label, targets: [{ name: "brand", ranges: c.ranges }] }),
    );
    const out = join(dir, "data/out/brand", clip);
    mkdirSync(out, { recursive: true });
    const metrics: Record<string, unknown> = { segments: c.segments ?? [], ...(c.report?.metrics as object) };
    if (c.visibleFrames) metrics.visibleFrames = c.visibleFrames;
    const startedAt = c.startedAt === undefined ? "2026-11-03T06:00:00.000Z" : c.startedAt;
    writeFileSync(join(out, "report.json"), JSON.stringify({ ...c.report, metrics, ...(startedAt ? { receipt: { runId: `${clip}-run`, startedAt } } : {}) }));
  }
  const jsonPath = join(dir, "score.json");
  const out = script(dir, [...args, "--json", jsonPath]);
  return { out, json: () => JSON.parse(readFileSync(jsonPath, "utf8")) };
}

const seg = (first: number, last: number): Segment => ({ startSec: first / FPS, endSec: (last + 1) / FPS });

describe("scripts/accuracy.mts", () => {
  it("scores the visible frames, not the bridged gap inside a segment", () => {
    // Frame 2 was bridged into the segment but never detected; truth agrees it is off screen.
    const { out } = runAccuracy({ a: { ranges: [[0, 1], [3, 3]], segments: [seg(0, 3)], visibleFrames: [0, 1, 3] } });
    expect(out).toMatch(/a:brand .*precision 100%\s+recall 100%/);
    expect(out).toContain("Overall (per frame): precision 100.0%");
    expect(out).not.toMatch(/warning/i);
  }, 30_000);

  it("falls back to segments with a warning for reports without visibleFrames", () => {
    const { out } = runAccuracy({ a: { ranges: [[0, 1], [3, 3]], segments: [seg(0, 3)] } });
    expect(out).toMatch(/warning/i);
    expect(out).toMatch(/a:brand .*precision  75%/);
  }, 30_000);

  it("reports precision n/a and recall 0% when nothing was predicted", () => {
    const { out } = runAccuracy({ a: { ranges: [[0, 14]], visibleFrames: [] } });
    expect(out).toMatch(/a:brand .*precision n\/a\s+recall\s+0%/);
    expect(out).toMatch(/Overall \(per frame\): precision n\/a\s+recall 0\.0%\s+F1 0\.0%/);
  }, 30_000);

  it("lets a false positive on an expected-0 s clip lower precision", () => {
    const { out } = runAccuracy({
      a: { ranges: [[0, 9]], segments: [seg(0, 9)], visibleFrames: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
      b: { ranges: [], segments: [seg(0, 9)], visibleFrames: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
    });
    expect(out).toMatch(/b:brand .*precision\s+0%\s+recall n\/a/);
    expect(out).toContain("Overall (per frame): precision 50.0%  recall 100.0%");
  }, 30_000);

  it("finds reports for clips in subfolders by their full id", () => {
    const { out } = runAccuracy({ "stock/s1": { ranges: [[0, 2]], visibleFrames: [0, 1, 2] } });
    expect(out).toMatch(/stock\/s1:brand .*precision 100%/);
  }, 30_000);

  it("dates the measurement from the newest run scored, not from today", () => {
    const clips = {
      a: { ranges: [[0, 1]] as [number, number][], visibleFrames: [0, 1], startedAt: "2026-11-02T23:59:00.000Z" },
      b: { ranges: [[0, 1]] as [number, number][], visibleFrames: [0, 1], startedAt: "2026-11-03T20:33:30.514Z" },
    };
    const run = runAccuracy(clips);
    expect(run.json().measuredAt).toBe("2026-11-03");
    expect(run.out).toContain("Measured 2026-11-03 (newest run scored)");
    expect(runAccuracy(clips, ["--measured-at", "2026-11-05"]).json().measuredAt).toBe("2026-11-05");
    // Without any receipt it says so, and falls back to today.
    const undated = runAccuracy({ a: { ranges: [[0, 1]], visibleFrames: [0, 1], startedAt: null } });
    expect(undated.out).toMatch(/warning: no report has a receipt date/);
    expect(undated.json().measuredAt).toBe(new Date().toISOString().slice(0, 10));
  }, 30_000);

  it("counts only label files a person checked: not empty, not drafted by Claude", () => {
    const run = runAccuracy({
      a: { ranges: [[0, 1]], visibleFrames: [0, 1], checkedBy: "" },
      b: { ranges: [[0, 1]], visibleFrames: [0, 1], checkedBy: "Claude, at full resolution" },
      c: { ranges: [[0, 1]], visibleFrames: [0, 1], checkedBy: "Aldo Tile, 2026-11-04, frame by frame in /label" },
      d: { ranges: [[0, 1]], visibleFrames: [0, 1] },
    });
    expect(run.json().labels).toEqual({
      clips: 4,
      checkedByPerson: 1,
      checkedBy: { b: "Claude, at full resolution", c: "Aldo Tile, 2026-11-04, frame by frame in /label" },
    });
    expect(run.out).toContain("Labels checked by a person: 1 of 4");
  }, 30_000);

  it("scores the spoken terms against a person's labels once they exist", () => {
    const heard = (startSec: number) => ({ metrics: { mentions: [{ startSec, endSec: startSec + 0.5, text: "LaCroix" }] } });
    const disclosed = (pass: boolean) => ({ terms: [{ term: { text: "Discloses the ad", rule: { kind: "disclosed" } }, pass }] });
    const without = runAccuracy({ a: { ranges: [[0, 1]], visibleFrames: [0, 1] } });
    expect(without.json().spoken).toBeNull();
    const run = runAccuracy({
      a: { ranges: [[0, 1]], visibleFrames: [0, 1], label: { saidBrand: true, saidBrandAtSec: 2, disclosure: "said" }, report: { ...heard(2.5), ...disclosed(true) } },
      b: { ranges: [[0, 1]], visibleFrames: [0, 1], label: { saidBrand: false, disclosure: "implied" }, report: { ...heard(1), ...disclosed(true) } },
      c: { ranges: [[0, 1]], visibleFrames: [0, 1], label: { saidBrand: true } },
    });
    const spoken = run.json().spoken as Record<string, Record<string, unknown>>;
    // c has no disclosure label yet, so it is not scored; "implied" is not a disclosure, so b's pass disagrees.
    expect(spoken).toMatchObject({ labelled: 2, of: 3, brand: { agree: 1, of: 2, timed: 1, meanAbsErrorSec: 0.5 }, disclosure: { agree: 1, of: 2 } });
  }, 30_000);

  it("leaves the set's size out when a report has no frame count", () => {
    const run = runAccuracy({ a: { ranges: [[0, 1]], visibleFrames: [0, 1] } });
    expect(run.json().set).toBeNull();
    expect(run.out).not.toMatch(/^Set:/m);
  }, 30_000);

  it("reproduces the published figures from the committed runs (data/runs) and labels", () => {
    // src/lib/accuracy-data.json is what the site shows: it must be exactly what scoring data/runs against
    // data/labels/lacroix gives. A label change fails this until the file is regenerated, which is the point.
    const dir = tempDir();
    const jsonPath = join(dir, "score.json");
    script(root, ["--labels", "data/labels/lacroix", "--json", jsonPath]);
    const scored = JSON.parse(readFileSync(jsonPath, "utf8"));
    expect(scored).toEqual(JSON.parse(readFileSync(join(root, "src/lib/accuracy-data.json"), "utf8")));
    // objects.json judged a fridge-door sliver (George, track 1) in the earlier zoomed run; the delivered run never
    // tracked it, so it is neither scored nor reported as left out.
    expect(scored.objects).toMatchObject({ judged: 12, unsure: 0 });
  }, 60_000);
});
