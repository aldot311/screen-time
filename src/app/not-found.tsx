import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { TopBar } from "@/components/ed/top-bar";
import { PendingLink } from "@/components/ed/pending-link";
import { StateScreen, stateBtnPrimary, stateBtnSecondary } from "@/components/ed/landing-state";

export const metadata: Metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <>
      <TopBar />
      <StateScreen
        tone="empty"
        code="404"
        title="Nothing on screen here."
        body={<p>This page does not exist, or the link is out of date. Reports and campaigns are one tap away.</p>}
        actions={
          <>
            <PendingLink href="/campaigns" className={stateBtnPrimary}>
              Open the app <ArrowRight className="size-[18px]" strokeWidth={2.25} aria-hidden />
            </PendingLink>
            <PendingLink href="/" className={stateBtnSecondary}>
              Back to the start
            </PendingLink>
          </>
        }
      />
    </>
  );
}
