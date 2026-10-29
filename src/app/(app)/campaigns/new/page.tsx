import type { Metadata } from "next";
import { TopBar } from "@/components/ed/top-bar";
import { DISPLAY } from "@/components/ed/campaign-ui";
import { NewCampaignForm } from "./new-campaign-form";

export const metadata: Metadata = { title: "New campaign" };

export default function NewCampaignPage() {
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
        <NewCampaignForm />
      </main>
    </>
  );
}
