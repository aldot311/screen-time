import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Info } from "lucide-react";
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
import { creatorEntry, DISPLAY, LiveDot, plural, shortName, videoPhase } from "@/components/ed/campaign-ui";
import { UploadVideos } from "@/components/ed/upload-videos";
import { CampaignCover } from "@/components/ed/product-photo";
import { CampaignCreators } from "@/components/ed/campaign-creators";
import { FeeEditor } from "@/components/ed/fee-editor";
import { feeFor, payout, payoutLine } from "@/lib/campaign/money";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/campaigns/[id]">): Promise<Metadata> {
  const c = await getCampaign((await params).id);
  return { title: c?.name ?? "Campaign" };
}

const floor10 = (s: number) => Math.floor(s * 10 + 1e-6) / 10;

export default async function CampaignPage({ params, searchParams }: PageProps<"/campaigns/[id]">) {
  const { id } = await params;
  const photoFailed = (await searchParams).photo === "failed";
  const campaign = await getCampaign(id);
  if (!campaign) notFound();
  const videos = await listVideos(id);
  // eslint-disable-next-line react-hooks/purity -- a server render: "now" is the request time, for link expiry and run starts
  const now = Date.now();

  // One rule for card titles: the creator handle is the title and the clip is mono metadata. When every video shares
  // one handle, the header says it once and the cards are titled by clip.
  const handles = new Set(videos.map((v) => v.creator));
  const oneHandle = videos.length > 0 && handles.size === 1 ? videos[0].creator : null;

  const rows: Row[] = videos.map((v) => {
    const r = v.report;
    // "clip01.mp4 (synthetic preview)" -> "clip01": the extension is noise and the page already marks preview data.
    const clip = v.title.replace(/\s*\(synthetic preview\)\s*$/i, "").replace(/\.(mp4|mov)$/i, "");
    const phase = videoPhase(v, now);
    return {
      id: v.id,
      campaignId: campaign.id,
      href: `/campaigns/${campaign.id}/videos/${v.id}`,
      title: oneHandle ? clip : v.creator,
      meta: oneHandle ? undefined : clip,
      creator: v.creator,
      thumbUrl: v.thumbUrl,
      verdict: verdictOf(r),
      status: phase,
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
      fee: feeFor(campaign, v.creator),
    };
  });

  const done = rows.filter((r) => r.status === "done");
  const delivered = done.filter((r) => r.verdict === "delivered").length;
  const short = done.filter((r) => r.verdict === "short").length;
  const review = done.filter((r) => r.verdict === "review").length;
  const running = rows.filter((r) => r.status === "running" || r.status === "starting").length;
  const waiting = rows.filter((r) => r.status === "waiting" || r.status === "uploaded").length;
  const stopped = rows.filter((r) => r.status === "failed").length;
  // Exact per-video values summed once, floored only for display (the campaign list does the same).
  const totalOnScreen = done.reduce((s, r) => s + (r.seconds ?? 0), 0);
  const totalDuration = done.reduce((s, r) => s + (r.durationSec ?? 0), 0);
  const lookalikes = videos.reduce((s, v) => s + (v.report?.tracks.filter((t) => t.verdict !== "match").length ?? 0), 0);
  const csv = `/api/campaigns/${campaign.id}/export.csv`;
  const canUpload = !campaign.synthetic;
  const countLine = oneHandle
    ? `${plural(videos.length, "test video")} from ${oneHandle}`
    : `${plural(videos.length, "video")} from ${plural(handles.size, "creator")}`;

  // Name the dominant failure when there is one: which kind of term the misses have in common.
  const said = `“${campaign.brandTerms[0] ?? campaign.brand}”`;
  const shortVideos = videos.filter((v) => v.status === "done" && verdictOf(v.report) === "short");
  const kinds = shortVideos.map((v) => {
    const failed = (v.report?.terms ?? []).filter((t) => t.pass === false);
    const voice = failed.filter((t) => t.term.rule?.kind === "mentioned");
    return {
      voice: voice.length > 0,
      silent: voice.some((t) => /\b0 times\b/.test(t.detail)),
      screen: failed.some((t) => t.term.rule && t.term.rule.kind !== "mentioned" && t.term.rule.kind !== "disclosed"),
    };
  });
  const nVoice = kinds.filter((k) => k.voice).length;
  const nScreen = kinds.filter((k) => k.screen).length;
  const allSilent = kinds.every((k) => !k.voice || k.silent);
  const voicePhrase = allSilent ? `never said ${said}` : `did not say ${said} enough`;
  let missLine: string | null = null;
  if (short > 0) {
    const all = (n: number) => (short === 1 ? "The miss" : n === short ? `All ${short} misses` : `${n} of the ${short} misses`);
    if (nVoice >= nScreen && nVoice * 2 > short)
      missLine = `${all(nVoice)} ${voicePhrase}${nVoice === short && nScreen ? `; ${nScreen} were also short on screen time` : ""}.`;
    else if (nScreen * 2 > short)
      missLine = `${all(nScreen)} fell short on screen time${nScreen === short && nVoice ? `; ${nVoice} also ${voicePhrase}` : ""}.`;
    else missLine = `${short} fell short.`;
  }
  const reviewLine = review ? `${review} need${review === 1 ? "s" : ""} review.` : null;
  const creators = (campaign.creators ?? []).map((c) => ({
    ...creatorEntry(c, videos, campaign.id, now),
    fee: feeFor(campaign, c.handle),
    feeInherited: c.fee === undefined,
  }));
  // Money is per creator (their latest finished video). A test set (several clips from one handle, no roster) has no
  // creators to pay, so it says nothing rather than "Pay 1 creator"; each card still shows what its verdict pays or holds.
  const testSet = oneHandle !== null && videos.length > 1 && !campaign.creators?.length;
  const money = testSet ? null : payoutLine(payout(campaign, videos));
  const mode = process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "direct";
  const creatorsSection =
    canUpload || creators.length > 0 ? <CampaignCreators campaignId={campaign.id} entries={creators} editable={canUpload} /> : null;
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
              <CampaignCover
                campaignId={campaign.id}
                brand={campaign.brand}
                url={campaign.productImageUrl}
                mode={mode}
                editable={canUpload}
                failedOnCreate={photoFailed}
              >
                <h1 className={`${DISPLAY} text-[38px] leading-[1] break-words sm:text-[56px]`}>{campaign.brand}</h1>
                <p className="mt-1.5 text-[15px] text-(--ink-2)">
                  {shortName(campaign)} · {countLine}
                </p>
              </CampaignCover>

              {(canUpload || campaign.fee !== undefined) && (
                <div className="mt-3 flex min-h-11 flex-wrap items-center gap-x-1 text-[14px] text-(--ink-2)">
                  <span>Fee per video</span>
                  <FeeEditor endpoint={`/api/campaigns/${campaign.id}`} fee={campaign.fee ?? null} label="Campaign fee per video" editable={canUpload} />
                  {canUpload && <span className="hidden text-[13px] text-(--ink-3) sm:inline">· a creator&rsquo;s own fee overrides it</span>}
                </div>
              )}

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
                    <span className="ed-num">{delivered}</span> of <span className="ed-num">{videos.length}</span> delivered what the
                    contract asked.
                    {missLine && <span className="text-(--short)"> {missLine}</span>}
                    {reviewLine && <span className="text-(--review)"> {reviewLine}</span>}
                  </>
                )}
              </p>
              {money && (
                <p className="mt-2 text-[17px] leading-snug font-semibold text-(--ink) tabular" aria-label={`Money: ${money}`}>
                  {money}
                </p>
              )}
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
                <p className="mt-4 flex max-w-[70ch] gap-2.5 rounded-(--r-inner) bg-(--paper) px-3.5 py-2.5 text-[13.5px] leading-snug text-(--ink-2) ring-1 ring-(--hair-2)">
                  <Info className="mt-px size-[17px] shrink-0 text-(--ink)" strokeWidth={2.25} aria-hidden />
                  <span>
                  <span className="font-semibold text-(--ink)">Preview data.</span> These reports come from hand-checked labels run through the
                  real metrics and contract code, so you can see a report before any live model run. New campaigns run the full
                  Meta pipeline.
                  </span>
                </p>
              )}
            </header>

            <CampaignRail rows={rows} />

            <div className="lg:hidden">
              <CampaignBriefDisclosure campaign={campaign} />
            </div>

            {videos.length === 0 && creatorsSection}

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

            {videos.length > 0 && <div className="pt-4">{creatorsSection}</div>}
          </div>

          {/* The side column follows the reader down the list, so it never leaves an empty column. */}
          <aside className="min-w-0 space-y-5 lg:sticky lg:top-[calc(env(safe-area-inset-top)+76px)] lg:-m-1 lg:max-h-[calc(100dvh-92px)] lg:self-start lg:overflow-y-auto lg:p-1 lg:[scrollbar-width:thin]">
            <CampaignActions csv={csv} filename={`${campaign.id}.csv`}>
              {canUpload ? <UploadVideos campaignId={campaign.id} mode={mode} /> : null}
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
