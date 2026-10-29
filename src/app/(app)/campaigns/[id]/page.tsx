import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCampaign, listVideos } from "@/lib/campaign/store";
import { STEPS } from "@/lib/campaign/types";
import { AutoRefresh } from "@/components/auto-refresh";
import { framesToSegments, friendlyError, tenths, verdictOf } from "@/components/format";
import { Figure, Swatch } from "@/components/ed/bits";
import { TopBar } from "@/components/ed/top-bar";
import { ExportButton } from "@/components/ed/export-button";
import { CampaignList, type Row } from "@/components/ed/campaign-list";
import { CampaignRail } from "@/components/ed/campaign-rail";
import { CampaignActions } from "@/components/ed/campaign-actions";
import { CampaignBriefCard, CampaignBriefDisclosure } from "@/components/ed/campaign-brief";
import { DISPLAY, LiveDot, plural, shortName } from "@/components/ed/campaign-ui";
import { UploadVideos } from "@/components/ed/upload-videos";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/campaigns/[id]">): Promise<Metadata> {
  const c = await getCampaign((await params).id);
  return { title: c?.name ?? "Campaign" };
}

const floor10 = (s: number) => Math.floor(s * 10 + 1e-6) / 10;

export default async function CampaignPage({ params }: PageProps<"/campaigns/[id]">) {
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) notFound();
  const videos = await listVideos(id);

  // One rule for card titles: the creator handle is the title and the clip is mono metadata. When every video shares
  // one handle, the header says it once and the cards are titled by clip.
  const handles = new Set(videos.map((v) => v.creator));
  const oneHandle = videos.length > 0 && handles.size === 1 ? videos[0].creator : null;

  const rows: Row[] = videos.map((v) => {
    const r = v.report;
    // "clip01.mp4 (synthetic preview)" -> "clip01": the extension is noise and the page already marks preview data.
    const clip = v.title.replace(/\s*\(synthetic preview\)\s*$/i, "").replace(/\.(mp4|mov)$/i, "");
    const waiting = v.status === "uploaded" && Boolean(v.consent);
    return {
      id: v.id,
      campaignId: campaign.id,
      href: `/campaigns/${campaign.id}/videos/${v.id}`,
      title: oneHandle ? clip : v.creator,
      meta: oneHandle ? undefined : clip,
      creator: v.creator,
      thumbUrl: v.thumbUrl,
      verdict: verdictOf(r),
      status: waiting ? "waiting" : v.status,
      stepLabel: STEPS.find((s) => s.id === v.step)?.label,
      error: v.status === "failed" ? friendlyError(v.error) : undefined,
      seconds: r ? r.metrics.secondsOnScreen : null,
      durationSec: r ? r.info.durationSec : null,
      firstSeenSec: r ? r.metrics.firstSeenSec : null,
      passed: r ? r.terms.filter((t) => t.pass === true).length : 0,
      terms: r ? r.terms.length : 0,
      misses: r ? r.terms.filter((t) => t.pass === false).map((t) => ({ term: t.term.text, detail: t.detail || t.term.text })) : [],
      unsure: r ? r.terms.filter((t) => t.pass === null).map((t) => t.term.text) : [],
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
  const waiting = rows.filter((r) => r.status === "waiting").length;
  const stopped = rows.filter((r) => r.status === "failed").length;
  const totalOnScreen = done.reduce((s, r) => s + floor10(r.seconds ?? 0), 0);
  const totalDuration = done.reduce((s, r) => s + (r.durationSec ?? 0), 0);
  const lookalikes = videos.reduce((s, v) => s + (v.report?.tracks.filter((t) => t.verdict !== "match").length ?? 0), 0);
  const csv = `/api/campaigns/${campaign.id}/export.csv`;
  const canUpload = !campaign.synthetic;
  const countLine = oneHandle
    ? `${plural(videos.length, "test video")} from ${oneHandle}`
    : `${plural(videos.length, "video")} from ${plural(handles.size, "creator")}`;

  const rest = [short && `${short} fell short`, review && `${review} need${review === 1 ? "s" : ""} review`].filter(Boolean) as string[];
  const after = [
    running && `${running} still being checked`,
    waiting && `${waiting} waiting for you to run`,
    stopped && `${stopped} stopped`,
  ].filter(Boolean) as string[];

  return (
    <>
      {/* Poll only while something is actually running; creator submissions wait for the brand and never poll. */}
      <AutoRefresh active={running > 0} />
      <TopBar
        back={{ href: "/campaigns", label: "Campaigns" }}
        right={
          <span className="hidden lg:block">
            <ExportButton href={csv} filename={`${campaign.id}.csv`} variant="quiet" className="h-11" />
          </span>
        }
      />
      <main className="mx-auto w-full max-w-[1200px] px-4 pt-5 pb-[calc(env(safe-area-inset-bottom)+96px)] sm:px-6 lg:px-8 lg:pt-10 lg:pb-24">
        <div className="grid gap-x-12 gap-y-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 space-y-5">
            <header>
              <h1 className={`${DISPLAY} text-[38px] leading-[1] sm:text-[56px]`}>{campaign.brand}</h1>
              <p className="mt-1.5 text-[15px] text-(--ink-2)">
                {shortName(campaign)} ·{" "}
                {countLine}
              </p>

              <p className={`${DISPLAY} mt-5 max-w-[24ch] text-[24px] leading-[1.15] font-medium! sm:text-[30px]`}>
                {videos.length === 0 ? (
                  <>No videos yet. Add the first one to see if it delivered.</>
                ) : done.length === 0 ? (
                  <>
                    {running > 0
                      ? `${plural(running, "video")} being checked now.`
                      : waiting > 0
                        ? `${plural(waiting, "video")} waiting for you to run.`
                        : `${plural(stopped, "video")} stopped before a verdict.`}
                  </>
                ) : (
                  <>
                    <span className="ed-num">{delivered}</span> of <span className="ed-num">{done.length}</span> delivered what the
                    contract asked.
                    {rest.length > 0 && <span className="text-(--short)"> {rest.join(", ")}.</span>}
                  </>
                )}
              </p>
              {done.length > 0 && after.length > 0 && <p className="mt-2 text-[15px] text-(--ink-2)">Plus {after.join(", ")}.</p>}

              {done.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[14px] text-(--ink-2)">
                  <span className="flex items-center gap-2">
                    <Swatch kind="signal" />
                    <span>
                      <span className="ed-num text-[18px] text-(--ink)">
                        <Figure value={floor10(totalOnScreen)} />
                      </span>{" "}
                      s on screen of <span className="tabular">{tenths(totalDuration)}</span> s
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    {lookalikes > 0 ? (
                      <Swatch kind="reject" />
                    ) : (
                      <span aria-hidden className="inline-block h-3 w-3.5 shrink-0 rounded-[3px] bg-(--hair-2)" />
                    )}
                    <span>
                      <span className="ed-num text-[18px] text-(--ink)">{lookalikes}</span> look-alike{lookalikes === 1 ? "" : "s"} rejected
                    </span>
                  </span>
                </div>
              )}

              {running > 0 && (
                <p
                  className="mt-4 inline-flex min-h-9 items-center gap-2.5 rounded-full bg-(--card) px-3.5 text-[13.5px] font-medium text-(--ink-2) ring-1 ring-(--hair)"
                  role="status"
                >
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

            <section aria-label="Videos" className="min-w-0">
              {rows.length ? (
                <CampaignList rows={rows} />
              ) : (
                <p className="rounded-(--r-card) bg-(--card) p-6 text-center text-(--ink-2) ring-1 ring-(--hair)">
                  {canUpload ? (
                    <>
                      No videos in this campaign yet.
                      <span className="lg:hidden"> Tap Add videos below.</span>
                    </>
                  ) : (
                    "No videos in this campaign."
                  )}
                </p>
              )}
            </section>
          </div>

          {/* The side column follows the reader down the list, so it never leaves an empty column. */}
          <aside className="min-w-0 space-y-5 lg:sticky lg:top-[calc(env(safe-area-inset-top)+76px)] lg:-m-1 lg:max-h-[calc(100dvh-92px)] lg:self-start lg:overflow-y-auto lg:p-1 lg:[scrollbar-width:thin]">
            <CampaignActions csv={csv} filename={`${campaign.id}.csv`}>
              {canUpload ? <UploadVideos campaignId={campaign.id} mode={process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "direct"} /> : null}
            </CampaignActions>
            <div className="hidden lg:block">
              <CampaignBriefCard campaign={campaign} />
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}
