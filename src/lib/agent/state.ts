// Agent run state shared by the server and the browser (no server imports).

/** A run still "running" after this long was cut off by the function's time limit (300 s) and may be started again. */
export const AGENT_STALE_MS = 6 * 60 * 1000;

export const AGENT_MAX_TURNS = 8;
/** What one Muse Spark turn reserves (as each Spark call in the pipeline). */
export const AGENT_TURN_USD = 0.02;
/** The most one run's own turns can reserve: every turn at its fixed price ($0.16). A re-check of a re-cut is a run
 *  of its own, with its own budget. */
export const AGENT_MAX_USD = Math.round(AGENT_MAX_TURNS * AGENT_TURN_USD * 1e6) / 1e6;

/** True while an agent run is in progress and not stale. */
export function agentRunning(agent: { status: string; startedAt: string } | undefined, now = Date.now()): boolean {
  return agent?.status === "running" && now - Date.parse(agent.startedAt) < AGENT_STALE_MS;
}
