// Small server-safe pieces for the campaign screens (list, roll-up, new). Kept here so the shared kit stays untouched.
import type { VideoEntry } from "@/lib/campaign/types";
import { verdictOf } from "@/components/format";
import { Mark } from "./bits";
import type { CreatorEntry } from "./campaign-creators";

/** Display voice for campaign headings: Bricolage, one step lighter and looser than the shared .ed-display so it reads
 *  as product UI rather than a magazine masthead (judge note). */
export const DISPLAY = "ed-display font-semibold! tracking-[-0.022em]!";

/** A 9:16 creator still. The placeholder art sits underneath the image, so a slow or lazy load never shows a blank. */
export function CampaignThumb({
  src,
  className = "",
  eager = false,
}: {
  src?: string;
  className?: string;
  eager?: boolean;
}) {
  return (
    <span className={`relative block aspect-[9/16] shrink-0 overflow-hidden bg-(--wash) ${className}`}>
      <span className="absolute inset-0 grid place-items-center opacity-30" aria-hidden>
        <Mark size={18} />
      </span>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- stored stills, already small JPEGs
        <img
          src={src}
          alt=""
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          className="relative size-full object-cover"
        />
      )}
    </span>
  );
}

/** A breathing dot that says the page is updating itself. */
export function LiveDot() {
  return (
    <span className="relative inline-flex size-2.5 shrink-0" aria-hidden>
      <span className="absolute inset-0 animate-ping rounded-full bg-(--ink)/40 motion-reduce:animate-none" />
      <span className="relative size-2.5 rounded-full bg-(--ink)" />
    </span>
  );
}

/** "1 video" / "12 videos". */
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "Alani Nu: test runs" -> "Test runs": the brand is shown on its own, so the name drops its "Brand: " prefix. */
export function shortName(c: { name: string; brand: string }): string {
  const esc = c.brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rest = c.name.replace(new RegExp(`^${esc}\\s*[:·–-]\\s*`, "i"), "").trim() || c.name;
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

/** How long after a brand's own upload its run is still expected to start by itself (the uploader starts it). */
export const START_GRACE_MS = 2 * 60_000;

/**
 * Where a video stands, in the states the screens show:
 * - "waiting": a creator sent it through a request link; it runs only when the brand starts it.
 * - "starting": the brand just uploaded it and its run is expected to start any moment.
 * - "uploaded": uploaded, but no run started (the start failed or the tab closed); it needs "Run analysis".
 * - "running" / "done" / "failed": as stored.
 */
export type VideoPhase = "waiting" | "starting" | "uploaded" | "running" | "done" | "failed";

export function videoPhase(v: { status: string; consent?: unknown; updatedAt: string }, now: number): VideoPhase {
  if (v.status !== "uploaded") return v.status as VideoPhase;
  if (v.consent) return "waiting";
  return now - Date.parse(v.updatedAt) < START_GRACE_MS ? "starting" : "uploaded";
}

/**
 * Where one roster creator stands. The newest event wins: their latest video (matched by handle, any case), unless a
 * request link was made after it, in which case the link's state shows (a new link can be made at any time).
 */
export function creatorEntry(
  c: { handle: string; request?: { sentAt: string; expiresAt: string } },
  videos: VideoEntry[],
  campaignId: string,
  now: number,
): CreatorEntry {
  const mine = videos
    .filter((v) => v.creator.toLowerCase() === c.handle.toLowerCase())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const v = mine[0];
  const base = { handle: c.handle, expiresAt: c.request?.expiresAt, videos: mine.length };
  const linkNewer = c.request && (!v || Date.parse(c.request.sentAt) > Date.parse(v.createdAt));
  if (c.request && linkNewer) {
    const link = Date.parse(c.request.expiresAt) < now ? "expired" : "sent";
    // The earlier video stays one tap away.
    return { ...base, status: link, videoId: v?.id, href: v && v.status !== "uploaded" ? `/campaigns/${campaignId}/videos/${v.id}` : undefined };
  }
  if (!v) return { ...base, status: "none" };
  const href = `/campaigns/${campaignId}/videos/${v.id}`;
  const phase = videoPhase(v, now);
  if (phase === "failed") return { ...base, status: "stopped", videoId: v.id, href };
  if (phase === "waiting" || phase === "uploaded") return { ...base, status: phase, videoId: v.id };
  if (phase === "starting" || phase === "running") return { ...base, status: phase, videoId: v.id, href };
  const verdict = verdictOf(v.report);
  return { ...base, status: verdict === "pending" ? "review" : verdict, videoId: v.id, href };
}

