// The brief and contract terms. On a phone it is a disclosure near the top (so the terms are never buried under every
// creator card); from lg up it is a card beside the list.
import { AudioLines, ChevronDown, ScanSearch } from "lucide-react";
import type { Campaign } from "@/lib/campaign/types";
import { DISPLAY } from "./campaign-ui";

function Body({ campaign }: { campaign: Campaign }) {
  return (
    <>
      <h3 className="text-[14px] font-semibold">Contract terms</h3>
      <ol className="mt-2 space-y-2">
        {campaign.contractTerms.map((t, i) => (
          <li key={t} className="grid grid-cols-[24px_1fr] gap-2.5 text-[15px] leading-snug">
            <span className="ed-num mt-px grid size-6 place-items-center rounded-full bg-(--wash) text-[12px]">{i + 1}</span>
            {t}
          </li>
        ))}
        {!campaign.contractTerms.length && <li className="text-(--ink-3)">None set, so every video needs a person to review it.</li>}
      </ol>
      <ul className="mt-5 space-y-3 border-t border-(--hair) pt-4 text-[14px] text-(--ink-2)">
        <li className="grid grid-cols-[24px_1fr] gap-2.5">
          <ScanSearch className="mt-0.5 size-5 text-(--ink-3)" strokeWidth={2} aria-hidden />
          <span>
            SAM 3.1 tracks <span className="font-semibold text-(--ink)">&ldquo;{campaign.prompt}&rdquo;</span>; Muse Spark counts it only
            when it is {campaign.productDescription}.
          </span>
        </li>
        {campaign.brandTerms.length > 0 && (
          <li className="grid grid-cols-[24px_1fr] gap-2.5">
            <AudioLines className="mt-0.5 size-5 text-(--ink-3)" strokeWidth={2} aria-hidden />
            <span>Voice Transcribe listens for {campaign.brandTerms.map((t) => `“${t}”`).join(" or ")}.</span>
          </li>
        )}
      </ul>
    </>
  );
}

export function CampaignBriefDisclosure({ campaign }: { campaign: Campaign }) {
  const n = campaign.contractTerms.length;
  return (
    <details className="group rounded-(--r-card) bg-(--card) shadow-(--sh-1) ring-1 ring-(--hair)">
      <summary className="ed-press-soft flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-(--r-card) px-4 py-3 active:bg-(--wash) [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold">The brief</span>
          <span className="block truncate text-[13px] text-(--ink-3)">
            {n} contract term{n === 1 ? "" : "s"} · tracking &ldquo;{campaign.prompt}&rdquo;
          </span>
        </span>
        <ChevronDown className="size-5 shrink-0 text-(--ink-2) transition-transform duration-200 group-open:rotate-180" strokeWidth={2.25} aria-hidden />
      </summary>
      <div className="px-4 pt-1 pb-4">
        <Body campaign={campaign} />
      </div>
    </details>
  );
}

export function CampaignBriefCard({ campaign }: { campaign: Campaign }) {
  return (
    <section aria-labelledby="brief-title" className="rounded-(--r-card) bg-(--card) p-5 shadow-(--sh-1) ring-1 ring-(--hair)">
      <h2 id="brief-title" className={`${DISPLAY} mb-4 text-[20px]`}>
        The brief
      </h2>
      <Body campaign={campaign} />
    </section>
  );
}
