// The example reports every judge-facing link points at: the friends' LaCroix campaign (scripts/build-lacroix.mts).
// Ash is the main face: her re-cut is the pay case, and her first take (never says LaCroix) shows a re-cut replacing a
// hold. The hold case itself is a take that still decides the money: Aldo's wrong-flavor can.

export const LACROIX = "lacroix-strawberry-peach";

/** The video ids in that campaign each judging step opens. */
export const CASES = {
  /** Ash's re-cut: Delivered, every term met. */
  pay: "ash-recut",
  /** A Pamplemousse can, rejected as a look-alike, so nothing is counted and the fee is held. */
  hold: "aldo",
  /** Ash's first take: held for never saying LaCroix until her re-cut replaced it; its page points to the re-cut. */
  firstTake: "ash",
  /** Peter's Reel: held for no ad disclosure, the case the follow-up agent works on. */
  agent: "peter",
} as const;

export const campaignHref = `/campaigns/${LACROIX}`;
export const reportHref = (videoId: string) => `${campaignHref}/videos/${videoId}`;

/** Where "Try your own video" lands: the gate, limits and wait, stated above the new-campaign form. */
export const OWN_VIDEO_HREF = "/campaigns/new#before-you-start";
export const JUDGE_HREF = "/judge";
export const CONTACT_EMAIL = "founder@aetrai.com";
