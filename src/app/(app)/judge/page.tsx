import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import data from "@/lib/accuracy-data.json";
import { TopBar } from "@/components/ed/top-bar";
import { DemoNote } from "@/components/ed/demo-note";
import { DISPLAY } from "@/components/ed/campaign-ui";
import { PendingLink } from "@/components/ed/pending-link";
import { TrySample } from "@/components/ed/try-sample";
import { VerdictPill } from "@/components/ed/bits";
import { pct, summarize } from "@/components/ed/accuracy-summary";
import { CASES, LACROIX, OWN_VIDEO_HREF, campaignHref, reportHref } from "@/components/ed/judge-path";
import { termCounts, verdictOf } from "@/components/format";
import { getCampaign, getVideo } from "@/lib/campaign/store";
import type { Campaign, VideoEntry } from "@/lib/campaign/types";

export const metadata: Metadata = {
  title: "How to judge this in 5 minutes",
  description: "Five steps through Screen-Time on real Reels from a LaCroix test campaign: a live run, a pay case, a hold case, the accuracy and the follow-up agent.",
};

// The example reports are read from the store on each visit, so every claim below is the stored run's own result.
export const dynamic = "force-dynamic";

const action =
  "ed-press inline-flex min-h-11 items-center gap-1.5 rounded-full font-semibold text-(--ink) underline decoration-(--hair-2) decoration-2 underline-offset-4 hover:decoration-(--ink) active:opacity-70";

type Done = VideoEntry & { report: NonNullable<VideoEntry["report"]> };
const done = (v: VideoEntry | null): Done | null => (v?.status === "done" && v.report ? (v as Done) : null);

export default async function JudgePage() {
  const read = (id: string) => getVideo(LACROIX, id).then(done, () => null);
  const [campaign, pay, hold, firstTake, agent] = await Promise.all([
    getCampaign(LACROIX).catch(() => null),
    read(CASES.pay),
    read(CASES.hold),
    read(CASES.firstTake),
    read(CASES.agent),
  ]);
  const acc = summarize(data);
  // A missing report never leaves a dead link: the step opens the campaign (or the list) instead.
  const open = (v: Done | null) => (v ? reportHref(v.id) : campaign ? campaignHref : "/campaigns");
  const fee = feeFor(campaign);
  const brand = campaign?.brand ?? "LaCroix";

  return (
    <>
      <TopBar back={{ href: "/", label: "Home" }} />
      <main className="mx-auto w-full max-w-[760px] px-4 pt-6 pb-[calc(env(safe-area-inset-bottom)+64px)] sm:px-6 lg:pt-12">
        <h1 className={`${DISPLAY} text-[38px] leading-[1.02] sm:text-[52px]`}>How to judge this in 5 minutes</h1>
        <p className="mt-3 max-w-[60ch] text-[16px] leading-[1.55] text-(--ink-2)">
          Five steps on real {brand} Reels from a test campaign. Friends filmed them, except two look-alike clips that are the
          builder&rsquo;s own. Every step opens a live page; nothing here is a mock-up.
        </p>
        <DemoNote className="mt-3" />

        <ol className="mt-8 divide-y divide-(--hair) border-y border-(--hair)">
          <Step n={1} title="Run the sample">
            <p>
              The real pipeline, live, on a sample Reel: SAM 3.1 tracks the can in every frame, Muse Spark checks each find, Voice
              Transcribe listens for the brand, and the contract is checked. It usually takes under a minute and a half, and you can
              watch every step. No password.
            </p>
            <div className="mt-3">
              <TrySample
                label="Run it on a sample video"
                className="ed-press inline-flex h-12 items-center justify-center gap-2 rounded-full bg-(--ink) px-6 text-[15px] font-semibold text-white shadow-(--sh-1) active:bg-black/80 [@media(hover:hover)]:hover:bg-black"
              />
            </div>
          </Step>

          <Step n={2} title={pay ? `The pay case: ${pay.creator}’s re-cut` : "The pay case"} verdict={pay && verdictOf(pay.report)}>
            <p>
              {pay ? `${termsLine(pay)}${fee && verdictOf(pay.report) === "delivered" ? `, so the recommendation is to pay ${fee}` : ""}. ` : ""}
              Tap the play button on any term: the player jumps to the moment that proves it.
            </p>
            <Go href={open(pay)}>{pay ? `Open ${pay.creator}’s re-cut` : "Open the campaign"}</Go>
          </Step>

          <Step n={3} title={hold ? `The hold case: ${hold.creator}’s Reel` : "The hold case"} verdict={hold && verdictOf(hold.report)}>
            <p>
              {hold ? `${lookalikeLine(hold)}${fee && verdictOf(hold.report) === "short" ? ` The ${fee} is held.` : ""} ` : ""}
              The fee is held until the creator sends a Reel that meets the contract.
            </p>
            <Go href={open(hold)}>{hold ? `Open ${hold.creator}’s Reel` : "Open the campaign"}</Go>
            <p className="mt-4">
              <span className="font-semibold text-(--ink)">And a re-cut.</span>{" "}
              {firstTake
                ? `${firstTake.creator}’s first take: ${missLine(firstTake)}, so it was held. The banner at the top points to the re-cut, which replaced it and now decides pay. Both takes were filmed the same day; the one sent second counts as the re-cut.`
                : "A creator’s re-cut replaces the take it fixes, and the money follows the re-cut."}
            </p>
            <Go href={open(firstTake)}>{firstTake ? `Open ${firstTake.creator}’s first take` : "Open the campaign"}</Go>
          </Step>

          <Step n={4} title="Check the accuracy">
            <p>
              <span className="tabular">{pct(acc.verified.precision)}</span> precision and <span className="tabular">{pct(acc.verified.recall)}</span>{" "}
              recall per frame on {acc.clips} test Reels, with and without Muse Spark, and where it is wrong.
            </p>
            <Go href="/accuracy">Open the accuracy page</Go>
          </Step>

          <Step n={5} title={agent ? `The follow-up agent on ${agent.creator}’s Reel` : "The follow-up agent"} verdict={agent && verdictOf(agent.report)}>
            <p>
              {agent ? `${missLine(agent)}. ` : ""}
              Tap <span className="font-semibold text-(--ink)">Run the follow-up agent</span> (or{" "}
              <span className="font-semibold text-(--ink)">Run it again</span> if a run is shown): Muse Spark with tools reads the report and
              the creator&rsquo;s other videos, drafts the note to the creator and makes the pay/hold call. No password on these example
              reports; approving the re-cut link it queues needs the demo password.
            </p>
            <Go href={open(agent)}>{agent ? `Open ${agent.creator}’s report` : "Open the campaign"}</Go>
          </Step>
        </ol>

        <div className="mt-8 max-w-[60ch] text-[15px] leading-[1.6] text-(--ink-2)">
          <p>
            <span className="font-semibold text-(--ink)">Your own video.</span> Saving a campaign and checking your own video need the
            demo password, which is in the submission notes.
          </p>
          <p className="mt-1 flex flex-wrap gap-x-6">
            <PendingLink href={OWN_VIDEO_HREF} className={action}>
              Limits and wait <ArrowRight className="size-4" strokeWidth={2.25} aria-hidden />
            </PendingLink>
            <PendingLink href="/unlock?next=/campaigns/new" className={action}>
              Enter the demo password <ArrowRight className="size-4" strokeWidth={2.25} aria-hidden />
            </PendingLink>
          </p>
        </div>
      </main>
    </>
  );
}

