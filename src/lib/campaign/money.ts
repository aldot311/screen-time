// What each verdict means in money. A fee is what the brand agreed to pay a creator for one delivered video: the
// creator's own fee on the roster, else the campaign's fee per video. The app never moves money; these figures only say
// how much a recommendation covers ("Hold $300").
import { verdictOf, type Verdict } from "@/components/format";
import { reviewFlags } from "./review";
import type { Campaign, VideoEntry } from "./types";

export const MAX_FEE = 1_000_000;

// Safe in the browser: no store or roster imports (those pull in Node modules).
/** How a creator is matched across the roster and their videos: "Ash" and "ash" are one creator. The one place to
 *  change it. */
export const handleKey = (h: string) => h.toLowerCase();
const sameHandle = (a: string, b: string) => handleKey(a) === handleKey(b);

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
  /** Of `pay`, how many the report says to pay only after a look (a near miss, a blurred or unclear object), with no
   *  manager's call on them yet. Not a bucket of its own: they are still counted in `pay`. */
  afterLook: number;
}

const finished = (v: VideoEntry) => v.status === "done" && Boolean(v.report);
const empty = (): Bucket => ({ creators: 0, amount: 0, noFee: 0 });

function add(b: Bucket, fee: number | null) {
  b.creators++;
  if (fee === null) b.noFee++;
  else b.amount += fee;
}

/** A test set: several clips from one handle and no roster. Each clip is a test of its own, never a re-cut of another. */
export function isTestSet(campaign: Pick<Campaign, "creators">, videos: VideoEntry[]): boolean {
  return videos.length > 1 && !campaign.creators?.length && new Set(videos.map((v) => handleKey(v.creator))).size === 1;
}

/** The whole campaign in one count, so every screen (card, campaign page, list, report, CSV) adds up the same way. */
export interface Rollup {
  /** "video" for a test set, where every clip counts on its own; "creator" otherwise. */
  unit: "creator" | "video";
  /** Creators expected (the roster plus anyone who sent a video), or the clips of a test set. Always
   *  delivered + short + review + pending.creators, and pay + hold + review + pending in money. */
  total: number;
  /** By the deciding video's own verdict; a manager's call moves the money, not the verdict. */
  delivered: number;
  short: number;
  review: number;
  /** Nothing decided yet: no video sent, or the newest one is still waiting, running or stopped. With its fee. */
  pending: Bucket;
  /** The finished video that decides each creator's (or clip's) money. */
  deciding: VideoEntry[];
  /** Finished videos a newer take from the same creator replaced, by id, with that newer take. They pay or hold
   *  nothing: the newer take decides, once it is checked. */
  replacedBy: Map<string, VideoEntry>;
  payout: Payout;
}

/**
 * One decision per creator, from their newest video, the same one the Creators panel shows: a re-cut replaces the take
 * it fixes as soon as it is sent, and until it is checked that creator is pending. Roster creators who sent nothing are
 * pending too. A test set counts each clip on its own.
 */
export function rollup(campaign: Pick<Campaign, "fee" | "creators">, videos: VideoEntry[]): Rollup {
  const unit = isTestSet(campaign, videos) ? "video" : "creator";
  const newest = new Map<string, { handle: string; video?: VideoEntry }>();
  if (unit === "creator") for (const c of campaign.creators ?? []) newest.set(handleKey(c.handle), { handle: c.handle });
  for (const v of videos) {
    const key = unit === "video" ? v.id : handleKey(v.creator);
    const seen = newest.get(key);
    if (!seen) newest.set(key, { handle: v.creator, video: v });
    // The earlier upload wins a tie, as in the Creators panel.
    else if (!seen.video || v.createdAt > seen.video.createdAt) seen.video = v;
  }

  const deciding: VideoEntry[] = [];
  const pending = empty();
  for (const { handle, video } of newest.values()) {
    if (video && finished(video)) deciding.push(video);
    else add(pending, feeFor(campaign, handle));
  }
  const replacedBy = new Map<string, VideoEntry>();
  if (unit === "creator") {
    for (const v of videos) {
      const take = newest.get(handleKey(v.creator))?.video;
      if (finished(v) && take && take !== v) replacedBy.set(v.id, take);
    }
  }
  const verdicts = deciding.map((v) => verdictOf(v.report));
  return {
    unit,
    total: newest.size,
    delivered: verdicts.filter((v) => v === "delivered").length,
    short: verdicts.filter((v) => v === "short").length,
    review: verdicts.filter((v) => v === "review").length,
    pending,
    deciding,
    replacedBy,
    payout: tally(campaign, deciding),
  };
}

/** Pay, hold and review over the deciding videos, at each creator's fee. A manager's override wins over the
 *  recommendation. */
function tally(campaign: Pick<Campaign, "fee" | "creators">, deciding: VideoEntry[]): Payout {
  const out: Payout = { pay: empty(), hold: empty(), review: empty(), anyFee: false, afterLook: 0 };
  for (const v of deciding) {
    const d = v.override?.decision ?? decisionOf(verdictOf(v.report));
    if (!d) continue;
    const fee = feeFor(campaign, v.creator);
    add(out[d], fee);
    if (fee !== null) out.anyFee = true;
    if (d === "pay" && !v.override && v.report && reviewFlags(v.report).length > 0) out.afterLook++;
  }
  return out;
}

/** The money for these videos, as the rollup counts it. `perVideo` counts every finished video on its own, as a test
 *  set does. */
export function payout(campaign: Pick<Campaign, "fee" | "creators">, videos: VideoEntry[], opts: { perVideo?: boolean } = {}): Payout {
  return opts.perVideo ? tally(campaign, videos.filter(finished)) : rollup(campaign, videos).payout;
}

/** "Pay 5 creators $1,500 (1 after a look) · hold 3 ($900) · review 1 ($300) · 1 pending ($300)" (or "videos" for a
 *  test set), or null when nothing is decided yet or no fee is set. */
export function payoutLine(p: Payout, unit: "creator" | "video" = "creator", pending?: Bucket): string | null {
  if (!p.anyFee) return null;
  const money = (b: Bucket) =>
    b.noFee === b.creators ? "no fee set" : usd(b.amount) + (b.noFee ? ` + ${b.noFee} without a fee` : "");
  const parts: string[] = [];
  if (p.pay.creators)
    parts.push(`Pay ${p.pay.creators} ${unit}${p.pay.creators === 1 ? "" : "s"} ${money(p.pay)}${p.afterLook ? ` (${p.afterLook} after a look)` : ""}`);
  if (p.hold.creators) parts.push(`${parts.length ? "hold" : "Hold"} ${p.hold.creators} (${money(p.hold)})`);
  if (p.review.creators) parts.push(`${parts.length ? "review" : "Review"} ${p.review.creators} (${money(p.review)})`);
  if (!parts.length) return null;
  if (pending?.creators) parts.push(`${pending.creators} pending (${money(pending)})`);
  return parts.join(" · ");
}
