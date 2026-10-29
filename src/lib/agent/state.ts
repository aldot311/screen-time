// Agent run state shared by the server and the browser (no server imports).

/** A run still "running" after this long was cut off by the function's time limit (300 s) and may be started again. */
export const AGENT_STALE_MS = 6 * 60 * 1000;

/** True while an agent run is in progress and not stale. */
export function agentRunning(agent: { status: string; startedAt: string } | undefined, now = Date.now()): boolean {
  return agent?.status === "running" && now - Date.parse(agent.startedAt) < AGENT_STALE_MS;
}
