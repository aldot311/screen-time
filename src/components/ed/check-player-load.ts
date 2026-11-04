// Server side of the "check it yourself" player: the rows it lists and, for each labelled Reel, the stored campaign
// video and still (when the store has them). The frames themselves come from the label files and scored runs bundled
// in check-player-sources.ts, so the strips work even when the store is empty; a missing video only drops the picture.
import { getVideo } from "@/lib/campaign/store";
import { clipVideoId, type SampleRow } from "./accuracy-summary";
import { reelView } from "./check-player-data";
import { CHECK_REELS } from "./check-player-sources";
import type { CheckReelView, CheckRow } from "./check-player";
import { LACROIX, reportHref } from "./judge-path";

export async function loadCheckData(rows: SampleRow[]): Promise<{ rows: CheckRow[]; reels: CheckReelView[] }> {
  const sampled = await Promise.all(
    rows.map(async (r) => {
      const id = clipVideoId(r.clip);
      const video = id ? await getVideo(LACROIX, id).catch(() => null) : null;
      return { row: { ...r, href: video?.status === "done" ? reportHref(video.id) : undefined }, video };
    }),
  );
  const reels = sampled.flatMap(({ row, video }) => {
    const reel = CHECK_REELS.find((c) => c.clip === row.clip && c.target === row.target);
    return reel ? [reelView(reel, video) satisfies CheckReelView] : [];
  });
  return { rows: sampled.map((s) => s.row), reels };
}
