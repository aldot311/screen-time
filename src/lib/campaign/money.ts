// What each verdict means in money. A fee is what the brand agreed to pay a creator for one delivered video: the
// creator's own fee on the roster, else the campaign's fee per video. The app never moves money; these figures only say
// how much a recommendation covers ("Hold $300").
import { verdictOf, type Verdict } from "@/components/format";
import type { Campaign, VideoEntry } from "./types";

export const MAX_FEE = 1_000_000;

// Safe in the browser: no store or roster imports (those pull in Node modules).
const sameHandle = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** The agreed fee for one video from this creator, or null when none was set. */
export function feeFor(campaign: Pick<Campaign, "fee" | "creators">, handle: string): number | null {
  const own = campaign.creators?.find((c) => sameHandle(c.handle, handle))?.fee;
  return own ?? campaign.fee ?? null;
}

/** "$300", "$1,250", "$99.50": whole dollars without cents. */
export function usd(n: number): string {
  n = Math.round(n * 100) / 100;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });
}

/** pay / hold / review: what to do with the money for a finished video. */
export type Decision = "pay" | "hold" | "review";

export function decisionOf(verdict: Verdict): Decision | null {
  return verdict === "delivered" ? "pay" : verdict === "short" ? "hold" : verdict === "review" ? "review" : null;
}

export interface Bucket {
  creators: number;
  /** Sum of the known fees. */
  amount: number;
  /** Creators in this bucket with no fee set (their money is not in `amount`). */
  noFee: number;
}

export interface Payout {
  pay: Bucket;
  hold: Bucket;
  review: Bucket;
  /** True when at least one counted creator has a fee, so money is worth showing. */
  anyFee: boolean;
}

/**
 * One decision per creator, from that creator's latest finished video: a re-cut that passes replaces the miss it fixes.
 * Creators with no finished video yet are not counted.
 */
/** Each creator's latest finished video, keyed by lower-cased handle: the one that decides their money. */
export function latestFinished(videos: VideoEntry[]): Map<string, VideoEntry> {
  const latest = new Map<string, VideoEntry>();
  for (const v of videos) {
    if (v.status !== "done" || !v.report) continue;
    const key = v.creator.toLowerCase();
    const seen = latest.get(key);
    if (!seen || v.createdAt > seen.createdAt) latest.set(key, v);
  }
  return latest;
}

export function payout(campaign: Pick<Campaign, "fee" | "creators">, videos: VideoEntry[], opts: { perVideo?: boolean } = {}): Payout {
  // perVideo: every finished video on its own (a test set of separate clips), not each creator's latest.
  const latest = opts.perVideo
    ? new Map(videos.filter((v) => v.status === "done" && v.report).map((v) => [v.id, v]))
    : latestFinished(videos);
  const empty = (): Bucket => ({ creators: 0, amount: 0, noFee: 0 });
  const out: Payout = { pay: empty(), hold: empty(), review: empty(), anyFee: false };
  for (const v of latest.values()) {
    // A manager's override wins over the recommendation.
    const d = v.override?.decision ?? decisionOf(verdictOf(v.report));
    if (!d) continue;
    const fee = feeFor(campaign, v.creator);
    const b = out[d];
    b.creators++;
    if (fee === null) b.noFee++;
    else {
      b.amount += fee;
      out.anyFee = true;
    }
  }
  return out;
}

/** "Pay 5 creators $2,000 · hold 7 ($2,800) · review 1 ($400)" (or "videos" for a test set), or null when nothing is
 *  finished or no fee is set. */
export function payoutLine(p: Payout, unit: "creator" | "video" = "creator"): string | null {
  if (!p.anyFee) return null;
  const money = (b: Bucket) =>
    b.noFee === b.creators ? "no fee set" : usd(b.amount) + (b.noFee ? ` + ${b.noFee} without a fee` : "");
  const parts: string[] = [];
  if (p.pay.creators) parts.push(`Pay ${p.pay.creators} ${unit}${p.pay.creators === 1 ? "" : "s"} ${money(p.pay)}`);
  if (p.hold.creators) parts.push(`${parts.length ? "hold" : "Hold"} ${p.hold.creators} (${money(p.hold)})`);
  if (p.review.creators) parts.push(`${parts.length ? "review" : "Review"} ${p.review.creators} (${money(p.review)})`);
  return parts.length ? parts.join(" · ") : null;
}
