// The site's own test campaigns: the friends' LaCroix campaign (SHOWCASE_CAMPAIGN in showcase.ts) and the sample run's
// campaign (TRY_ID in try.ts). LaCroix is not a party to either, so every page that shows them says so. The ids are
// written out here so this file imports nothing (the request link's consent text reads it, and try.ts imports that);
// demo-note.test.ts fails if they drift apart from those constants.

const DEMO_CAMPAIGNS: ReadonlySet<string> = new Set(["lacroix-strawberry-peach", "try-lacroix"]);

/** Who runs the test campaigns, and so who asks for and receives a creator's Reel there. */
export const DEMO_RUN_BY = "Aetrai";

export const DEMO_NOTE = `A test campaign run by ${DEMO_RUN_BY} with friends, who agreed to be shown. Not affiliated with, sponsored or endorsed by LaCroix or Poppi; their names and cans belong to their owners.`;

export function isDemoCampaign(id: string): boolean {
  return DEMO_CAMPAIGNS.has(id);
}
