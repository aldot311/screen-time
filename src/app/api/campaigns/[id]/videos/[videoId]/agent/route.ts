import { after, type NextRequest } from "next/server";
import { ACCESS_COOKIE, accessError, decideAccess } from "@/lib/access";
import { API_KEY_ENV } from "@/lib/meta/http";
import { PREVIEW_ID } from "@/lib/campaign/preview";
import { TRY_ID } from "@/lib/campaign/try";
import { getCampaign, getVideo, updateVideo } from "@/lib/campaign/store";
import { clientIp, clientKey } from "@/lib/client-ip";
import { executeAgent } from "@/lib/agent/run-agent";
import { agentRunning } from "@/lib/agent/campaign-agent";
import { isPublicAgentTarget } from "@/lib/agent/public";
import { allowPublicAttempt, fromOwnPage, startPublicAgent, type PublicAgentResult } from "@/lib/agent/public-limits";

// The agent runs after the response; re-checking a re-cut inside it needs the same time as a run.
export const maxDuration = 300;

/** Starts the follow-up agent on a finished video (behind the demo password). The video page shows its steps.
 *  On the example reports in lib/agent/public.ts anyone may run it, without the re-check tool and under the limits in
 *  lib/agent/public-limits.ts: { mode: "started" | "joined" | "replay", agent, limit?, reason? }. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; videoId: string }> }) {
  const { id, videoId } = await ctx.params;
  // Checked here as well as in the proxy, so a change there can never open more than the listed reports.
  const decision = await decideAccess(req.cookies.get(ACCESS_COOKIE)?.value);
  const owner = decision === "allow";
  if (!owner && !isPublicAgentTarget(id, videoId)) return accessError(decision);
  if (id === PREVIEW_ID || id === TRY_ID) return Response.json({ error: "Sample and preview reports are shared and read-only" }, { status: 409 });
  let ip = "";
  if (!owner) {
    if (!fromOwnPage(req)) return Response.json({ error: "Start the agent from its report page." }, { status: 403 });
    ip = clientIp(req.headers);
    if (!allowPublicAttempt(clientKey(ip))) return Response.json({ error: "Too many tries. Wait a few minutes and try again." }, { status: 429 });
  }
  if (!process.env[API_KEY_ENV]) return Response.json({ error: "The Meta API key is not configured" }, { status: 503 });
  const campaign = await getCampaign(id);
  const video = campaign ? await getVideo(id, videoId) : null;
  if (!campaign || !video) return Response.json({ error: "Video not found" }, { status: 404 });
  if (video.status !== "done" || !video.report) return Response.json({ error: "The agent follows up on a finished report" }, { status: 409 });

  if (!owner) {
    let result: PublicAgentResult;
    try {
      result = await startPublicAgent(ip, video);
    } catch (e) {
      return Response.json({ error: e instanceof Error ? e.message : "Could not start the agent" }, { status: 500 });
    }
    if (result.mode === "unavailable") return Response.json({ error: result.error }, { status: result.status });
    const started = result.video;
    if (result.mode === "started") after(() => executeAgent(campaign, started, { public: true }));
    return Response.json(
      { mode: result.mode, agent: started.agent, ...(result.mode === "replay" ? { limit: result.limit, reason: result.reason } : {}) },
      { status: result.mode === "started" ? 202 : 200 },
    );
  }

  // Checked inside the atomic update, so two clicks at once start one agent.
  let busy = false;
  const started = await updateVideo(id, videoId, (v) => {
    busy = agentRunning(v.agent);
    return busy ? v : { ...v, agent: { status: "running", startedAt: new Date().toISOString(), steps: [], usd: 0 } };
  });
  if (busy) return Response.json({ error: "The follow-up agent is already working on this video" }, { status: 409 });
  if (!started) return Response.json({ error: "Video not found" }, { status: 404 });
  after(() => executeAgent(campaign, started));
  return Response.json(started.agent, { status: 202 });
}
