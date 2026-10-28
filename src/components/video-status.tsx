import { AlertTriangle, Loader2 } from "lucide-react";
import { STEPS, type VideoEntry } from "@/lib/campaign/types";
import { friendlyError, verdictOf } from "./format";
import { VerdictBadge } from "./verdict-badge";

/** One cell for any video state: the verdict once done, otherwise where the run is or why it stopped. */
export function VideoStatus({ video, showReason = true }: { video: VideoEntry; showReason?: boolean }) {
  if (video.status === "done") return <VerdictBadge verdict={verdictOf(video.report)} />;
  if (video.status === "failed")
    return (
      <span className="block max-w-[260px]">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-fail-soft px-2 py-0.5 text-[12px] font-semibold text-fail">
          <AlertTriangle className="size-3.5" strokeWidth={2.5} aria-hidden /> Stopped
        </span>
        {showReason && video.error && (
          <span className="mt-1 block text-[12px] leading-4 text-ink-3" title={video.error}>
            {friendlyError(video.error)}
          </span>
        )}
      </span>
    );
  const step = STEPS.find((s) => s.id === video.step)?.label;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-sunken px-2 py-0.5 text-[12px] font-medium text-ink-2">
      <Loader2 className="size-3.5 animate-spin" aria-hidden />
      {video.status === "running" ? (step ?? "Starting") : "Waiting to start"}
    </span>
  );
}
