import type { Metadata } from "next";
import Link from "next/link";
import { NewCampaignForm } from "./new-campaign-form";

export const metadata: Metadata = { title: "New campaign" };

export default function NewCampaignPage() {
  return (
    <>
      <nav className="text-[13px] text-ink-3">
        <Link href="/campaigns" className="hover:text-ink hover:underline">
          Campaigns
        </Link>{" "}
        / New
      </nav>
      <h1 className="mt-2 text-[22px] font-semibold tracking-[-0.015em]">New campaign</h1>
      <p className="mt-1 max-w-[65ch] text-ink-2">
        Describe the product the way you would to a person. Screen-Time tracks it in every creator video and checks
        each one against your contract.
      </p>
      <NewCampaignForm />
    </>
  );
}
