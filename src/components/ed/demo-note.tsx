import type { ReactNode } from "react";
import { DEMO_NOTE } from "@/lib/campaign/demo-note";

/** The test-campaign note: who runs it, that the people shown agreed, and that the brands shown are not involved. Shown
 *  wherever one of the site's own test campaigns appears (isDemoCampaign); `lead` puts the page's own sentence first. */
export function DemoNote({ lead, className = "" }: { lead?: ReactNode; className?: string }) {
  return (
    <p className={`max-w-[72ch] text-[13px] leading-[1.5] text-(--ink-3) ${className}`}>
      {lead && <span className="font-medium text-(--ink-2)">{lead} </span>}
      {DEMO_NOTE}
    </p>
  );
}
