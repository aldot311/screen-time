import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCampaign, getVideo } from "@/lib/campaign/store";
import { AutoRefresh } from "@/components/auto-refresh";
import { ReportView } from "@/components/report-view";
import { RunSteps } from "@/components/run-steps";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/campaigns/[id]/videos/[videoId]">): Promise<Metadata> {
  const { id, videoId } = await params;
  const v = await getVideo(id, videoId);
  return { title: v ? `${v.creator} · ${v.title}` : "Video" };
}

export default async function VideoPage({ params }: PageProps<"/campaigns/[id]/videos/[videoId]">) {
  const { id, videoId } = await params;
  const [campaign, video] = await Promise.all([getCampaign(id), getVideo(id, videoId)]);
  if (!campaign || !video) notFound();
  const running = video.status === "running" || video.status === "uploaded";

  return (
    <>
      <AutoRefresh active={running} everyMs={1500} />
      <nav className="text-[13px] text-ink-3">
        <Link href="/campaigns" className="hover:text-ink hover:underline">
          Campaigns
        </Link>{" "}
        /{" "}
        <Link href={`/campaigns/${campaign.id}`} className="hover:text-ink hover:underline">
          {campaign.brand}
        </Link>{" "}
        / {video.creator}
      </nav>
      <h1 className="mt-2 text-[22px] font-semibold tracking-[-0.015em]">
        {video.creator} <span className="font-normal text-ink-3">· {video.title}</span>
      </h1>

      <div className="mt-6">
        {video.report && video.status === "done" ? (
          <ReportView report={video.report} videoUrl={video.videoUrl} creator={video.creator} synthetic={video.synthetic ?? campaign.synthetic} />
        ) : (
          <div className="grid gap-10 lg:grid-cols-[minmax(280px,360px)_1fr]">
            <div className="relative aspect-[9/16] w-full overflow-hidden rounded-[10px] bg-ink shadow-2">
              <video src={video.videoUrl} className="absolute inset-0 size-full object-contain" controls playsInline preload="metadata" />
            </div>
            <section aria-label="Analysis progress">
              <h2 className="text-[15px] font-semibold">
                {video.status === "failed" ? "The analysis stopped" : "Screen-Time is analysing this video"}
              </h2>
              <p className="mt-1 mb-5 max-w-[60ch] text-ink-2">
                {video.status === "failed"
                  ? "Nothing from a failed step is counted. Fix the problem below and run it again."
                  : `Looking for “${campaign.prompt}”, checking each find against ${campaign.productDescription}, then measuring and checking the contract.`}
              </p>
              <RunSteps status={video.status} step={video.step} error={video.error} />
            </section>
          </div>
        )}
      </div>
    </>
  );
}
