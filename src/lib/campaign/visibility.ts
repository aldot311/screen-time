// Campaigns kept in the store but hidden from the site: the builder's own test footage (his face is in it), the stock
// clips, the old Alani Nu sample and the synthetic preview. The store answers "not found" for these ids, so no page,
// share image, proof clip or API read shows them. Their files were deleted from the live store on 2026-11-03; the list
// stays so a copy restored from an old backup is still hidden. The accuracy numbers (measured from data/out and
// data/labels) do not depend on them.
//
// Scripts that rebuild or back up the old campaigns set SCREEN_TIME_SHOW_ARCHIVED=1 to read them again.

export const ARCHIVED: ReadonlySet<string> = new Set([
  "alani-nu-test-runs",
  "alani-nu-launch",
  "try-a-sample",
  "stanley-test-runs",
  "new-balance-test-runs",
  "blue-can-test-runs",
  "canvas-sneakers-test-runs",
  "coffee-cup-test-runs",
  "singaraja-test-runs",
  "water-bottle-test-runs",
  "stanley-live-demo",
  "preview",
]);

/** True for a campaign id on the archived list, whether or not this process may read it. */
export const isArchived = (id: string) => ARCHIVED.has(id);

/** True when this process reads archived campaigns too (scripts only; never set on the deployed site). */
export const showArchived = (env: Record<string, string | undefined> = process.env) => env.SCREEN_TIME_SHOW_ARCHIVED === "1";

/** True when the store should answer "not found" for this campaign id. */
export const isHidden = (id: string, env: Record<string, string | undefined> = process.env) => isArchived(id) && !showArchived(env);