/** "$300", or null when the campaign has no fee. */
function feeFor(c: Campaign | null): string | null {
  return c?.fee ? `$${c.fee.toLocaleString("en-US")}` : null;
}

/** "3 of 3 contract terms met". */
function termsLine(v: Done): string {
  const { passed } = termCounts(v.report.terms);
  return `${passed} of ${v.report.terms.length} contract terms met`;
}

/** "Fell short on “Says LaCroix out loud”", from the report's own failed terms. */
function missLine(v: Done): string {
  const missed = v.report.terms.filter((t) => t.pass === false).map((t) => `“${t.term.text}”`);
  return missed.length ? `Fell short on ${missed.join(" and ")}` : termsLine(v);
}

/** What Muse Spark said about the object it rejected, and what that left on screen. */
function lookalikeLine(v: Done): string {
  const rejected = v.report.tracks.find((t) => t.verdict !== "match");
  const counted = v.report.metrics.secondsOnScreen;
  if (!rejected) return `Muse Spark checked every can in ${v.creator}’s Reel against the brief.`;
  const reason = rejected.reason.trim().replace(/\.+$/, "");
  return `In ${v.creator}’s Reel, Muse Spark rejected a can: “${reason}.”${counted === 0 ? " Nothing was counted, so it fell short." : ""}`;
}

function Step({ n, title, verdict, children }: { n: number; title: string; verdict?: ReturnType<typeof verdictOf> | null; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[32px_minmax(0,1fr)] gap-x-3 py-6 sm:grid-cols-[44px_minmax(0,1fr)]">
      <span className="ed-display pt-0.5 text-[22px] leading-none text-(--ink-3) tabular" aria-hidden>
        {n}
      </span>
      <div className="min-w-0 text-[15px] leading-[1.6] text-(--ink-2)">
        <h2 className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[19px] leading-snug font-semibold text-(--ink)">
          <span>
            <span className="sr-only">Step {n}: </span>
            {title}
          </span>
          {verdict && <VerdictPill verdict={verdict} />}
        </h2>
        <div className="mt-2">{children}</div>
      </div>
    </li>
  );
}

function Go({ href, children }: { href: string; children: ReactNode }) {
  return (
    <p className="mt-1">
      <PendingLink href={href} className={action}>
        {children} <ArrowRight className="size-4" strokeWidth={2.25} aria-hidden />
      </PendingLink>
    </p>
  );
}
