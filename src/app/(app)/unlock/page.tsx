import type { Metadata } from "next";
import { Suspense } from "react";
import { LockKeyhole } from "lucide-react";
import { TopBar } from "@/components/ed/top-bar";
import { PendingLink } from "@/components/ed/pending-link";
import { TrySample } from "@/components/ed/try-sample";
import { UnlockForm } from "./unlock-form";

export const metadata: Metadata = { title: "Demo access" };

// Full-bleed on a phone (the page is the surface); a raised card from sm up.
export default function UnlockPage() {
  return (
    <>
      <TopBar back={{ href: "/campaigns", label: "Campaigns" }} />
      <main className="flex flex-1 items-start justify-center px-4 pt-8 pb-16 sm:items-center sm:px-6 sm:py-16">
        <div className="w-full max-w-[440px] sm:rounded-[28px] sm:bg-(--card) sm:p-9 sm:shadow-(--sh-3) sm:ring-1 sm:ring-black/[0.04]">
          <span className="grid size-12 place-items-center rounded-[14px] bg-(--ink) text-white shadow-(--sh-1)">
            <LockKeyhole className="size-[22px]" strokeWidth={2} aria-hidden />
          </span>
          <h1 className="ed-display mt-6 text-[36px] leading-[1.02] sm:text-[40px]">Demo access</h1>
          <p className="mt-3 text-[17px] leading-[1.45] font-medium text-(--ink)">
            Screen-Time checks that your product was seen in creator video, to the second.
          </p>
          <p className="mt-2 text-[16px] leading-[1.55] text-(--ink-2)">
            Anyone can read reports and run the sample. Uploading and analyzing your own videos uses paid Meta API credits, so it needs the demo
            password.
          </p>
          <Suspense fallback={<FormSkeleton />}>
            <UnlockForm />
          </Suspense>
          <div className="mt-6 border-t border-(--hair) pt-5">
            <p className="text-[14px] text-(--ink-2)">No password? Watch the real pipeline run on a sample Reel.</p>
            <div className="mt-2">
              <TrySample className="ed-press inline-flex h-11 items-center gap-2 rounded-full bg-(--card) px-4 text-[14px] font-semibold text-(--ink) shadow-(--sh-1) ring-1 ring-(--hair-2) active:bg-(--wash)" />
            </div>
          </div>
          <p className="mt-4 text-[14px] text-(--ink-3)">
            Just looking?{" "}
            <PendingLink
              href="/campaigns"
              className="-mx-1 inline-flex min-h-11 items-center gap-1 rounded-full px-1 font-semibold text-(--ink) underline decoration-(--hair-2) decoration-2 underline-offset-4 hover:decoration-(--ink) active:opacity-70"
            >
              Browse the reports
            </PendingLink>
          </p>
        </div>
      </main>
    </>
  );
}

function FormSkeleton() {
  return (
    <div className="mt-7 space-y-4" aria-hidden>
      <div className="ed-skel h-4 w-28 rounded-full" />
      <div className="ed-skel h-[52px] rounded-(--r-ctl)" />
      <div className="ed-skel h-[52px] rounded-full" />
    </div>
  );
}
