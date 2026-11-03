import { describe, expect, it } from "vitest";
import type { Showcased } from "@/lib/campaign/showcase";
import type { TrackVerification } from "@/lib/types";
import { isShowcased, lookalikeCards, lookalikePicks } from "./showcase-cards";

const track = (objectId: number, verdict: TrackVerification["verdict"], reason = "why"): TrackVerification =>
  ({ objectId, verdict, reason }) as TrackVerification;

const pick = (id: string, tracks: TrackVerification[], names: Record<string, string> = {}): Showcased =>
  ({
    video: { id, campaignId: "lacroix-strawberry-peach", report: { tracks } },
    names,
    href: `/campaigns/lacroix-strawberry-peach/videos/${id}`,
  }) as unknown as Showcased;

const hero = pick("ash-recut", [track(0, "match")]);
const poppi = pick("aldo-2", [track(0, "lookalike", "pink Poppi Raspberry Rose can"), track(1, "match")], { "0": "Poppi Raspberry Rose", "1": "LaCroix Strawberry Peach" });
const pamplemousse = pick("aldo", [track(0, "lookalike", "Pamplemousse, not Strawberry Peach")]);

describe("lookalikeCards", () => {
  it("shows the look-alike picks, never the hero, rejected objects first and the counted can last", () => {
    const cards = lookalikeCards({ hero, lookalike: poppi, flavor: pamplemousse });
    expect(cards.map((c) => `${c.show.video.id}#${c.track.objectId}`)).toEqual(["aldo-2#0", "aldo#0", "aldo-2#1"]);
    expect(cards.map((c) => c.name)).toEqual(["Poppi Raspberry Rose", "Look-alike", "LaCroix Strawberry Peach"]);
  });

  it("takes the picks as a list too, and shows each object once", () => {
    const cards = lookalikeCards({ hero, lookalikes: [poppi, pamplemousse, poppi] });
    expect(cards).toHaveLength(3);
  });

  it("is empty when the store has no look-alike picks, so the section is left out", () => {
    expect(lookalikeCards({ hero, lookalike: null })).toEqual([]);
    expect(lookalikeCards({ hero: null })).toEqual([]);
  });

  it("names an unclear object as unclear, not as a look-alike", () => {
    const blurred = pick("george", [track(0, "unclear")]);
    expect(lookalikeCards({ lookalike: blurred })[0].name).toBe("Unclear object");
  });
});

describe("lookalikePicks", () => {
  it("ignores anything that is not a showcased run", () => {
    expect(lookalikePicks({ hero, lookalike: poppi, campaign: "lacroix-strawberry-peach", count: 3, broken: { href: "/x" } })).toEqual([poppi]);
    expect(isShowcased(undefined)).toBe(false);
    expect(isShowcased(poppi)).toBe(true);
  });
});
