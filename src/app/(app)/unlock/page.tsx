import type { Metadata } from "next";
import { Suspense } from "react";
import { UnlockForm } from "./unlock-form";

export const metadata: Metadata = { title: "Demo access" };

export default function UnlockPage() {
  return (
    <div className="mx-auto max-w-[420px] pt-10">
      <h1 className="text-[22px] font-semibold tracking-[-0.015em]">Demo access</h1>
      <p className="mt-1 text-ink-2">
        Anyone can read reports. Uploading and analysing videos uses paid Meta API credits, so it needs the demo
        password.
      </p>
      <Suspense>
        <UnlockForm />
      </Suspense>
    </div>
  );
}
