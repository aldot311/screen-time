"use client";

// "Run analysis" for a video a creator sent through a request link. Those never start on their own (the brand decides
// when to spend on a run), so this is the one place that starts them.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import { ApiError } from "@/components/api-error";
import { Spinner } from "./pending-link";

export function CampaignRunButton({ campaignId, videoId }: { campaignId: string; videoId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const pending = busy || refreshing;

  async function run() {
    if (pending) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/videos/${videoId}/run`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Could not start the analysis (${res.status}).`);
      }
      // Keep the spinner until the refreshed row (now running) has rendered.
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={run}
        disabled={pending}
        aria-busy={pending}
        className="ed-press inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full bg-(--ink) px-4 text-[14px] font-semibold text-white shadow-(--sh-1) active:bg-black/85 disabled:cursor-wait disabled:opacity-85 [@media(hover:hover)]:hover:bg-black"
      >
        {pending ? <Spinner className="size-4" /> : <Play className="size-4 fill-current" strokeWidth={2} aria-hidden />}
        {pending ? "Starting…" : "Run analysis"}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-[13px] leading-snug">
          <ApiError message={error} />
        </p>
      )}
    </div>
  );
}
