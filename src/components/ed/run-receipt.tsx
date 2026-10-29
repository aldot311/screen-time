// The run receipt: every Meta Model API call that made this report, in order, with what went in, what came back, how
// long it took and what it cost, then the model versions and the sampling. Closed by default; a judge opens it to see
// the work behind the verdict. Server-safe.
import { ChevronDown, ReceiptText } from "lucide-react";
import type { RunReceipt } from "@/lib/types";

const secs = (ms: number) => (ms < 1000 ? `${(ms / 1000).toFixed(2)} s` : `${(ms / 1000).toFixed(1)} s`);
const money = (usd: number) => `$${usd.toFixed(usd > 0 && usd < 0.01 ? 4 : 3)}`;

export function RunReceiptCard({ receipt }: { receipt: RunReceipt }) {
  const total = receipt.calls.reduce((n, c) => n + c.usd, 0);
  const ms = receipt.calls.reduce((n, c) => n + c.ms, 0);
  const started = new Date(receipt.startedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return (
    <details className="group rounded-(--r-card) bg-(--card) shadow-(--sh-1) ring-1 ring-(--hair)">
      <summary className="ed-press-soft flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-(--r-card) px-4 py-3 active:bg-(--wash) [&::-webkit-details-marker]:hidden">
        <ReceiptText className="size-[18px] shrink-0 text-(--ink-2)" strokeWidth={2.25} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold">Run receipt</span>
          <span className="block text-[13px] text-(--ink-3) tabular">
            {receipt.calls.length} model calls · {money(total)} · {secs(ms)} of model time
          </span>
        </span>
        <ChevronDown className="size-5 shrink-0 text-(--ink-3) transition-transform group-open:rotate-180" strokeWidth={2.25} aria-hidden />
      </summary>
      <ol className="divide-y divide-(--hair) border-t border-(--hair)">
        {receipt.calls.map((c, i) => (
          <li key={i} className="grid grid-cols-[24px_1fr] gap-x-2 px-4 py-3">
            <span className="pt-px text-[12.5px] font-semibold text-(--ink-3) tabular">{i + 1}</span>
            <span className="min-w-0">
              <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-[14px] font-semibold">{c.purpose}</span>
                <span className="text-[12.5px] text-(--ink-3) tabular">
                  {secs(c.ms)} · {money(c.usd)}
                </span>
              </span>
              <span className="mt-0.5 block text-[12.5px] font-semibold text-(--ink-2)">{c.model}</span>
              <span className="mt-1 block text-[13px] leading-snug text-(--ink-2)">
                <span className="text-(--ink-3)">In:</span> {c.input}
              </span>
              <span className="block text-[13px] leading-snug text-(--ink-2)">
                <span className="text-(--ink-3)">Out:</span> {c.output}
              </span>
            </span>
          </li>
        ))}
      </ol>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-t border-(--hair) px-4 py-3 text-[12.5px] text-(--ink-2)">
        <dt className="text-(--ink-3)">Models</dt>
        <dd>
          {receipt.models.sam} · {receipt.models.spark} · {receipt.models.transcribe}
        </dd>
        <dt className="text-(--ink-3)">Sampling</dt>
        <dd>Every frame at {receipt.fps} fps (the video is re-encoded to {receipt.fps} fps first)</dd>
        <dt className="text-(--ink-3)">Run</dt>
        <dd className="break-all">
          {receipt.runId} · {started}
        </dd>
        <dt className="text-(--ink-3)">Cost</dt>
        <dd>SAM 3.1 as billed per frame; Muse Spark and Voice Transcribe at the fixed amount the budget reserves per call.</dd>
      </dl>
    </details>
  );
}
