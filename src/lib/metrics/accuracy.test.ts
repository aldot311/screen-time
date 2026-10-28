import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
}

function runAccuracy(clips: Record<string, Clip>): string {
  const dir = mkdtempSync(join(tmpdir(), "accuracy-"));
  dirs.push(dir);
  mkdirSync(join(dir, "data/labels"), { recursive: true });
  for (const [clip, c] of Object.entries(clips)) {
    mkdirSync(dirname(join(dir, "data/labels", `${clip}.json`)), { recursive: true });
    writeFileSync(join(dir, "data/labels", `${clip}.json`), JSON.stringify({ id: clip, targets: [{ name: "brand", ranges: c.ranges }] }));
    const out = join(dir, "data/out/brand", clip);
    mkdirSync(out, { recursive: true });
    const metrics: Record<string, unknown> = { segments: c.segments ?? [] };
    if (c.visibleFrames) metrics.visibleFrames = c.visibleFrames;
    writeFileSync(join(out, "report.json"), JSON.stringify({ metrics }));
  }
  const r = spawnSync(
    join(root, "node_modules/.bin/tsx"),
    ["--tsconfig", join(root, "tsconfig.json"), join(root, "scripts/accuracy.mts")],
    { cwd: dir, encoding: "utf8" },
  );
  if (r.status !== 0) throw new Error(`accuracy.mts exited ${r.status}: ${r.stderr}`);
  return r.stdout + r.stderr;
}

const seg = (first: number, last: number): Segment => ({ startSec: first / FPS, endSec: (last + 1) / FPS });

describe("scripts/accuracy.mts", () => {
  it("scores the visible frames, not the bridged gap inside a segment", () => {
    // Frame 2 was bridged into the segment but never detected; truth agrees it is off screen.
    const out = runAccuracy({ a: { ranges: [[0, 1], [3, 3]], segments: [seg(0, 3)], visibleFrames: [0, 1, 3] } });
    expect(out).toMatch(/a:brand .*precision 100%\s+recall 100%/);
    expect(out).toContain("Overall (per frame): precision 100.0%");
    expect(out).not.toMatch(/warning/i);
  }, 30_000);

  it("falls back to segments with a warning for reports without visibleFrames", () => {
    const out = runAccuracy({ a: { ranges: [[0, 1], [3, 3]], segments: [seg(0, 3)] } });
    expect(out).toMatch(/warning/i);
    expect(out).toMatch(/a:brand .*precision  75%/);
  }, 30_000);

  it("reports precision n/a and recall 0% when nothing was predicted", () => {
    const out = runAccuracy({ a: { ranges: [[0, 14]], visibleFrames: [] } });
    expect(out).toMatch(/a:brand .*precision n\/a\s+recall\s+0%/);
    expect(out).toMatch(/Overall \(per frame\): precision n\/a\s+recall 0\.0%\s+F1 0\.0%/);
  }, 30_000);

  it("lets a false positive on an expected-0 s clip lower precision", () => {
    const out = runAccuracy({
      a: { ranges: [[0, 9]], segments: [seg(0, 9)], visibleFrames: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
      b: { ranges: [], segments: [seg(0, 9)], visibleFrames: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
    });
    expect(out).toMatch(/b:brand .*precision\s+0%\s+recall n\/a/);
    expect(out).toContain("Overall (per frame): precision 50.0%  recall 100.0%");
  }, 30_000);

  it("finds reports for clips in subfolders by their full id", () => {
    const out = runAccuracy({ "stock/s1": { ranges: [[0, 2]], visibleFrames: [0, 1, 2] } });
    expect(out).toMatch(/stock\/s1:brand .*precision 100%/);
  }, 30_000);
});
