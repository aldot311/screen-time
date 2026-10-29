import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShieldCheck, TriangleAlert } from "lucide-react";
import { getCampaign, getVideo, listCampaigns, listVideos } from "@/lib/campaign/store";
import { loadShowcase } from "@/lib/campaign/showcase";
import { AutoRefresh } from "@/components/auto-refresh";
import { friendlyError, verdictOf } from "@/components/format";
import { TopBar } from "@/components/ed/top-bar";
import { ReportClient } from "@/components/ed/report-client";
import { agentRunning } from "@/lib/agent/campaign-agent";
import { feeFor, latestFinished } from "@/lib/campaign/money";
import { sameHandle } from "@/lib/campaign/roster";
import { VerdictPill } from "@/components/ed/bits";
import { PendingLink } from "@/components/ed/pending-link";

import { TRY_ID, TRY_LIMIT_TEXT, tryLimits } from "@/lib/campaign/try";
import { RunStepsEd } from "@/components/ed/run-steps";
import { RunAgain } from "@/components/ed/run-again";
import { videoPhase } from "@/components/ed/campaign-ui";

export const dynamic = "force-dynamic";

/** "clip12.mp4 (synthetic preview)" -> "clip12": the clip name leads, the file extension is noise. */
const humanTitle = (title: string) => title.replace(/\s*\(synthetic preview\)$/i, "").replace(/\.(mp4|mov|m4v|webm)$/i, "");

export async function generateMetadata({ params }: PageProps<"/campaigns/[id]/videos/[videoId]">): Promise<Metadata> {
  const { id, videoId } = await params;
  const v = await getVideo(id, videoId);
  return { title: v ? `${humanTitle(v.title)} · ${v.creator}` : "Video" };
}

