"use client";

// "Try a sample video": runs the real pipeline on a fixed sample Reel, no password, and opens its live run page. When a
// run is already going it joins that one; past the day's limits it opens the newest finished run, whose Replay
// analysis shows the same steps.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import { Spinner } from "./pending-link";

export function TrySample({ className, label = "Try a sample video" }: { className: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/try", { method: "POST" });
      const out = (await res.json().catch(() => null)) as { campaignId?: string; videoId?: string; mode?: string; reason?: string; error?: string } | null;
      if (!res.ok || !out?.campaignId || !out.videoId) throw new Error(out?.error ?? `The sample could not start (${res.status}).`);
      const note = out.mode === "replay" && out.reason ? `?limit=${encodeURIComponent(out.reason)}` : "";
      router.push(`/campaigns/${out.campaignId}/videos/${out.videoId}${note}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The sample could not start.");
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-stretch">
      <button type="button" onClick={() => void start()} disabled={busy} aria-busy={busy} className={`${className} cursor-pointer disabled:cursor-wait`}>
        {busy ? <Spinner className="size-[18px]" /> : <Play className="size-[17px]" fill="currentColor" strokeWidth={0} aria-hidden />}
        {busy ? "Starting the sample…" : label}
      </button>
      {error && (
        <span role="alert" className="mt-2 max-w-[44ch] text-[13.5px] text-(--short)">
          {error}
        </span>
      )}
    </span>
  );
}
