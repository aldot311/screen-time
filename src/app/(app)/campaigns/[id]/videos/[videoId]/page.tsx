import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { getCampaign, getVideo } from "@/lib/campaign/store";
import { loadShowcase } from "@/lib/campaign/showcase";
import { AutoRefresh } from "@/components/auto-refresh";
import { friendlyError } from "@/components/format";
import { TopBar } from "@/components/ed/top-bar";
import { ReportClient } from "@/components/ed/report-client";
import { RunStepsEd } from "@/components/ed/run-steps";
import { RunAgain } from "@/components/ed/run-again";

export const dynamic = "force-dynamic";

/** "clip12.mp4 (synthetic preview)" -> "clip12": the clip name leads, the file extension is noise. */
const humanTitle = (title: string) => title.replace(/\s*\(synthetic preview\)$/i, "").replace(/\.(mp4|mov|m4v|webm)$/i, "");

export async function generateMetadata({ params }: PageProps<"/campaigns/[id]/videos/[videoId]">): Promise<Metadata> {
  const { id, videoId } = await params;
  const v = await getVideo(id, videoId);
  return { title: v ? `${humanTitle(v.title)} · ${v.creator}` : "Video" };
}

export default async function VideoPage({ params }: PageProps<"/campaigns/[id]/videos/[videoId]">) {
  const { id, videoId } = await params;
  const [campaign, video, showcase] = await Promise.all([getCampaign(id), getVideo(id, videoId), loadShowcase()]);
  if (!campaign || !video) notFound();
  const running = video.status === "running" || video.status === "uploaded";
  const synthetic = Boolean(video.synthetic ?? campaign.synthetic);
  const title = humanTitle(video.title);

  // Plain names for the tracked objects where the showcase has them; elsewhere the report names them from the brief.
  const names =
    showcase.hero?.video.id === video.id && showcase.hero.video.campaignId === campaign.id
      ? showcase.hero.names
      : showcase.lookalike?.video.id === video.id && showcase.lookalike.video.campaignId === campaign.id
        ? showcase.lookalike.names
        : {};

  return (
    <>
      <AutoRefresh active={running} everyMs={1500} />
      <TopBar back={{ href: `/campaigns/${campaign.id}`, label: campaign.brand }} />
      <main className="mx-auto w-full max-w-[1200px] px-4 pb-[calc(env(safe-area-inset-bottom)+132px)] sm:px-6 sm:pt-6 lg:px-8 lg:pt-8 lg:pb-24">
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
              ) : (
                <p className="inline-flex h-8 items-center gap-1.5 rounded-full bg-(--short) px-3 text-[13px] font-semibold text-white">
                  <TriangleAlert className="size-4" strokeWidth={2.5} aria-hidden />
                  {video.status === "failed" ? "Stopped" : "No report"}
                </p>
              )}
              <h1 id="run-h" className="ed-display mt-4 text-[32px] leading-[1.08] sm:text-[40px]">
                {video.status === "failed"
                  ? "The analysis stopped before it finished."
                  : video.status === "uploaded"
                    ? "Uploaded. The analysis starts in a moment."
                    : video.status === "done"
                      ? "This run finished without a report."
                      : `Screen-Time is watching for ${campaign.brand}.`}
              </h1>
              <p className="mt-3 max-w-[60ch] text-[16px] leading-[1.55] text-(--ink-2)">
                {video.status === "failed" || video.status === "done"
                  ? "Nothing from this video is counted yet. The reason is shown under the step that stopped. Once it is fixed, run it again; the video does not need to be uploaded again."
                  : `Looking for “${campaign.prompt}”, checking each find against ${campaign.productDescription}, then measuring and checking the contract.`}
              </p>

              <div className="mt-6 rounded-(--r-card) bg-(--wash)/60 p-2 ring-1 ring-(--hair)">
                <RunStepsEd status={video.status} step={video.step} error={video.error} />
              </div>

              {video.status === "failed" && !video.step && video.error && (
                <p className="mt-4 max-w-[60ch] rounded-(--r-ctl) bg-(--short-soft) px-4 py-3 text-[14.5px] text-(--short)">{friendlyError(video.error)}</p>
              )}

              {(video.status === "failed" || video.status === "done") &&
                (synthetic ? (
                  <p className="mt-6 text-[14px] text-(--ink-3)">Preview videos cannot be run again: their numbers come from hand-checked labels.</p>
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
