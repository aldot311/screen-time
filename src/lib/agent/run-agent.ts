// Runs the follow-up agent on a stored video: the world it acts on comes from the store and the pipeline, each step is
// written to the video in order, and the turns spend through the same cost ledger as runs.
import { CostGuard } from "@/lib/meta/cost-guard";
import { budget, executeRun, startRun } from "@/lib/campaign/runner";
import { sameHandle } from "@/lib/campaign/roster";
import { getVideo, listVideos, updateVideo, withLedgerFile } from "@/lib/campaign/store";
import type { Campaign, VideoEntry } from "@/lib/campaign/types";
import { runAgent, type AgentRun } from "./campaign-agent";


export async function executeAgent(campaign: Campaign, video: VideoEntry): Promise<AgentRun> {
  // Step writes go out one at a time, in order; a failed write never blocks the next.
  let queue = Promise.resolve();
  const save = (agent: AgentRun) =>
    (queue = queue
      .catch(() => undefined)
      .then(async () => {
        await updateVideo(campaign.id, video.id, (v) => ({ ...v, agent }));
      }));
  const run = await withLedgerFile((ledgerPath) =>
    runAgent(
      {
        campaign,
        video,
        history: async () => (await listVideos(campaign.id)).filter((v) => sameHandle(v.creator, video.creator)),
        analyze: async (videoId) => {
          const start = await startRun(campaign.id, videoId);
          if (!start.ok) throw new Error(start.error);
          await executeRun(start.campaign, start.video);
          return (await getVideo(campaign.id, videoId)) ?? start.video;
        },
      },
      { guard: new CostGuard({ ...budget(), ledgerPath }), onStep: save },
    ),
  );
  await queue.catch(() => undefined);
  await updateVideo(campaign.id, video.id, (v) => ({ ...v, agent: run })).catch(() => null);
  return run;
}
