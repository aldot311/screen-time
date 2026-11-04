// How long a run may take, shared by the server and the browser (no server imports).

/** The run route's maxDuration: the platform stops a run's function this many seconds after it starts. */
export const RUN_MAX_SECONDS = 300;

/** A run makes no Meta API call past this long after it starts (ms), so the failure write and the ledger append still
 *  happen inside RUN_MAX_SECONDS. */
export const RUN_DEADLINE_MS = (RUN_MAX_SECONDS - 30) * 1000;

/** A "running" entry untouched for longer than this was cut off mid-run (ms): it may be started again, and the screens
 *  show it as stopped. */
export const STALE_MS = (RUN_MAX_SECONDS + 60) * 1000;
