import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { CostGuard, CostLimitError } from "./cost-guard";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "cost-guard-"));
});

const guard = (maxUsdPerRun: number, maxUsdTotal: number, ledgerPath = join(dir, "ledger.json")) =>
  new CostGuard({ maxUsdPerRun, maxUsdTotal, ledgerPath });

describe("estimateSamUsd", () => {
  it("charges $0.20 per 1000 frames with a 50-frame minimum", () => {
    expect(CostGuard.estimateSamUsd(1000)).toBeCloseTo(0.2, 10);
    expect(CostGuard.estimateSamUsd(450)).toBeCloseTo(0.09, 10);
    expect(CostGuard.estimateSamUsd(10)).toBeCloseTo(0.01, 10);
    expect(CostGuard.estimateSamUsd(0)).toBeCloseTo(0.01, 10);
    expect(guard(1, 1).estimateSamUsd(50)).toBeCloseTo(0.01, 10);
  });
});

describe("assertCanSpend / record", () => {
  it("allows spend up to the per-run cap exactly, and blocks past it", async () => {
    const g = guard(0.03, 10);
    await g.assertCanSpend(0.03);
    await g.record(0.01, "sam clip 1");
    await g.record(0.01);
    await g.assertCanSpend(0.01);
    await expect(g.assertCanSpend(0.0101)).rejects.toBeInstanceOf(CostLimitError);
    expect(g.runSpentUsd).toBeCloseTo(0.02, 10);
  });

  it("blocks when the ledger total from earlier runs would exceed the total cap", async () => {
    const path = join(dir, "ledger.json");
    await writeFile(path, JSON.stringify([{ at: "2026-10-27T00:00:00Z", usd: 0.95 }]));
    const g = guard(1, 1, path);
    await g.assertCanSpend(0.05);
    await expect(g.assertCanSpend(0.06)).rejects.toThrow(/total cap/);
  });

  it("appends entries to a JSON ledger shared across guard instances", async () => {
    const path = join(dir, "nested", "ledger.json");
    await guard(1, 1, path).record(0.01, "first");
    const second = guard(1, 1, path);
    await Promise.all([second.record(0.02), second.record(0.03)]);

    const entries = JSON.parse(await readFile(path, "utf8")) as Array<{ usd: number; note?: string }>;
    expect(entries.map((e) => e.usd)).toEqual([0.01, 0.02, 0.03]);
    expect(entries[0].note).toBe("first");
    expect(await second.totalSpentUsd()).toBeCloseTo(0.06, 10);
  });

  it("serializes writes across guard instances that share a ledger in one process", async () => {
    const path = join(dir, "shared.json");
    const a = guard(10, 10, path);
    const b = guard(10, 10, join(dir, ".", "shared.json"));
    await Promise.all(Array.from({ length: 10 }, (_, i) => (i % 2 ? a : b).record(0.01, `n${i}`)));
    const entries = JSON.parse(await readFile(path, "utf8")) as Array<{ note?: string }>;
    expect(entries.map((e) => e.note).sort()).toEqual(Array.from({ length: 10 }, (_, i) => `n${i}`).sort());
  });

  it("does not drift past a cap after many small charges", async () => {
    const g = guard(0.1, 10);
    for (let i = 0; i < 10; i++) await g.record(0.01);
    await g.assertCanSpend(0);
    await expect(g.assertCanSpend(0.000001)).rejects.toBeInstanceOf(CostLimitError);
  });

  it("rejects negative or NaN amounts", async () => {
    await expect(guard(1, 1).assertCanSpend(-1)).rejects.toThrow(/Invalid/);
    await expect(guard(1, 1).assertCanSpend(Number.NaN)).rejects.toThrow(/Invalid/);
    await expect(guard(1, 1).assertCanSpend(Number.POSITIVE_INFINITY)).rejects.toThrow(/Invalid/);
  });

  it("refuses to record invalid amounts, so the ledger cannot be lowered or poisoned", async () => {
    const g = guard(1, 1);
    await expect(g.record(-0.5)).rejects.toThrow(/Invalid/);
    await expect(g.record(Number.NaN)).rejects.toThrow(/Invalid/);
    expect(await g.readLedger()).toEqual([]);
  });

  it("fails closed on a ledger entry with a missing or non-numeric usd", async () => {
    const path = join(dir, "ledger.json");
    await writeFile(path, JSON.stringify([{ at: "2026-10-27T00:00:00Z" }, { at: "x", usd: "0.5" }]));
    await expect(guard(1, 1, path).assertCanSpend(0.01)).rejects.toThrow(/valid usd/);
  });

  it("rejects NaN or negative caps at construction", () => {
    expect(() => guard(Number.NaN, 1)).toThrow(/Invalid cost caps/);
    expect(() => guard(1, -1)).toThrow(/Invalid cost caps/);
  });
});

describe("reserve / adjust", () => {
  it("lets only one of two parallel reservations through when both together would pass the per-run cap", async () => {
    const g = guard(0.03, 10);
    const results = await Promise.allSettled([g.reserve(0.02, "a"), g.reserve(0.02, "b")]);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason).toBeInstanceOf(CostLimitError);
    expect(g.runSpentUsd).toBeCloseTo(0.02, 10);
    expect(await g.readLedger()).toHaveLength(1);
  });

  it("enforces the total cap across guards that share a ledger, even in parallel", async () => {
    const path = join(dir, "ledger.json");
    const results = await Promise.allSettled([guard(1, 0.03, path).reserve(0.02), guard(1, 0.03, path).reserve(0.02)]);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(await guard(1, 1, path).totalSpentUsd()).toBeCloseTo(0.02, 10);
  });

  it("refunds with a negative adjustment, which record() would refuse", async () => {
    const g = guard(1, 1);
    await g.reserve(0.015, "sam reserve");
    await expect(g.record(-0.005)).rejects.toThrow(/Invalid/);
    await g.adjust(-0.005, "sam adjust");
    expect(g.runSpentUsd).toBeCloseTo(0.01, 10);
    expect(await g.totalSpentUsd()).toBeCloseTo(0.01, 10);
    expect((await g.readLedger()).map((e) => e.usd)).toEqual([0.015, -0.005]);
  });

  it("records a positive adjustment even past the caps, since the money is already spent", async () => {
    const g = guard(0.01, 0.01);
    await g.reserve(0.01);
    await g.adjust(0.005, "billed more than estimated");
    expect(await g.totalSpentUsd()).toBeCloseTo(0.015, 10);
    await expect(g.reserve(0)).rejects.toBeInstanceOf(CostLimitError);
  });

  it("refuses a refund larger than this guard's spend, and non-finite adjustments", async () => {
    const g = guard(1, 1);
    await g.reserve(0.01);
    await expect(g.adjust(-0.02)).rejects.toThrow(/exceeds/);
    await expect(g.adjust(Number.NaN)).rejects.toThrow(/Invalid/);
    await expect(g.reserve(-1)).rejects.toThrow(/Invalid/);
    expect(await g.totalSpentUsd()).toBeCloseTo(0.01, 10);
  });
});
