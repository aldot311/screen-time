import type { Metadata } from "next";
import { Clock, ScanSearch, ShieldCheck } from "lucide-react";
import { getCampaign, requestUsed, usingBlob } from "@/lib/campaign/store";
import { consentText, linkSecret, verifyRequestToken } from "@/lib/campaign/requests";
import { Wordmark } from "@/components/ed/bits";
import { SubmitForm } from "./submit-form";

export const dynamic = "force-dynamic";
// The link is the creator's credential: keep it out of search results and other sites' referrer logs.
export const metadata: Metadata = { title: "Send your video", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function SubmitPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const claims = await verifyRequestToken(token, linkSecret());
  const campaign = claims ? await getCampaign(claims.campaignId) : null;
  const used = claims ? await requestUsed(claims.nonce) : false;

  return (
    <main className="mx-auto flex w-full max-w-[560px] flex-1 flex-col px-[max(16px,env(safe-area-inset-left))] pt-[calc(env(safe-area-inset-top)+20px)] pb-[calc(env(safe-area-inset-bottom)+32px)]">
      <Wordmark />
      {!claims || !campaign ? (
        <section className="mt-16 text-center">
          <h1 className="ed-display text-[32px] leading-[1.05]">This link has expired</h1>
          <p className="mx-auto mt-3 max-w-[38ch] text-(--ink-2)">
            Request links last 14 days and send one video. Ask the brand for a new link.
          </p>
        </section>
      ) : used ? (
        <section className="mt-16 text-center">
          <h1 className="ed-display text-[32px] leading-[1.05]">Your video was sent</h1>
          <p className="mx-auto mt-3 max-w-[38ch] text-(--ink-2)">
            {campaign.brand} has it. Each link sends one video; to send another, ask {campaign.brand} for a new link.
          </p>
        </section>
      ) : (
        <>
          <h1 className="ed-display mt-10 text-[34px] leading-[1.04] sm:text-[42px]">
            {campaign.brand} asked for your video, {claims.creator}
          </h1>
          <p className="mt-3 text-[16px] text-(--ink-2)">
            Send the final cut you posted or will post. {campaign.brand} uses it to confirm the sponsorship was delivered.
          </p>

          <ul className="mt-7 grid gap-3 rounded-(--r-card) bg-(--card) p-5 text-[15px] shadow-(--sh-1) ring-1 ring-(--hair)">
            <li className="grid grid-cols-[24px_1fr] gap-3">
              <ScanSearch className="mt-0.5 size-5 text-(--ink-3)" aria-hidden />
              <span>
                What gets checked: how long <span className="font-semibold">{campaign.productDescription}</span> is on screen, and
                whether {campaign.brandTerms.length ? campaign.brandTerms.map((t) => `“${t}”`).join(" or ") : "the brand"} is said.
              </span>
            </li>
            {campaign.contractTerms.length > 0 && (
              <li className="grid grid-cols-[24px_1fr] gap-3">
                <ShieldCheck className="mt-0.5 size-5 text-(--ink-3)" aria-hidden />
                <span>
                  Against the terms you agreed:
                  <ul className="mt-1.5 list-disc space-y-1 pl-4 text-(--ink-2) marker:text-(--ink-3)">
                    {campaign.contractTerms.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </span>
              </li>
            )}
            <li className="grid grid-cols-[24px_1fr] gap-3">
              <Clock className="mt-0.5 size-5 text-(--ink-3)" aria-hidden />
              <span>
                This link works once, until{" "}
                {new Date(claims.exp * 1000).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" })}.
              </span>
            </li>
          </ul>

          <SubmitForm token={token} consent={consentText(campaign.brand)} mode={usingBlob() ? "blob" : "direct"} campaignId={campaign.id} />
        </>
      )}
    </main>
  );
}
