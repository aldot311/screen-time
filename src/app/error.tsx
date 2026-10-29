"use client"; // Error boundaries must be Client Components.

import { useEffect, useTransition } from "react";
import { RotateCw } from "lucide-react";
import { TopBar } from "@/components/ed/top-bar";
import { PendingLink, Spinner } from "@/components/ed/pending-link";
import { StateScreen, stateBtnPrimary, stateBtnSecondary } from "@/components/ed/landing-state";

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const [pending, start] = useTransition();
  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined;

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <>
      <TopBar />
      <StateScreen
        tone="broken"
        title="This page did not load."
        body={
          <>
            <p>Something went wrong on our side while loading it. Your campaigns and reports are safe; trying again usually works.</p>
            {digest && (
              <p className="mt-3 text-[13px] text-(--ink-3)">
                Reference <span className="ed-tc">{digest}</span>
              </p>
            )}
          </>
        }
        actions={
          <>
            <button
              type="button"
              onClick={() => start(() => retry())}
              disabled={pending}
              aria-busy={pending}
              className={`ed-press ${stateBtnPrimary} disabled:cursor-progress disabled:bg-(--ink)/85`}
            >
              {pending ? <Spinner className="size-[18px]" /> : <RotateCw className="size-[18px]" strokeWidth={2.25} aria-hidden />}
              {pending ? "Trying again…" : "Try again"}
            </button>
            <PendingLink href="/campaigns" className={stateBtnSecondary}>
              Go to campaigns
            </PendingLink>
          </>
        }
      />
    </>
  );
}
