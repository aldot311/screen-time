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
    // Entries may be negative (refunds from adjust()), but every one must be a finite number.
    const usdOf = (e: unknown) => (e as Partial<LedgerEntry> | null)?.usd;
    if (!parsed.every((e) => typeof usdOf(e) === "number" && Number.isFinite(usdOf(e)))) {
      throw new Error(`Cost ledger ${this.ledgerPath} has an entry without a valid usd amount`);
    }
    return parsed as LedgerEntry[];
  }

  async totalSpentUsd(): Promise<number> {
    const entries = await this.readLedger();
    return entries.reduce((sum, e) => sum + micros(e.usd), 0) / 1e6;
  }

  /**
   * Checks a spend against both caps without reserving it. Parallel callers can all pass this check;
   * paid pipelines must use reserve() instead.
   */
  async assertCanSpend(usd: number): Promise<void> {
    if (!isValidUsd(usd)) throw new Error(`Invalid spend amount: ${usd}`);
    this.checkCaps(usd, await this.totalSpentUsd());
  }

  /**
   * Atomically checks both caps and appends `usd` to the ledger, inside the same per-ledger queue as
   * every other write, so concurrent reservations cannot together overspend. Throws CostLimitError
   * (and writes nothing) when either cap would be exceeded.
   */
  reserve(usd: number, note?: string): Promise<void> {
    if (!isValidUsd(usd)) return Promise.reject(new Error(`Invalid spend amount: ${usd}`));
    return this.enqueue(async (entries) => {
      this.checkCaps(usd, entries.reduce((sum, e) => sum + micros(e.usd), 0) / 1e6);
      return usd;
    }, note);
  }

  /**
   * Corrects an earlier reservation once the real charge is known. A negative delta is a refund (it
   * cannot take this guard's spend below zero); a positive delta is recorded even past a cap, because
   * the money is already spent.
   */
  adjust(deltaUsd: number, note?: string): Promise<void> {
    if (typeof deltaUsd !== "number" || !Number.isFinite(deltaUsd)) {
      return Promise.reject(new Error(`Invalid adjustment: ${deltaUsd}`));
    }
    return this.enqueue(async () => {
      if (this.runMicros + micros(deltaUsd) < 0) {
        throw new Error(`Refund of $${(-deltaUsd).toFixed(4)} exceeds this run's spend of $${this.runSpentUsd.toFixed(4)}`);
      }
      return deltaUsd;
    }, note);
  }

  /** Records actual spend for this run and appends it to the ledger. Writes are serialized within the process. */
  record(usd: number, note?: string): Promise<void> {
    if (!isValidUsd(usd)) return Promise.reject(new Error(`Invalid spend amount: ${usd}`));
    return this.enqueue(async () => usd, note);
  }

  private checkCaps(usd: number, ledgerUsd: number): void {
    const run = this.runMicros + micros(usd);
    if (run > micros(this.maxUsdPerRun)) {
      throw new CostLimitError(
        `Spend of $${usd.toFixed(4)} would exceed the per-run cap of $${this.maxUsdPerRun} (spent $${this.runSpentUsd.toFixed(4)})`,
      );
    }
    const total = micros(ledgerUsd) + micros(usd);
    if (total > micros(this.maxUsdTotal)) {
      throw new CostLimitError(
        `Spend of $${usd.toFixed(4)} would exceed the total cap of $${this.maxUsdTotal} (ledger at $${ledgerUsd.toFixed(4)})`,
      );
    }
  }

  /** Runs `decide` against the current ledger inside the per-ledger queue, then appends the amount it returns. */
  private enqueue(decide: (entries: LedgerEntry[]) => Promise<number>, note?: string): Promise<void> {
    const key = resolve(this.ledgerPath);
    const next = (ledgerQueues.get(key) ?? Promise.resolve()).then(async () => {
      const entries = await this.readLedger();
      const usd = await decide(entries);
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
