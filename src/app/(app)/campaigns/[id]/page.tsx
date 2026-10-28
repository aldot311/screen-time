import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { getCampaign, listVideos } from "@/lib/campaign/store";
import { STEPS } from "@/lib/campaign/types";
import { AutoRefresh } from "@/components/auto-refresh";
import { ScreenTimeStrip } from "@/components/screen-time-strip";
import { UploadVideos } from "@/components/upload-videos";
import { VerdictBadge } from "@/components/verdict-badge";
import { seconds, termCounts, timecode, verdictOf } from "@/components/format";

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
  const reports = videos.map((v) => v.report).filter((r) => r !== undefined);
  const totalOnScreen = reports.reduce((s, r) => s + r.metrics.secondsOnScreen, 0);
  const verdicts = videos.map((v) => verdictOf(v.report));
  const running = videos.some((v) => v.status === "running" || v.status === "uploaded");

  return (
    <>
      <AutoRefresh active={running} />
      <nav className="text-[13px] text-ink-3">
        <Link href="/campaigns" className="hover:text-ink hover:underline">
          Campaigns
        </Link>{" "}
        / {campaign.brand}
      </nav>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold tracking-[-0.015em]">{campaign.name}</h1>
          <p className="mt-1 max-w-[70ch] text-ink-2">
            Tracking <span className="font-medium text-ink">&ldquo;{campaign.prompt}&rdquo;</span>, counted only when it is{" "}
            {campaign.productDescription}.
            {campaign.brandTerms.length > 0 && <> Listening for {campaign.brandTerms.map((t) => `“${t}”`).join(", ")}.</>}
          </p>
        </div>
        <a
          href={`/api/campaigns/${campaign.id}/export.csv`}
          className="inline-flex items-center gap-1.5 rounded-[8px] border border-line bg-surface px-3 py-2 font-medium shadow-1 hover:border-line-strong"
        >
          <Download className="size-4" aria-hidden /> Export CSV
        </a>
      </div>

      {campaign.synthetic && (
        <p className="mt-4 max-w-[80ch] rounded-[8px] bg-unsure-soft px-3 py-2 text-[13px] text-unsure">
          Preview data: these reports are built from hand-checked labels run through the real metrics and contract
          code, so you can see the report before any live model run. New campaigns run the full Meta pipeline.
        </p>
      )}

      <div className="mt-6 grid gap-x-10 gap-y-6 lg:grid-cols-[1fr_320px]">
        <section aria-label="Creators" className="min-w-0">
          <ul className="divide-y divide-line rounded-[10px] border border-line bg-surface shadow-1 sm:hidden">
            {videos.map((v, i) => {
              const r = v.report;
              return (
                <li key={v.id}>
                  <Link href={`/campaigns/${campaign.id}/videos/${v.id}`} className="block px-4 py-3">
                    <span className="flex items-center justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{v.creator}</span>
                        <span className="block truncate text-[12px] text-ink-3">{v.title}</span>
                      </span>
                      {v.status === "failed" ? (
                        <span className="text-[12px] font-medium text-fail">Failed</span>
                      ) : v.status === "running" || v.status === "uploaded" ? (
                        <span className="text-[12px] text-ink-3">
                          {v.status === "running" ? `${STEPS.find((s) => s.id === v.step)?.label ?? "Starting"}…` : "Waiting to start"}
                        </span>
                      ) : (
                        <VerdictBadge verdict={verdicts[i]} />
                      )}
                    </span>
                    {r && (
                      <span className="mt-2 flex items-center gap-3">
                        <ScreenTimeStrip durationSec={r.info.durationSec} segments={r.metrics.segments} mentions={r.metrics.mentions} size="mini" />
                        <span className="shrink-0 text-[12px] text-ink-2 tabular">{seconds(r.metrics.secondsOnScreen)}</span>
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
            {!videos.length && <li className="px-4 py-8 text-center text-ink-2">No videos yet.</li>}
          </ul>
          <div className="hidden overflow-x-auto rounded-[10px] border border-line bg-surface shadow-1 sm:block">
            <table className="w-full min-w-[760px] text-left">
              <thead className="border-b border-line text-[12px] text-ink-3">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Creator</th>
                  <th className="w-[34%] px-4 py-2.5 font-medium">Product on screen</th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium">Seconds</th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium">First seen</th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium">Terms met</th>
                  <th className="px-4 py-2.5 font-medium">Verdict</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {videos.map((v, i) => {
                  const r = v.report;
                  const counts = r ? termCounts(r.terms) : null;
                  const href = `/campaigns/${campaign.id}/videos/${v.id}`;
                  return (
                    <tr key={v.id} className="group hover:bg-sunken/50">
                      <td className="px-4 py-3">
                        <Link href={href} className="font-medium group-hover:underline">
                          {v.creator}
                        </Link>
                        <span className="block max-w-[200px] truncate text-[12px] text-ink-3">{v.title}</span>
                      </td>
                      <td className="px-4 py-3">
                        {r ? (
                          <ScreenTimeStrip durationSec={r.info.durationSec} segments={r.metrics.segments} mentions={r.metrics.mentions} size="mini" />
                        ) : (
                          <span className="text-[12px] text-ink-3">
                            {v.status === "failed"
                              ? "Analysis failed"
                              : v.status === "running"
                                ? `${STEPS.find((s) => s.id === v.step)?.label ?? "Starting"}…`
                                : "Waiting to start"}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular">{r ? seconds(r.metrics.secondsOnScreen) : "–"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular">
                        {r ? (r.metrics.firstSeenSec === null ? "Never" : timecode(r.metrics.firstSeenSec)) : "–"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular">
                        {counts && r ? `${counts.passed}/${r.terms.length}` : "–"}
                      </td>
                      <td className="px-4 py-3">
                        {v.status === "failed" ? (
                          <span className="text-[12px] font-medium text-fail">Failed</span>
                        ) : v.status === "done" ? (
                          <VerdictBadge verdict={verdicts[i]} />
                        ) : (
                          <span className="text-[12px] text-ink-3">In progress</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!videos.length && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-ink-2">
                      No videos yet. Add a creator&rsquo;s video to start.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {!campaign.synthetic && (
            <div className="mt-4">
              <UploadVideos campaignId={campaign.id} mode={process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "direct"} />
            </div>
          )}
        </section>

        <aside className="space-y-6">
          <div>
            <h2 className="text-[13px] font-semibold">Across {videos.length} videos</h2>
            <dl className="mt-3 grid grid-cols-3 gap-3">
              {(["delivered", "short", "review"] as const).map((k) => (
                <div key={k}>
                  <dt className="text-[12px] text-ink-3">{k === "delivered" ? "Delivered" : k === "short" ? "Fell short" : "Needs review"}</dt>
                  <dd className="text-[20px] font-medium tabular">{verdicts.filter((x) => x === k).length}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-ink-2">
              <span className="mr-1.5 inline-block size-2.5 rounded-[2px] bg-lime align-middle" aria-hidden />
              <span className="font-medium tabular">{seconds(totalOnScreen)}</span> of product on screen in total.
            </p>
          </div>
          <div>
            <h2 className="text-[13px] font-semibold">Contract terms</h2>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-ink-2 marker:text-ink-3">
              {campaign.contractTerms.map((t) => (
                <li key={t}>{t}</li>
              ))}
              {!campaign.contractTerms.length && <li className="list-none pl-0 text-ink-3">None set.</li>}
            </ul>
          </div>
        </aside>
      </div>
    </>
  );
}
