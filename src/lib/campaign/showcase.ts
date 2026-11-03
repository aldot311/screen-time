// Which real runs the landing page shows. They come from the LaCroix campaign (scripts/build-lacroix.mts); when a store
// does not have them, the landing page leaves those parts out rather than inventing anything.
import { sameHandle } from "./handle";
import { getVideo } from "./store";
import type { VideoEntry } from "./types";

interface Pick {
  campaignId: string;
  videoId: string;
  /** Plain names for the tracked objects, keyed by objectId, for visitors who have not seen the brief. */
  names: Record<string, string>;
}

/** The campaign the landing page sends people to: ten creators' Reels with a $300 fee and the product photo. */
export const SHOWCASE_CAMPAIGN = "lacroix-strawberry-peach";

/** Ash's re-cut: the pay case. All three terms met, one counted can. */
const HERO: Pick = {
  campaignId: SHOWCASE_CAMPAIGN,
  videoId: "ash-recut",
  names: { "0": "LaCroix Strawberry Peach can" },
};

// The look-alike examples, best first. Object ids are the ones stored in each report (checked against the live run).
const LOOKALIKES: Pick[] = [
  // Another brand's can rejected beside the counted LaCroix.
  {
    campaignId: SHOWCASE_CAMPAIGN,
    videoId: "aldo-2",
    names: { "0": "Poppi Raspberry Rose (another brand)", "1": "LaCroix Strawberry Peach can" },
  },
  // The right brand, the wrong flavor: rejected, so 0 s counted.
  {
    campaignId: SHOWCASE_CAMPAIGN,
    videoId: "aldo",
    names: { "1": "LaCroix Pamplemousse (a different flavor)" },
  },
];

export interface Showcased {
  video: VideoEntry & { report: NonNullable<VideoEntry["report"]> };
  names: Record<string, string>;
  href: string;
}

async function load(p: Pick): Promise<Showcased | null> {
  const video = await getVideo(p.campaignId, p.videoId).catch(() => null);
  if (!video?.report || video.status !== "done") return null;
  return { video: { ...video, report: video.report }, names: p.names, href: `/campaigns/${p.campaignId}/videos/${p.videoId}` };
}

/**
 * The hero run and the look-alike examples, each null or left out when this store does not have it finished.
 * `lookalikes` lists every look-alike example found, best first; `lookalike` is the first of them (the shape older
 * callers read).
 */
export async function loadShowcase(): Promise<{ hero: Showcased | null; lookalike: Showcased | null; lookalikes: Showcased[] }> {
  const [hero, ...found] = await Promise.all([load(HERO), ...LOOKALIKES.map(load)]);
  const lookalikes = found.filter((s): s is Showcased => s !== null);
  return { hero, lookalike: lookalikes[0] ?? null, lookalikes };
}

/**
 * The showcase campaign's videos with the hero's creator first (Ash: her re-cut, then the take it replaced), every other
 * video in its given order. Any other campaign's videos are returned as they are.
 */
export function featuredFirst<T extends { id: string; creator: string; createdAt: string }>(campaignId: string, videos: T[]): T[] {
  if (campaignId !== HERO.campaignId) return videos;
  const face = videos.find((v) => v.id === HERO.videoId)?.creator;
  if (!face) return videos;
  const theirs = videos.filter((v) => sameHandle(v.creator, face)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return [...theirs, ...videos.filter((v) => !sameHandle(v.creator, face))];
}

type Listed = { id: string; brand: string };

/**
 * A sort for a list of campaigns: the showcase campaign first, its brand's other campaigns right after it (so a brand
 * stays together), then every other brand A-Z, each brand's campaigns by `name`.
 */
export function showcaseFirst<T extends Listed>(campaigns: T[], name: (c: T) => string): (a: T, b: T) => number {
  const leadBrand = campaigns.find((c) => c.id === SHOWCASE_CAMPAIGN)?.brand;
  const rank = (c: T) => (c.brand === leadBrand ? 0 : 1);
  const isShowcase = (c: T) => (c.id === SHOWCASE_CAMPAIGN ? 0 : 1);
  return (a, b) => rank(a) - rank(b) || a.brand.localeCompare(b.brand) || isShowcase(a) - isShowcase(b) || name(a).localeCompare(name(b));
}
