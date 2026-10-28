import { AlertTriangle, Loader2 } from "lucide-react";
import { STEPS, type VideoEntry } from "@/lib/campaign/types";
import { verdictOf } from "./format";
import { VerdictBadge } from "./verdict-badge";

/** One cell for any video state: the verdict once done, otherwise where the run is or why it stopped. */
export function VideoStatus({ video }: { video: VideoEntry }) {
  if (video.status === "done") return <VerdictBadge verdict={verdictOf(video.report)} />;
  if (video.status === "failed")
    return (
      <span className="block max-w-[220px]">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-fail-soft px-2 py-0.5 text-[12px] font-semibold text-fail">
          <AlertTriangle className="size-3.5" strokeWidth={2.5} aria-hidden /> Stopped
        </span>
        {video.error && (
          <span className="mt-1 block truncate text-[12px] text-ink-3" title={video.error}>
            {video.error}
          </span>
        )}
      </span>
    );
  const step = STEPS.find((s) => s.id === video.step)?.label;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-lime-soft px-2 py-0.5 text-[12px] font-medium text-lime-ink">
      <Loader2 className="size-3.5 animate-spin" aria-hidden />
      {video.status === "running" ? (step ?? "Starting") : "Waiting to start"}
    </span>
  );
}
