"use client";

// The follow-up agent on a report: Muse Spark with tools reads the report and the creator's other videos, re-checks a
// waiting re-cut, drafts the note to the creator and makes a pay/hold call. Its steps show as it works. Nothing leaves
// without the brand: the note is an editable draft, and a re-cut request becomes a link only when approved here.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Check, ChevronDown, Copy, Link2, RotateCcw } from "lucide-react";
import type { AgentRun } from "@/lib/agent/campaign-agent";
import { agentRunning } from "@/lib/agent/state";
import { ApiError } from "@/components/api-error";
import { Spinner } from "./pending-link";
import { useFlash } from "./use-flash";

const TOOL_LABEL: Record<string, string> = {
  get_report: "Read the report",
  get_creator_history: "Checked the creator's other videos",
  analyze_video: "Re-checked the re-cut",
  draft_creator_note: "Drafted a note to the creator",
  recommend_payout: "Made the pay/hold call",
  request_recut: "Queued a re-cut request for your approval",
  answer: "Summed up",
};

export function AgentPanel({ endpoint, agent, creator }: { endpoint: string; agent?: AgentRun; creator: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [link, setLink] = useState<{ url: string; expires: string } | null>(null);
  const [copied, flash] = useFlash();
  const [linkCopied, flashLink] = useFlash();

  async function post(url: string): Promise<unknown> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, { method: "POST" });
      const out = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(out?.error ?? `Request failed (${res.status}).`);
      return out;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  // A run cut off by the time limit stays "running" in the store; after a while it can be started again.
  const running = agentRunning(agent);
  const draft = note ?? agent?.note ?? "";
  const shell = "rounded-(--r-card) bg-(--card) p-4 shadow-(--sh-1) ring-1 ring-(--hair) sm:p-5";

  return (
    <section aria-labelledby="agent-h" className={shell}>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-(--wash) text-(--ink)" aria-hidden>
          <Bot className="size-[19px]" strokeWidth={2.25} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-semibold text-(--ink-3)">Muse Spark with tools · you approve anything sent</p>
          <h2 id="agent-h" className="ed-display mt-0.5 text-[21px] leading-tight sm:text-[23px]">
            Follow-up agent
          </h2>
          {!agent && (
            <p className="mt-1.5 max-w-[60ch] text-[14.5px] leading-[1.5] text-(--ink-2)">
              Reads this report and {creator}&rsquo;s other videos, re-checks a re-cut they sent, drafts the note to them and makes the
              pay/hold call. About $0.10.
            </p>
          )}

          {agent && agent.steps.length > 0 && agent.status !== "done" && (
            <ol className="mt-3 space-y-2" aria-label="What the agent did" aria-live="polite">
              {agent.steps.map((s, i) => (
                <li key={i} className="grid grid-cols-[20px_1fr] gap-2 text-[13.5px] leading-[1.45]">
                  <Check className="mt-[3px] size-4 text-(--pass)" strokeWidth={3} aria-hidden />
                  <span className="min-w-0">
                    <span className="font-semibold text-(--ink)">{TOOL_LABEL[s.tool] ?? s.tool}</span>
                    {s.tool === "recommend_payout" && typeof s.args?.decision === "string" && (
                      <span className="text-(--ink-2)"> · {s.args.decision}</span>
                    )}
                    {s.tool === "analyze_video" && <span className="block text-(--ink-3)">{s.result.slice(0, 140)}</span>}
                  </span>
                </li>
              ))}
            </ol>
          )}
          {running && (
            <p className="mt-3 inline-flex items-center gap-2 text-[13.5px] font-medium text-(--ink-2)" role="status">
              <Spinner className="size-4" /> Working… this page updates by itself.
            </p>
          )}
          {agent?.status === "failed" && (
            <p role="alert" className="mt-3 text-[13.5px]">
              <ApiError message={`The agent stopped: ${agent.error ?? "unknown error"}`} />
            </p>
          )}

          {agent?.status === "done" && (
            <div className="mt-4 space-y-4">
              {agent.summary && <p className="max-w-[62ch] text-[15px] leading-[1.55] text-(--ink)">{agent.summary}</p>}
              {agent.recommendation && (
                <p className="text-[14px] text-(--ink-2)">
                  <span className="font-semibold text-(--ink)">Agent&rsquo;s call: {agent.recommendation.decision}</span> · {agent.recommendation.reason}
                </p>
              )}
              {agent.note && (
                <div>
                  <label htmlFor="agent-note" className="text-[14px] font-semibold">
                    Draft note to {creator}
                  </label>
                  <textarea
                    id="agent-note"
                    value={draft}
                    onChange={(e) => setNote(e.target.value)}
                    rows={4}
                    className="mt-1.5 block w-full resize-y rounded-(--r-ctl) bg-(--paper) px-3 py-2.5 text-[15px] leading-snug ring-1 ring-(--hair-2) outline-none field-sizing-content focus:bg-(--card) focus:ring-2 focus:ring-(--ink)"
                  />
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(draft).then(() => flash(true), () => undefined)}
                    className="ed-press mt-2 inline-flex h-11 cursor-pointer items-center gap-2 rounded-full bg-(--wash) px-4 text-[14px] font-semibold text-(--ink) active:bg-(--hair)"
                  >
                    {copied ? <Check className="size-4" strokeWidth={3} aria-hidden /> : <Copy className="size-4" aria-hidden />}
                    {copied ? "Copied" : "Copy the note"}
                  </button>
                </div>
              )}
              {agent.recut && (
                <div className="rounded-(--r-inner) bg-(--wash) p-3.5">
                  <p className="text-[14px] font-semibold">Waiting for you: a re-cut request</p>
                  <p className="mt-0.5 text-[13.5px] text-(--ink-2)">{agent.recut.reason}</p>
                  {link ? (
                    <div className="mt-2">
                      <p className="text-[13px] text-(--ink-2)">One-time link for {creator}, until {link.expires}:</p>
                      <div className="mt-1.5 flex gap-2">
                        <input readOnly value={link.url} aria-label="Re-cut request link" onFocus={(e) => e.currentTarget.select()} className="h-11 min-w-0 flex-1 rounded-(--r-ctl) bg-(--card) px-3 text-[14px] ring-1 ring-(--hair-2)" />
                        <button
                          type="button"
                          onClick={() => navigator.clipboard.writeText(link.url).then(() => flashLink(true), () => undefined)}
                          className="ed-press inline-flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-(--ink) px-4 text-[14px] font-semibold text-white active:bg-black/85"
                        >
                          {linkCopied ? <Check className="size-4" strokeWidth={3} aria-hidden /> : <Copy className="size-4" aria-hidden />}
                          {linkCopied ? "Copied" : "Copy"}
                        </button>
                      </div>
                    </div>
                  ) : agent.recut.approvedAt ? (
                    <p className="mt-2 text-[13px] text-(--ink-3)">Approved. Make a new link from the campaign&rsquo;s creator list if you need it again.</p>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        const out = (await post(`${endpoint}/approve`)) as { path?: string; expiresAt?: string } | null;
                        if (out?.path)
                          setLink({
                            url: new URL(out.path, location.origin).toString(),
                            expires: new Date(out.expiresAt ?? Date.now()).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" }),
                          });
                      }}
                      className="ed-press mt-2 inline-flex h-11 cursor-pointer items-center gap-2 rounded-full bg-(--ink) px-4 text-[14px] font-semibold text-white active:bg-black/85 disabled:cursor-wait"
                    >
                      {busy ? <Spinner className="size-4" /> : <Link2 className="size-4" aria-hidden />}
                      Approve: make the re-cut link
                    </button>
                  )}
                </div>
              )}
              <details className="group">
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-[13px] font-semibold text-(--ink-2) [&::-webkit-details-marker]:hidden">
                  How it got there: {agent.steps.length} steps · ${agent.usd.toFixed(2)} of Muse Spark
                  <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
                </summary>
            {agent.steps.length > 0 && (
              <ol className="mt-2 space-y-2" aria-label="What the agent did">
                {agent.steps.map((s, i) => (
                  <li key={i} className="grid grid-cols-[20px_1fr] gap-2 text-[13.5px] leading-[1.45]">
                    <Check className="mt-[3px] size-4 text-(--pass)" strokeWidth={3} aria-hidden />
                    <span className="min-w-0">
                      <span className="font-semibold text-(--ink)">{TOOL_LABEL[s.tool] ?? s.tool}</span>
                      {s.tool === "recommend_payout" && typeof s.args?.decision === "string" && (
                        <span className="text-(--ink-2)"> · {s.args.decision}</span>
                      )}
                      {s.tool === "analyze_video" && <span className="block text-(--ink-3)">{s.result.slice(0, 140)}</span>}
                    </span>
                  </li>
                ))}
              </ol>
            )}
              </details>
            </div>
          )}

          {!running && (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                if (await post(endpoint)) router.refresh();
              }}
              className={[
                "ed-press mt-3 inline-flex h-11 cursor-pointer items-center gap-2 rounded-full px-4 text-[14px] font-semibold disabled:cursor-wait",
                agent ? "text-(--ink-2) ring-1 ring-(--hair-2) active:bg-(--wash)" : "bg-(--ink) text-white active:bg-black/85",
              ].join(" ")}
            >
              {busy ? <Spinner className="size-4" /> : agent ? <RotateCcw className="size-4" aria-hidden /> : <Bot className="size-4" aria-hidden />}
              {agent ? "Run it again" : "Run the follow-up agent"}
            </button>
          )}
          {error && (
            <p role="alert" className="mt-2 text-[13px]">
              <ApiError message={error} />
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
