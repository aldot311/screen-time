// Which real runs the landing page shows. They come from the test set (pnpm import-runs); when a store does not
// have them, the landing page leaves those parts out rather than inventing anything.
import { getVideo } from "./store";
import type { VideoEntry } from "./types";

interface Pick {
  campaignId: string;
  videoId: string;
  /** Plain names for the tracked objects, keyed by objectId, for visitors who have not seen the brief. */
  names: Record<string, string>;
}

const HERO: Pick = {
  campaignId: "alani-nu-test-runs",
  videoId: "clip12",
  names: { "0": "Alani Nu Peach can", "1": "Stanley tumbler" },
};

const LOOKALIKE: Pick = {
  campaignId: "alani-nu-test-runs",
  videoId: "clip05",
  names: { "0": "Blue-and-white can" },
};

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

export async function loadShowcase() {
  const [hero, lookalike] = await Promise.all([load(HERO), load(LOOKALIKE)]);
  return { hero, lookalike };
}
