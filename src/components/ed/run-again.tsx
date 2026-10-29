"use client";

// Start (or restart) a run. The button answers the tap at once (press), shows a spinner in place of the icon while the
// request is out and while the page refetches, keeps its width, and shows the server's reason if it refuses.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, RotateCcw } from "lucide-react";
import { ApiError } from "@/components/api-error";
import { Spinner } from "./pending-link";

export function RunAgain({
  campaignId,
  videoId,
  first = false,
}: {
  campaignId: string;
  videoId: string;
  /** A video that has never run: "Run analysis". */ first?: boolean;
}) {
  const Icon = first ? Play : RotateCcw;
  const label = first ? "Run analysis" : "Run again";
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const pending = busy || refreshing;

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/videos/${videoId}/run`, { method: "POST" });
      if (!res.ok) {
        setError((await res.json().catch(() => null))?.error ?? `Could not start (${res.status})`);
        return;
      }
      startRefresh(() => router.refresh());
    } catch {
      setError("Could not reach Screen-Time. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-3">
      <button
        type="button"
        disabled={pending}
        aria-busy={pending}
        onClick={run}
        className="ed-press inline-flex h-12 min-w-[156px] items-center justify-center gap-2 rounded-full bg-(--ink) px-5 text-[15px] font-semibold text-white shadow-(--sh-2) hover:bg-black active:bg-black disabled:cursor-progress disabled:opacity-80"
      >
        {pending ? (
          <Spinner className="size-[18px]" />
        ) : (
          <Icon className="size-[18px]" strokeWidth={2.25} fill={first ? "currentColor" : "none"} aria-hidden />
        )}
        {pending ? "Starting…" : label}
      </button>
      {error && (
        <p role="alert" className="text-[14px]">
          <ApiError message={error} />
        </p>
      )}
    </div>
  );
}
