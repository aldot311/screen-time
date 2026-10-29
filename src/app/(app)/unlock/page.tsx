import type { Metadata } from "next";
import { Suspense } from "react";
import { LockKeyhole } from "lucide-react";
import { TopBar } from "@/components/ed/top-bar";
import { PendingLink } from "@/components/ed/pending-link";
import { UnlockForm } from "./unlock-form";

export const metadata: Metadata = { title: "Demo access" };

export default function UnlockPage() {
  return (
    <>
      <TopBar back={{ href: "/campaigns", label: "Campaigns" }} />
      <main className="flex flex-1 items-start justify-center px-4 pt-8 pb-16 sm:items-center sm:px-6 sm:py-16">
        <div className="w-full max-w-[440px] rounded-[28px] bg-(--card) p-6 shadow-(--sh-3) ring-1 ring-black/[0.04] sm:p-9">
          <span className="grid size-12 place-items-center rounded-[14px] bg-(--ink) text-white shadow-(--sh-1)">
            <LockKeyhole className="size-[22px]" strokeWidth={2} aria-hidden />
          </span>
          <h1 className="ed-display mt-6 text-[34px] leading-[1.02] sm:text-[40px]">Demo access</h1>
          <p className="mt-3 text-[16px] leading-[1.55] text-(--ink-2)">
            Anyone can read reports. Uploading and analysing videos uses paid Meta API credits, so it needs the demo
            password.
          </p>
          <Suspense fallback={<FormSkeleton />}>
            <UnlockForm />
          </Suspense>
          <p className="mt-6 border-t border-(--hair) pt-5 text-[14px] text-(--ink-3)">
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
