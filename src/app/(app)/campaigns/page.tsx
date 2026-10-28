import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { listCampaigns, listVideos } from "@/lib/campaign/store";
import { verdictOf } from "@/components/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Campaigns" };

export default async function CampaignsPage() {
  const campaigns = await listCampaigns();
  const rows = await Promise.all(
    campaigns.map(async (c) => {
      const videos = await listVideos(c.id);
      const verdicts = videos.map((v) => verdictOf(v.report));
      return {
        c,
        total: videos.length,
        delivered: verdicts.filter((v) => v === "delivered").length,
        short: verdicts.filter((v) => v === "short").length,
        review: verdicts.filter((v) => v === "review").length,
      };
    }),
  );

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.015em]">Campaigns</h1>
          <p className="mt-1 max-w-[60ch] text-ink-2">
            One campaign is one product brief checked across many creator videos.
          </p>
        </div>
        <Link
          href="/campaigns/new"
          className="inline-flex items-center gap-1.5 rounded-[8px] bg-ink px-3.5 py-2 font-medium text-white shadow-1 hover:bg-ink/90"
        >
          <Plus className="size-4" aria-hidden /> New campaign
        </Link>
      </div>

      <div className="mt-6 overflow-x-auto rounded-[10px] border border-line bg-surface shadow-1">
        <table className="w-full min-w-[720px] text-left">
          <thead className="border-b border-line text-[12px] text-ink-3">
            <tr>
              <th className="px-4 py-2.5 font-medium">Campaign</th>
              <th className="px-4 py-2.5 font-medium">Looking for</th>
              <th className="px-4 py-2.5 text-right font-medium">Videos</th>
              <th className="px-4 py-2.5 font-medium">Delivered / fell short / needs review</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map(({ c, total, delivered, short, review }) => (
              <tr key={c.id} className="hover:bg-sunken/50">
                <td className="px-4 py-3">
                  <Link href={`/campaigns/${c.id}`} className="font-medium hover:underline">
                    {c.name}
                  </Link>
                  {c.synthetic && (
                    <span className="ml-2 rounded-full bg-sunken px-2 py-0.5 text-[11px] text-ink-3">Preview data</span>
                  )}
                  <span className="block text-[12px] text-ink-3">{c.brand}</span>
                </td>
                <td className="max-w-[320px] px-4 py-3 text-ink-2">{c.productDescription}</td>
                <td className="px-4 py-3 text-right tabular">{total}</td>
                <td className="px-4 py-3">
                  <MixBar delivered={delivered} short={short} review={review} total={total} />
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-ink-2">
                  No campaigns yet.{" "}
                  <Link href="/campaigns/new" className="font-medium text-ink underline">
                    Create the first one
                  </Link>
                  .
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function MixBar({ delivered, short, review, total }: { delivered: number; short: number; review: number; total: number }) {
  const w = (n: number) => `${total ? (n / total) * 100 : 0}%`;
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-2 w-40 overflow-hidden rounded-full bg-sunken" aria-hidden>
        <span className="bg-pass" style={{ width: w(delivered) }} />
        <span className="bg-fail" style={{ width: w(short) }} />
        <span className="bg-unsure" style={{ width: w(review) }} />
      </div>
      <span className="text-[12px] text-ink-2 tabular">
        {delivered} / {short} / {review}
      </span>
    </div>
  );
}
