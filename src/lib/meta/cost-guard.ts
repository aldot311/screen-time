// Spending caps for paid Meta calls, backed by an append-only JSON ledger on disk.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export const SAM_USD_PER_FRAME = 0.2 / 1000;
export const SAM_MIN_FRAMES = 50;

export interface LedgerEntry {
  at: string;
  usd: number;
  note?: string;
}

export class CostLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CostLimitError";
  }
}

// Sums in micro-dollars so many small SAM charges do not drift past a cap by float error.
const micros = (usd: number) => Math.round(usd * 1e6);

// NaN compares false against every cap, so anything not a finite non-negative number must be refused.
const isValidUsd = (usd: unknown): usd is number => typeof usd === "number" && Number.isFinite(usd) && usd >= 0;

// Write queues are shared by every CostGuard in this process that points at the same ledger file.
// Cross-process writers are not coordinated (no file lock); run one paid pipeline per ledger at a time.
const ledgerQueues = new Map<string, Promise<unknown>>();
let tmpCounter = 0;

export class CostGuard {
  readonly maxUsdPerRun: number;
  readonly maxUsdTotal: number;
  readonly ledgerPath: string;
  private runMicros = 0;

  constructor(opts: { maxUsdPerRun: number; maxUsdTotal: number; ledgerPath: string }) {
    if (!isValidUsd(opts.maxUsdPerRun) || !isValidUsd(opts.maxUsdTotal)) {
      throw new Error(`Invalid cost caps: perRun=${opts.maxUsdPerRun} total=${opts.maxUsdTotal}`);
    }
    this.maxUsdPerRun = opts.maxUsdPerRun;
    this.maxUsdTotal = opts.maxUsdTotal;
    this.ledgerPath = opts.ledgerPath;
  }

  /** Each video request is billed for at least 50 frames. */
  static estimateSamUsd(frames: number): number {
    return Math.max(Math.ceil(frames), SAM_MIN_FRAMES) * SAM_USD_PER_FRAME;
  }

  estimateSamUsd(frames: number): number {
    return CostGuard.estimateSamUsd(frames);
  }

  get runSpentUsd(): number {
    return this.runMicros / 1e6;
  }

  async readLedger(): Promise<LedgerEntry[]> {
    let text: string;
    try {
      text = await readFile(this.ledgerPath, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
    const parsed = JSON.parse(text) as unknown;
    if (!Array.isArray(parsed)) throw new Error(`Cost ledger ${this.ledgerPath} is not a JSON array`);
    if (!parsed.every((e) => isValidUsd((e as Partial<LedgerEntry> | null)?.usd))) {
      throw new Error(`Cost ledger ${this.ledgerPath} has an entry without a valid usd amount`);
    }
    return parsed as LedgerEntry[];
  }

  async totalSpentUsd(): Promise<number> {
    const entries = await this.readLedger();
    return entries.reduce((sum, e) => sum + micros(e.usd), 0) / 1e6;
  }

  /** Throws CostLimitError if spending `usd` now would push this run or the ledger total over its cap. */
  async assertCanSpend(usd: number): Promise<void> {
    if (!isValidUsd(usd)) throw new Error(`Invalid spend amount: ${usd}`);
    const run = this.runMicros + micros(usd);
    if (run > micros(this.maxUsdPerRun)) {
      throw new CostLimitError(
        `Spend of $${usd.toFixed(4)} would exceed the per-run cap of $${this.maxUsdPerRun} (spent $${this.runSpentUsd.toFixed(4)})`,
      );
    }
    const total = micros(await this.totalSpentUsd()) + micros(usd);
    if (total > micros(this.maxUsdTotal)) {
      throw new CostLimitError(
        `Spend of $${usd.toFixed(4)} would exceed the total cap of $${this.maxUsdTotal} (ledger at $${((total - micros(usd)) / 1e6).toFixed(4)})`,
      );
    }
  }

  /** Records actual spend for this run and appends it to the ledger. Writes are serialized within the process. */
  record(usd: number, note?: string): Promise<void> {
    if (!isValidUsd(usd)) return Promise.reject(new Error(`Invalid spend amount: ${usd}`));
    const key = resolve(this.ledgerPath);
    const next = (ledgerQueues.get(key) ?? Promise.resolve()).then(async () => {
      const entries = await this.readLedger();
      entries.push({ at: new Date().toISOString(), usd, ...(note ? { note } : {}) });
      await mkdir(dirname(this.ledgerPath), { recursive: true });
      const tmp = `${this.ledgerPath}.${process.pid}.${++tmpCounter}.tmp`;
      await writeFile(tmp, JSON.stringify(entries, null, 2));
      await rename(tmp, this.ledgerPath);
      this.runMicros += micros(usd);
    });
    const settled = next.catch(() => undefined);
    ledgerQueues.set(key, settled);
    // Drop the entry once idle so long-lived processes do not keep one per ledger forever.
    void settled.then(() => {
      if (ledgerQueues.get(key) === settled) ledgerQueues.delete(key);
    });
    return next;
  }
}
