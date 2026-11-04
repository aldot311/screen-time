// Fences for a visitor's run of the follow-up agent (no demo password, on the example reports in ./public.ts), in the
// pattern of the sample run (lib/campaign/try.ts): a visitor (hashed address) gets a few runs a day, everyone together
// gets a daily cap, and while a run is in progress on a video a new visitor joins it. Past a limit, the brand's run
// (VideoEntry.agent) is shown instead. A visitor's run is stored beside it (VideoEntry.visitorAgent), never over it.
// Each run's own budget is capped at the turn cap (run-agent.ts), so a day costs at most perDay x AGENT_MAX_USD,
// inside the total budget cap every run shares.
import { linkSecret } from "@/lib/campaign/requests";
import { usdFromEnv } from "@/lib/campaign/runner";
import { createDoc, readDoc, takeSlot, updateVideo } from "@/lib/campaign/store";
import type { VideoEntry } from "@/lib/campaign/types";
import { clientKey } from "@/lib/client-ip";
import { agentRunning } from "./state";
import { PUBLIC_AGENT_LIMIT_TEXT, type PublicAgentLimit } from "./public";

export const publicAgentLimits = (env: Record<string, string | undefined> = process.env) => ({
  perVisitor: Math.floor(usdFromEnv(env.SCREEN_TIME_AGENT_PER_VISITOR, 3)),
  perDay: Math.floor(usdFromEnv(env.SCREEN_TIME_AGENT_PER_DAY, 20)),
});

export type PublicAgentResult =
  | { mode: "started" | "joined"; video: VideoEntry }
  | { mode: "replay"; video: VideoEntry; limit: PublicAgentLimit; reason: string }
  | { mode: "unavailable"; status: number; error: string };

async function visitorKey(ip: string): Promise<string> {
  const salt = linkSecret() ?? "screen-time-agent";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`agent-v1:${salt}:${clientKey(ip)}`));
  return Buffer.from(digest).toString("hex").slice(0, 24);
}

/**
 * Starts a visitor's run on `video` (a finished report), or says which run to show instead. The caller runs the agent
 * when the mode is "started"; the entry is stored "running" here, inside one atomic update.
 */
export async function startPublicAgent(ip: string, video: VideoEntry, now = new Date()): Promise<PublicAgentResult> {
  if (agentRunning(video.visitorAgent, now.getTime())) return { mode: "joined", video };
  const limits = publicAgentLimits();
  // A visitor's run from before visitorAgent (stored in agent, with the finished run it set aside in prior) that died
  // (stale "running") gives that run back before anything else.
  if (video.agent?.status === "running" && video.agent.prior) {
    const prior = video.agent.prior;
    video = (await updateVideo(video.campaignId, video.id, (v) => (v.agent?.status === "running" && !agentRunning(v.agent, now.getTime()) && v.agent.prior ? { ...v, agent: prior } : v))) ?? video;
  }
  const replay = (limit: PublicAgentLimit): PublicAgentResult => {
    const reason = PUBLIC_AGENT_LIMIT_TEXT[limit](limit === "visitor" ? limits.perVisitor : limits.perDay);
    return video.agent?.status === "done"
      ? { mode: "replay", video, limit, reason }
      : { mode: "unavailable", status: 429, error: `${reason} Try again tomorrow, or enter the demo password to run it.` };
  };
  const day = now.toISOString().slice(0, 10);
  // Once the day is full, one read answers every later request: no slot writes to spam.
  if (await readDoc(`agent-public/${day}/full.json`)) return replay("day");
  if (!(await takeSlot(`agent-public/${day}/visitor-${await visitorKey(ip)}`, limits.perVisitor))) return replay("visitor");
  if (!(await takeSlot(`agent-public/${day}/run`, limits.perDay))) {
    await createDoc(`agent-public/${day}/full.json`, { at: now.toISOString() });
    return replay("day");
  }
  // Checked inside the atomic update, so two visitors arriving together start one run and the other joins it. A
  // visitor's run goes in its own field: the brand's run (agent) stays what everyone else sees.
  let busy = false;
  const started = await updateVideo(video.campaignId, video.id, (v) => {
    busy = agentRunning(v.visitorAgent);
    return busy ? v : { ...v, visitorAgent: { status: "running", startedAt: now.toISOString(), steps: [], usd: 0, origin: "public" } };
  });
  if (!started) return { mode: "unavailable", status: 404, error: "Video not found" };
  return { mode: busy ? "joined" : "started", video: started };
}

/** True when a visitor's request comes from this site's own page: browsers send Sec-Fetch-Site, or at least Origin,
 *  with a fetch POST. A script can send any header, so this only stops other sites from spending the limits through
 *  their own visitors' browsers; the daily cap bounds the rest. */
export function fromOwnPage(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host);
  } catch {
    return false;
  }
}

// Best effort, per server instance, in front of the store: a visitor's first few requests in ten minutes reach it, the
// rest stop here. Serverless instances do not share this memory; the stored slots above are the real limits.
const THROTTLE_MS = 10 * 60_000;
const THROTTLE_MAX = 6;
const MAX_TRACKED = 5_000;
const recent = new Map<string, number[]>();

export function allowPublicAttempt(key: string, now = Date.now()): boolean {
  for (const [k, ts] of recent) if (ts.every((t) => now - t >= THROTTLE_MS)) recent.delete(k);
  const mine = (recent.get(key) ?? []).filter((t) => now - t < THROTTLE_MS);
  if (mine.length >= THROTTLE_MAX) return false;
  if (!recent.has(key) && recent.size >= MAX_TRACKED) recent.delete(recent.keys().next().value!); // evict oldest
  recent.delete(key); // re-insert so map order stays oldest-first
  recent.set(key, [...mine, now]);
  return true;
}