export default async function VideoPage({ params, searchParams }: PageProps<"/campaigns/[id]/videos/[videoId]">) {
  // ?t=12.5 opens the report at that second (links from the accuracy page point at a moment).
  const query = await searchParams;
  const t = Number(query.t);
  // Set by "Try a sample video" when a limit was reached and this is the newest finished sample instead: a code mapped
  // to fixed text, so a link cannot put its own words on a report.
  const { id: routeId } = await params;
  const limitCode = routeId === TRY_ID && (query.limit === "visitor" || query.limit === "day") ? query.limit : null;
  const limits = tryLimits();
  const limit = limitCode ? TRY_LIMIT_TEXT[limitCode](limitCode === "visitor" ? limits.perVisitor : limits.perDay) : null;
  const { id, videoId } = await params;
  const [campaign, video, showcase, all] = await Promise.all([getCampaign(id), getVideo(id, videoId), loadShowcase(), listCampaigns()]);
  if (!campaign || !video) notFound();
  // When a brand has several campaigns, the back link names which one: "Stanley · Live demo".
  const sibling = all.filter((c) => c.brand === campaign.brand).length > 1;
  const short = campaign.name.replace(/^[^:]+:\s*/, "");
  // A name without a "Brand: " prefix, or one that is just the brand, adds nothing after the dot.
  const named = short && short !== campaign.name && short.toLowerCase() !== campaign.brand.toLowerCase();
  const backLabel = sibling && named ? `${campaign.brand} · ${short.charAt(0).toUpperCase()}${short.slice(1)}` : campaign.brand;
  // A creator's link submission waits for the brand to start it; the brand's own upload starts by itself. Only poll
  // while something is actually going to change.
  // eslint-disable-next-line react-hooks/purity -- a server render: "now" is the request time
  const phase = videoPhase(video, Date.now());
  // "waiting": a creator's link upload; "stalled": the brand's own upload whose run never started. Both need Run analysis.
  const waiting = phase === "waiting";
  const stalled = phase === "uploaded";
  const running = phase === "running" || phase === "starting";
  // The follow-up agent writes its steps to the video as it works: refresh while it does.
  const agentWorking = agentRunning(video.agent);
  const synthetic = Boolean(video.synthetic ?? campaign.synthetic);
  const title = humanTitle(video.title);
  // A re-cut from a creator on the roster replaces this video for pay or hold. (A test set's clips from one handle
  // are separate tests, not re-cuts, so they never say this.)
  const onRoster = campaign.creators?.some((c) => sameHandle(c.handle, video.creator)) ?? false;
  const newer = onRoster && video.status === "done" ? latestFinished(await listVideos(id)).get(video.creator.toLowerCase()) : undefined;
  const replacedBy = newer && newer.id !== video.id && newer.createdAt > video.createdAt ? newer : undefined;

  // Plain names for the tracked objects where the showcase has them; elsewhere the report names them from the brief.
  const names =
    showcase.hero?.video.id === video.id && showcase.hero.video.campaignId === campaign.id
      ? showcase.hero.names
      : showcase.lookalike?.video.id === video.id && showcase.lookalike.video.campaignId === campaign.id
        ? showcase.lookalike.names
        : {};

  return (
    <>
      <AutoRefresh active={running || agentWorking} everyMs={1500} />
      <TopBar back={{ href: `/campaigns/${campaign.id}`, label: backLabel }} />
      <main className="mx-auto w-full max-w-[1200px] px-4 pb-[calc(env(safe-area-inset-bottom)+128px)] sm:px-6 sm:pt-6 lg:px-8 lg:pt-8 lg:pb-24">
        {replacedBy && (
          <p role="status" className="mt-3 mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-(--r-inner) bg-(--wash) px-4 py-3 text-[14px] leading-snug text-(--ink-2) sm:mt-0">
            <span>
              <span className="font-semibold text-(--ink)">{video.creator} sent a re-cut.</span> It decides pay or hold now:
            </span>
            <VerdictPill verdict={verdictOf(replacedBy.report)} />
            <PendingLink href={`/campaigns/${id}/videos/${replacedBy.id}`} className="inline-flex min-h-11 items-center font-semibold text-(--ink) underline decoration-(--hair-2) underline-offset-4">
              Open the re-cut
            </PendingLink>
          </p>
        )}
        {limit && (
          <p role="status" className="mt-3 mb-4 rounded-(--r-inner) bg-(--wash) px-4 py-3 text-[14px] leading-snug text-(--ink-2) sm:mt-0">
            <span className="font-semibold text-(--ink)">{limit}</span> This is the newest sample run; tap Replay analysis to watch every step it took.
          </p>
        )}
        {video.status === "done" && video.report ? (
          <ReportClient
            report={video.report}
            videoUrl={video.videoUrl}
            cropUrls={video.cropUrls ?? {}}
            names={names}
            creator={video.creator}
            title={title}
            brand={campaign.brand}
            poster={video.thumbUrl}
            synthetic={synthetic}
            fee={feeFor(campaign, video.creator)}
            startAt={Number.isFinite(t) && t >= 0 ? t : undefined}
            override={video.override}
            overrideEndpoint={synthetic || campaign.id === TRY_ID ? undefined : `/api/campaigns/${campaign.id}/videos/${video.id}/override`}
            agent={video.agent}
            agentEndpoint={synthetic || campaign.id === TRY_ID ? undefined : `/api/campaigns/${campaign.id}/videos/${video.id}/agent`}
            proofHref={synthetic ? undefined : `/api/campaigns/${campaign.id}/videos/${video.id}/proof`}
          />
        ) : (
          <div className="grid gap-x-12 gap-y-8 pt-4 sm:pt-0 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
            <div className="mx-auto w-[min(100%,calc(52svh*0.5625))] lg:sticky lg:top-[76px] lg:w-full lg:self-start">
              <div className="relative aspect-[9/16] w-full overflow-hidden rounded-[18px] bg-(--ink) shadow-(--sh-3)">
                {video.thumbUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- the stored still, blurred into a backdrop only
                  <img src={video.thumbUrl} alt="" aria-hidden className="absolute inset-0 size-full scale-110 object-cover opacity-70 blur-xl" />
                )}
                <video
                  src={video.videoUrl}
                  poster={video.thumbUrl}
                  className="absolute inset-0 size-full object-contain"
                  controls
                  playsInline
                  preload="metadata"
                  aria-label={`${title}, the uploaded video`}
                />
              </div>
              <p className="mt-3 text-center text-[13px] text-(--ink-3)">
                {title} · {video.creator}
              </p>
            </div>

            <section aria-labelledby="run-h" className="min-w-0">
              {running ? (
                <p className="inline-flex h-8 items-center gap-2 rounded-full bg-(--card) px-3 text-[13px] font-semibold text-(--ink-2) shadow-(--sh-1) ring-1 ring-(--hair)">
                  <span className="relative grid size-2.5 place-items-center" aria-hidden>
                    <span className="absolute inset-0 animate-ping rounded-full bg-(--pass)/60 motion-reduce:hidden" />
                    <span className="size-2.5 rounded-full bg-(--pass)" />
                  </span>
                  Live · updates every 1.5 s
                </p>
              ) : stalled ? (
                <p className="inline-flex h-8 items-center gap-1.5 rounded-full bg-(--card) px-3 text-[13px] font-semibold text-(--ink-2) shadow-(--sh-1) ring-1 ring-(--hair)">
                  Uploaded · not started
                </p>
              ) : waiting ? (
                <p className="inline-flex h-8 items-center gap-1.5 rounded-full bg-(--card) px-3 text-[13px] font-semibold text-(--ink-2) shadow-(--sh-1) ring-1 ring-(--hair)">
                  <ShieldCheck className="size-4 text-(--pass)" strokeWidth={2.25} aria-hidden />
                  Consent recorded
                </p>
              ) : (
                <p className="inline-flex h-8 items-center gap-1.5 rounded-full bg-(--short) px-3 text-[13px] font-semibold text-white">
                  <TriangleAlert className="size-4" strokeWidth={2.5} aria-hidden />
                  {video.status === "failed" ? "Stopped" : "No report"}
                </p>
              )}
              <h1 id="run-h" className="ed-display mt-4 text-[32px] leading-[1.08] sm:text-[40px]">
                {video.status === "failed"
                  ? "The analysis stopped before it finished."
                  : waiting
                    ? "Ready to analyze."
                    : stalled
                      ? "Uploaded. The analysis has not started."
                    : video.status === "uploaded"
                      ? "Uploaded. The analysis starts in a moment."
                      : video.status === "done"
                        ? "This run finished without a report."
                        : `Screen-Time is watching for ${campaign.brand}.`}
              </h1>
              <p className="mt-3 max-w-[60ch] text-[16px] leading-[1.55] text-(--ink-2)">
                {waiting && video.consent
                  ? `Sent by ${video.creator} through a request link on ${new Date(video.consent.at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · consent recorded. Start the analysis when you are ready; it takes about a minute.`
                  : stalled
                    ? "The analysis did not start after the upload, so nothing is counted yet. Start it when you are ready; the video does not need to be uploaded again."
                    : video.status === "failed" || video.status === "done"
                    ? "Nothing from this video is counted yet. The reason is shown under the step that stopped. Once it is fixed, run it again; the video does not need to be uploaded again."
                    : `Looking for “${campaign.prompt}”, checking each find against ${campaign.productDescription}, then measuring and checking the contract.`}
              </p>

              <div className="mt-6 rounded-(--r-card) bg-(--wash)/60 p-2 ring-1 ring-(--hair)">
                <RunStepsEd status={video.status} step={video.step} error={video.error} live={video.live} videoUrl={video.videoUrl} brand={campaign.brand} />
              </div>

              {video.status === "failed" && !video.step && video.error && (
                <p className="mt-4 max-w-[60ch] rounded-(--r-ctl) bg-(--short-soft) px-4 py-3 text-[14.5px] text-(--short)">
                  {friendlyError(video.error)}
                </p>
              )}

              {(waiting || stalled) && !synthetic && (
                <div className="mt-6">
                  <RunAgain campaignId={campaign.id} videoId={video.id} first />
                </div>
              )}

              {(video.status === "failed" || video.status === "done") &&
                (synthetic ? (
                  <p className="mt-6 text-[14px] text-(--ink-3)">Preview videos cannot be run again: their numbers come from checked labels.</p>
                ) : (
                  <div className="mt-6">
                    <RunAgain campaignId={campaign.id} videoId={video.id} />
                  </div>
                ))}
            </section>
          </div>
        )}
      </main>
    </>
  );
}
