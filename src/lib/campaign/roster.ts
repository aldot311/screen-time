// The creators a campaign expects videos from, and the request links sent to them. Only a link's one-time id and
// dates are recorded: the campaign JSON sits in a public store, and the link itself is the creator's upload credential.
import { createRequestToken, newNonce, REQUEST_TTL_DAYS } from "./requests";
import type { Campaign, CampaignCreator, VideoEntry } from "./types";

/** Handles compare case-insensitively: "@Maya" and "@maya" are one creator. */
export const sameHandle = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Appends the handles not already on the roster (nor repeated in `handles`), keeping the first spelling seen. */
export function addCreators(campaign: Campaign, handles: string[], now = new Date()): Campaign {
  const creators = [...(campaign.creators ?? [])];
  for (const handle of handles) {
    if (!creators.some((c) => sameHandle(c.handle, handle))) creators.push({ handle, addedAt: now.toISOString() });
  }
  return { ...campaign, creators };
}

export function removeCreator(campaign: Campaign, handle: string): Campaign {
  return { ...campaign, creators: (campaign.creators ?? []).filter((c) => !sameHandle(c.handle, handle)) };
}

/** Records the latest request sent to a creator, adding them to the roster if they are not on it. */
export function recordRequest(campaign: Campaign, handle: string, request: NonNullable<CampaignCreator["request"]>, now = new Date()): Campaign {
  const withCreator = addCreators(campaign, [handle], now);
  return {
    ...withCreator,
    creators: withCreator.creators!.map((c) => (sameHandle(c.handle, handle) ? { ...c, request } : c)),
  };
}

/** Roster creators who have not sent a video yet (videos match by handle). */
export function creatorsWithoutVideo(campaign: Campaign, videos: VideoEntry[]): string[] {
  return (campaign.creators ?? []).filter((c) => !videos.some((v) => sameHandle(v.creator, c.handle))).map((c) => c.handle);
}

export interface IssuedRequest {
  creator: string;
  /** "/submit/<token>": shown once, never stored. */
  path: string;
  expiresAt: string;
  /** What the roster records instead of the link. */
  record: NonNullable<CampaignCreator["request"]>;
}

/** A signed, expiring, one-video link for one creator. */
export async function issueRequest(campaignId: string, creator: string, secret: string, now = new Date()): Promise<IssuedRequest> {
  const exp = Math.floor(now.getTime() / 1000) + REQUEST_TTL_DAYS * 86400;
  const nonce = newNonce();
  const token = await createRequestToken({ campaignId, creator, exp, nonce }, secret);
  const expiresAt = new Date(exp * 1000).toISOString();
  return { creator, path: `/submit/${token}`, expiresAt, record: { nonce, sentAt: now.toISOString(), expiresAt } };
}
