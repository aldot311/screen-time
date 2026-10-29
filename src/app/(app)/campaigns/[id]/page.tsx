import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Upload } from "lucide-react";
import { getCampaign, listVideos } from "@/lib/campaign/store";
import { STEPS } from "@/lib/campaign/types";
import { AutoRefresh } from "@/components/auto-refresh";
import { framesToSegments, friendlyError, verdictOf } from "@/components/format";
import { Figure, Swatch } from "@/components/ed/bits";
import { TopBar } from "@/components/ed/top-bar";
import { ExportButton } from "@/components/ed/export-button";
import { CampaignList, type Row } from "@/components/ed/campaign-list";
import { CampaignRail } from "@/components/ed/campaign-rail";
import { CampaignBriefCard, CampaignBriefDisclosure } from "@/components/ed/campaign-brief";
import { DISPLAY, LiveDot, plural } from "@/components/ed/campaign-ui";
import { UploadVideos } from "@/components/ed/upload-videos";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/campaigns/[id]">): Promise<Metadata> {
  const c = await getCampaign((await params).id);
  return { title: c?.name ?? "Campaign" };
}

export default async function CampaignPage({ params }: PageProps<"/campaigns/[id]">) {
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) notFound();
  const videos = await listVideos(id);

  // Creators often share one handle (one person filming several clips); then the clip title leads the card.
  const sharedHandle = new Set(videos.map((v) => v.creator)).size < videos.length;
  const rows: Row[] = videos.map((v) => {
    const r = v.report;
    // "clip01.mp4 (synthetic preview)" -> "clip01": the extension is noise and the page already marks preview data.
    const title = v.title.replace(/\s*\(synthetic preview\)\s*$/i, "").replace(/\.(mp4|mov)$/i, "");
    return {
      id: v.id,
      href: `/campaigns/${campaign.id}/videos/${v.id}`,
      primary: sharedHandle ? title : v.creator,
      secondary: sharedHandle ? v.creator : title,
      thumbUrl: v.thumbUrl,
      verdict: verdictOf(r),
      status: v.status,
      stepLabel: STEPS.find((s) => s.id === v.step)?.label,
      error: v.status === "failed" ? friendlyError(v.error) : undefined,
      seconds: r ? r.metrics.secondsOnScreen : null,
      durationSec: r ? r.info.durationSec : null,
      firstSeenSec: r ? r.metrics.firstSeenSec : null,
      passed: r ? r.terms.filter((t) => t.pass === true).length : 0,
      terms: r ? r.terms.length : 0,
      segments: r ? r.metrics.segments : [],
      mentions: r ? r.metrics.mentions : [],
      rejected: r ? framesToSegments((r.detections ?? []).filter((d) => d.verdict !== "match").map((d) => d.frame)) : [],
    };
  });

  const done = rows.filter((r) => r.status === "done");
  const delivered = done.filter((r) => r.verdict === "delivered").length;
  const short = done.filter((r) => r.verdict === "short").length;
  const review = done.filter((r) => r.verdict === "review").length;
  const running = rows.filter((r) => r.status === "running" || r.status === "uploaded").length;
  const stopped = rows.filter((r) => r.status === "failed").length;
  const totalOnScreen = done.reduce((s, r) => s + (r.seconds ?? 0), 0);
  const totalDuration = done.reduce((s, r) => s + (r.durationSec ?? 0), 0);
  const lookalikes = videos.reduce((s, v) => s + (v.report?.tracks.filter((t) => t.verdict !== "match").length ?? 0), 0);
  const csv = `/api/campaigns/${campaign.id}/export.csv`;
  const canUpload = !campaign.synthetic;

  const rest = [
    short && `${short} fell short`,
    review && `${review} need${review === 1 ? "s" : ""} review`,
  ].filter(Boolean) as string[];
  const after = [running && `${running} still being checked`, stopped && `${stopped} stopped`].filter(Boolean) as string[];

  return (
    <>
      <AutoRefresh active={running > 0} />
      <TopBar
        back={{ href: "/campaigns", label: "Campaigns" }}
        right={
          <span className="hidden md:block">
            <ExportButton href={csv} filename={`${campaign.id}.csv`} variant="quiet" className="h-11" />
          </span>
        }
      />
      <main className="mx-auto w-full max-w-[1200px] px-4 pt-5 pb-[96px] sm:px-6 md:pb-24 lg:px-8 lg:pt-10">
        <div className="grid gap-x-12 gap-y-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 space-y-5">
            <header>
              <h1 className={`${DISPLAY} text-[38px] leading-[1] sm:text-[56px]`}>{campaign.brand}</h1>
              <p className="mt-1.5 text-[15px] text-(--ink-2)">
                {campaign.name} · {plural(videos.length, "creator video")}
              </p>

              <p className={`${DISPLAY} mt-5 max-w-[24ch] text-[24px] leading-[1.15] font-medium! sm:text-[30px]`}>
                {videos.length === 0 ? (
                  <>No creator videos yet. Add the first one to see if it delivered.</>
                ) : done.length === 0 ? (
                  <>
                    {running > 0
                      ? `${plural(running, "video")} being checked now.`
                      : `${plural(stopped, "video")} stopped before a verdict.`}
                    {running > 0 && stopped > 0 && <span className="text-(--ink-3)"> {stopped} stopped.</span>}
                  </>
                ) : (
                  <>
                    <span className="ed-num">{delivered}</span> of <span className="ed-num">{done.length}</span> delivered what the
                    contract asked.
                    {rest.length > 0 && <span className="text-(--short)"> {rest.join(", ")}.</span>}
                  </>
                )}
              </p>
              {done.length > 0 && after.length > 0 && <p className="mt-2 text-[15px] text-(--ink-2)">Plus {after.join(" and ")}.</p>}

              {done.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[14px] text-(--ink-2)">
                  <span className="flex items-center gap-2">
                    <Swatch kind="signal" />
                    <span>
                      <span className="ed-num text-[18px] text-(--ink)">
                        <Figure value={totalOnScreen} />
                      </span>{" "}
                      s on screen of <span className="tabular">{totalDuration.toFixed(1)}</span> s
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Swatch kind="reject" />
                    <span>
                      <span className="ed-num text-[18px] text-(--ink)">{lookalikes}</span> look-alike{lookalikes === 1 ? "" : "s"} rejected
                    </span>
                  </span>
                </div>
              )}

              {running > 0 && (
                <p className="mt-4 inline-flex min-h-9 items-center gap-2.5 rounded-full bg-(--card) px-3.5 text-[13.5px] font-medium text-(--ink-2) ring-1 ring-(--hair)" role="status">
                  <LiveDot />
                  Checking {plural(running, "video")}. This page updates by itself.
                </p>
              )}

              {campaign.synthetic && (
                <p className="mt-4 max-w-[70ch] rounded-(--r-inner) bg-(--review-soft) px-3.5 py-2.5 text-[13.5px] leading-snug text-(--review)">
                  <span className="font-semibold">Preview data.</span> These reports come from hand-checked labels run through the
                  real metrics and contract code, so you can see a report before any live model run. New campaigns run the full
                  Meta pipeline.
                </p>
              )}
            </header>

            <CampaignRail rows={rows} />

            <div className="lg:hidden">
              <CampaignBriefDisclosure campaign={campaign} />
            </div>

            <section aria-label="Creators" className="min-w-0">
              {rows.length ? (
                <CampaignList rows={rows} />
              ) : (
                <p className="rounded-(--r-card) bg-(--card) p-6 text-center text-(--ink-2) ring-1 ring-(--hair)">
                  {canUpload ? "No videos in this campaign yet. Add the first one below." : "No videos in this campaign."}
                </p>
              )}
            </section>
          </div>

          <aside className="min-w-0 space-y-5 lg:pt-2">
            {canUpload && <UploadVideos campaignId={campaign.id} mode={process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "direct"} />}
            <div className="hidden lg:block">
              <CampaignBriefCard campaign={campaign} />
            </div>
          </aside>
        </div>
      </main>

      {/* Thumb-reach actions on a phone, sitting on top of the tab bar (58px + safe area). */}
      <div className="ed-glass fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+58px)] z-30 border-t border-(--hair)/70 px-4 py-2.5 md:hidden">
        <div className={`mx-auto grid max-w-[480px] gap-2 ${canUpload ? "grid-cols-2" : ""}`}>
          {canUpload && (
            <a
              href="#add-videos"
              className="ed-press inline-flex h-12 items-center justify-center gap-2 rounded-full bg-(--ink) px-4 text-[15px] font-semibold text-white shadow-(--sh-2) active:bg-black/85"
            >
              <Upload className="size-[18px]" strokeWidth={2.25} aria-hidden />
              Add videos
            </a>
          )}
          <ExportButton href={csv} filename={`${campaign.id}.csv`} variant={canUpload ? "quiet" : "solid"} />
        </div>
      </div>
    </>
  );
}
