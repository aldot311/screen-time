"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { ApiError } from "@/components/api-error";

export function RunAgainButton({ campaignId, videoId }: { campaignId: string; videoId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const res = await fetch(`/api/campaigns/${campaignId}/videos/${videoId}/run`, { method: "POST" });
          if (!res.ok) {
            setError((await res.json().catch(() => null))?.error ?? `Could not start (${res.status})`);
            setBusy(false);
            return;
          }
          router.refresh();
        }}
        className="inline-flex items-center gap-1.5 rounded-[8px] bg-ink px-3.5 py-2 font-medium text-white shadow-1 hover:bg-ink/90 disabled:opacity-60"
      >
        <RotateCcw className="size-4" aria-hidden /> {busy ? "Starting…" : "Run again"}
      </button>
      {error && <ApiError message={error} />}
    </div>
  );
}
