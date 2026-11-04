import type { Metadata } from "next";
import type { ReactNode } from "react";
import { TopBar } from "@/components/ed/top-bar";
import { DISPLAY } from "@/components/ed/campaign-ui";
import { PendingLink } from "@/components/ed/pending-link";
import { campaignHref } from "@/components/ed/judge-path";
import { budget, RUN_MAX_SECONDS } from "@/lib/campaign/runner";
import { MAX_VIDEO_BYTES } from "@/lib/campaign/schema";
import { NewCampaignForm } from "./new-campaign-form";
import { aboutDuration, dollars, maxVideoSeconds } from "./limits";

export const metadata: Metadata = { title: "New campaign" };

// Inline in running text: the vertical padding widens the tap target to 44px without spreading the lines apart.
const link =
  "-mx-1 rounded-[8px] px-1 py-3.5 font-semibold text-(--ink) underline decoration-(--hair-2) decoration-2 underline-offset-4 hover:decoration-(--ink) active:opacity-70";

export default function NewCampaignPage() {
  const cap = budget().maxUsdPerRun;
  return (
    <>
      <TopBar back={{ href: "/campaigns", label: "Campaigns" }} />
      {/* Same grid and left edge as the other campaign screens. */}
      <main className="mx-auto w-full max-w-[1200px] px-4 pt-6 pb-[calc(env(safe-area-inset-bottom)+88px)] sm:px-6 md:pb-24 lg:px-8 lg:pt-10">
        <h1 className={`${DISPLAY} text-[38px] leading-none sm:text-[48px]`}>New campaign</h1>
        <p className="mt-3 max-w-[64ch] text-[16px] leading-relaxed text-(--ink-2)">
          Describe the product the way you would to a person. Screen-Time tracks it in every creator video and checks each
          one against your contract.
        </p>

        {/* What "Try your own video" on the landing page promises, said before anyone fills in the form. The figures
            come from the code: the upload limit, the per-video spend cap and the run route's time limit. */}
        <section
          id="before-you-start"
          aria-labelledby="before-h"
          className="mt-6 max-w-[880px] scroll-mt-20 rounded-(--r-card) bg-(--card) p-4 shadow-(--sh-1) ring-1 ring-(--hair) sm:p-5"
        >
          <h2 id="before-h" className="text-[17px] font-semibold">
            Before you start
          </h2>
          <dl className="mt-2 divide-y divide-(--hair) text-[14.5px] leading-[1.55] text-(--ink-2)">
            <Row term="Demo password">
              Saving a campaign and checking your own video need the demo password, because every check spends real Meta API
              credits. To try your own video, email aldo@aetrai.com for the password.{" "}
              <PendingLink href="/unlock?next=/campaigns/new" className={link}>
                Enter the demo password
              </PendingLink>
              <span className="block text-(--ink-3)">
                No password needed to run the sample or open the{" "}
                <PendingLink href={campaignHref} className={link}>
                  example reports
                </PendingLink>
                .
              </span>
            </Row>
            <Row term="Videos">
              MP4 or MOV, up to <span className="tabular">{Math.round(MAX_VIDEO_BYTES / 1024 / 1024)}</span> MB and{" "}
              {aboutDuration(maxVideoSeconds(cap))} long. Each check is capped at <span className="tabular">{dollars(cap)}</span> in Meta API
              fees, and SAM 3.1 is billed for every frame, so a longer video stops before it is tracked.
            </Row>
            <Row term="The wait">
              A short Reel usually takes under a minute and a half to check. A longer video takes longer; a run stops after{" "}
              <span className="tabular">{Math.round(RUN_MAX_SECONDS / 60)}</span> minutes.
            </Row>
            <Row term="Your report">
              Create the campaign, then add videos on its page. Each video gets a card there that updates by itself while it is
              checked; open it to watch the steps live. The same page becomes the report when the check finishes.
            </Row>
          </dl>
        </section>

        <NewCampaignForm mode={process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "direct"} />
      </main>
    </>
  );
}

function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid gap-x-6 gap-y-0.5 py-3 sm:grid-cols-[140px_minmax(0,1fr)]">
      <dt className="font-semibold text-(--ink)">{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}
