// The follow-up agent without the demo password, on the pre-made example reports only. Shared by the proxy, the
// routes, the video page and the panel, so it imports nothing from the server. A code list of exact (campaign, video)
// pairs rather than a campaign flag: a video uploaded into the LaCroix campaign later (the live demo's) never becomes
// public by accident. The approve route is never open: approving mints a real upload link for the creator.

export const PUBLIC_AGENT: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["lacroix-strawberry-peach", new Set(["ash", "ash-recut", "george", "peter", "aldo", "aldo-2", "michael", "jamal", "lana", "jon"])],
]);

/** The report pointed at for trying the agent: Peter's Reel, held for no disclosure, where it drafts a note and a re-cut. */
export const PUBLIC_AGENT_DEMO = { campaignId: "lacroix-strawberry-peach", videoId: "peter" } as const;

/** "owner": unlocked with the demo password. "public": a visitor on a listed example report. "locked": anyone else. */
export type AgentAccess = "owner" | "public" | "locked";

/** The run a report shows: the brand's own run, except to the visitor whose run the address names (?run=). */
export function shownAgent<R extends { startedAt: string }>(video: { agent?: R; visitorAgent?: R }, access: AgentAccess, run: unknown): R | undefined {
  const mine = access !== "owner" && typeof run === "string" && video.visitorAgent?.startedAt === run ? video.visitorAgent : undefined;
  return mine ?? video.agent;
}

export function isPublicAgentTarget(campaignId: string, videoId: string): boolean {
  return PUBLIC_AGENT.get(campaignId)?.has(videoId) ?? false;
}

// Anchored, and the ids' own alphabet (store.ts ID_RE): no trailing slash, no encoded or upper-case variant, and never
// /agent/approve.
const AGENT_PATH = /^\/api\/campaigns\/([a-z0-9-]+)\/videos\/([a-z0-9-]+)\/agent$/;

/** True only for the agent route of a listed example report, exactly as written. */
export function isPublicAgentPath(pathname: string): boolean {
  const m = AGENT_PATH.exec(pathname);
  return m !== null && isPublicAgentTarget(m[1], m[2]);
}

/** Which limit sent a visitor to the brand's run instead of a run of their own. Responses carry this code and text
 *  built from it. */
export type PublicAgentLimit = "visitor" | "day" | "budget";

export const PUBLIC_AGENT_LIMIT_TEXT: Record<PublicAgentLimit, (n: number) => string> = {
  visitor: (n) => `You have run the agent ${n} times today.`,
  day: (n) => `Today's ${n} visitor runs of the agent are used up.`,
  budget: () => "The free agent runs for this demo are used up.",
};
