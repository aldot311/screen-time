// The report's headline: what the screen showed and what that meant for the contract, in one sentence. When nothing
// was counted it says why, from the objects SAM 3.1 tracked: it tracked nothing ("never on screen"), Muse Spark rejected
// only look-alikes ("only a different product"), or Muse Spark could not confirm an object was the product ("never
// confirmed").
import type { Verdict } from "@/components/format";
import type { VerifyVerdict } from "@/lib/types";

export function reportHeadline(o: {
  verdict: Verdict;
  brand: string;
  secondsOnScreen: number;
  tracks: readonly { verdict: VerifyVerdict }[];
  /** How many contract terms there are, and how many of them could not be checked. */
  terms: number;
  unchecked: number;
}): string {
  const { verdict, brand, terms: n, unchecked } = o;
  if (verdict === "pending") return "Not analyzed yet.";
  if (verdict === "review" && !n) return "No contract terms were set, so a person needs to check this one.";
  const found = o.secondsOnScreen > 0;
  const lookalikes = o.tracks.filter((t) => t.verdict === "lookalike").length;
  const onlyLookalikes = lookalikes > 0 && lookalikes === o.tracks.length;
  const seen = found
    ? `${brand} was on screen`
    : !o.tracks.length
      ? `${brand} was never on screen`
      : onlyLookalikes
        ? lookalikes === 1
          ? "Only a different product was on screen"
          : "Only different products were on screen"
        : `${brand} was never confirmed on screen`;
  if (verdict === "delivered") return `${seen}, ${found ? "and" : "but"} the contract was met.`;
  if (verdict === "short") return found ? `${seen}, but the contract fell short.` : `${seen}, so ${onlyLookalikes ? "nothing counted" : "the contract fell short"}.`;
  return `${seen}; a person needs to check ${unchecked === 1 ? "one term" : `${unchecked} terms`}.`;
}
