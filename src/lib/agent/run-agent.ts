// Runs the follow-up agent on a stored video: the world it acts on comes from the store and the pipeline, each step is
// written to the video in order, and the turns spend through the same cost ledger as runs.
import { CostGuard } from "@/lib/meta/cost-guard";
import { budget, executeRun, startRun } from "@/lib/campaign/runner";
import { RUN_DEADLINE_MS } from "@/lib/campaign/run-time";
import { sameHandle } from "@/lib/campaign/roster";
import { getVideo, listVideos, updateVideo, withLedgerFile } from "@/lib/campaign/store";
import type { Campaign, VideoEntry } from "@/lib/campaign/types";
import { AGENT_MAX_USD, runAgent, type AgentRun } from "./campaign-agent";

/**
 * Runs the agent the route stored as "running" on `video` (its startedAt names the run in every write). With `public`
 * (a visitor without the demo password, on an example report) it cannot re-check a re-cut, and its own budget is the
 * turn cap's at most.
 */
export async function executeAgent(campaign: Campaign, video: VideoEntry, opts: { public?: boolean } = {}): Promise<AgentRun> {
  const startedAt = video.agent?.startedAt ?? new Date().toISOString();
  const origin = opts.public ? ("public" as const) : video.agent?.origin;
  // Writes land only on this run: never over a newer one, and an approval given once it finished stays. A visitor's
  // run carries the finished run it set aside (AgentRun.prior) while it works; when it ends without finishing, that
  // run comes back instead of the failure.
  const write = (agent: AgentRun) =>
    updateVideo(campaign.id, video.id, (v) => {
      if (v.agent?.startedAt !== agent.startedAt) return v;
      const prior = v.agent.prior;
      if (agent.status === "failed" && prior) return { ...v, agent: prior };
      const approvedAt = v.agent.recut?.approvedAt;
      const next = approvedAt && agent.recut ? { ...agent, recut: { ...agent.recut, approvedAt } } : agent;
      return { ...v, agent: agent.status === "running" && prior ? { ...next, prior } : next };
    });
  // Step writes go out one at a time, in order; a failed write never blocks the next.
  let queue = Promise.resolve();
  const save = (agent: AgentRun) =>
    (queue = queue
      .catch(() => undefined)
      .then(async () => {
        await write(agent);
      }));
  const finished: { run?: AgentRun; error?: unknown } = {};
  try {
    await withLedgerFile(async (ledgerPath) => {
      const { maxUsdPerRun, maxUsdTotal } = budget();
      const guard = new CostGuard({ maxUsdPerRun: opts.public ? Math.min(maxUsdPerRun, AGENT_MAX_USD) : maxUsdPerRun, maxUsdTotal, ledgerPath });
      finished.run = await runAgent(
        {
          campaign,
          video,
          history: async () => (await listVideos(campaign.id)).filter((v) => sameHandle(v.creator, video.creator)),
          campaignVideos: () => listVideos(campaign.id),
          analyze: async (videoId) => {
            if (opts.public) throw new Error("Re-checking a new upload needs the demo password");
            const start = await startRun(campaign.id, videoId);
            if (!start.ok) throw new Error(start.error);
            // The run shares this function's time: it stops by the deadline counted from when the agent started.
            await executeRun(start.campaign, start.video, { deadlineAt: Date.parse(startedAt) + RUN_DEADLINE_MS });
            return (await getVideo(campaign.id, videoId)) ?? start.video;
          },
        },
        { guard, onStep: save, startedAt, origin, allowAnalyze: !opts.public },
      );
      return finished.run;
    });
  } catch (err) {
    finished.error = err;
  }
  // Failed before the loop (the ledger copy, the guard): nothing ran, so say so, or the video reads "running" until it
  // goes stale. Failed after it (the ledger append): the run finished and its last step saved it, so it stays as it is.
  if (finished.run && finished.error) console.error("The agent's spend could not be added to the ledger", finished.error);
  const err = finished.error;
  const run: AgentRun = finished.run ?? { status: "failed", startedAt, steps: [], usd: 0, error: err instanceof Error ? err.message : String(err), ...(origin ? { origin } : {}) };
  await queue.catch(() => undefined);
  // Not swallowed silently: a final save that fails leaves the report reading "running" until it goes stale.
  await write(run).catch((err: unknown) => console.error(`The agent's final state for ${video.id} could not be saved`, err));
  return run;
}
