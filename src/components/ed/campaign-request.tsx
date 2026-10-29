"use client";

// "Request video from creator": makes a signed one-time link for the handle above, which the brand sends to the
// creator. The creator agrees to the analysis and uploads the delivered cut there; the video then waits here to be run.
import { useId, useState } from "react";
import { Check, Copy, Link2, Share } from "lucide-react";
import { ApiError } from "@/components/api-error";
import { Spinner } from "./pending-link";

type State = { kind: "idle" } | { kind: "busy" } | { kind: "ready"; url: string; creator: string; expires: string; copied: boolean } | { kind: "error"; message: string };

export function RequestFromCreator({ campaignId, creator }: { campaignId: string; creator: string }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const inputId = useId();
  const handle = creator.trim().replace(/^@+/, "");

  async function make() {
    setState({ kind: "busy" });
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creator: handle }),
      });
      const body = (await res.json().catch(() => null)) as { path?: string; creator?: string; expiresAt?: string; error?: string } | null;
      if (!res.ok || !body?.path) throw new Error(body?.error ?? `Could not make the link (${res.status})`);
      const expires = new Date(body.expiresAt ?? Date.now()).toLocaleDateString("en-US", { month: "long", day: "numeric" });
      setState({ kind: "ready", url: new URL(body.path, location.origin).toString(), creator: body.creator ?? `@${handle}`, expires, copied: false });
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : "Could not make the link" });
    }
  }

  if (state.kind === "ready") {
    const share = typeof navigator !== "undefined" && "share" in navigator;
    return (
      <div className="mt-3 rounded-(--r-inner) bg-(--wash) p-3" role="status">
        <p className="text-[13px] text-(--ink-2)">
          Send this to <span className="font-semibold text-(--ink)">{state.creator}</span>. It works once, until {state.expires}.
        </p>
        <input
          id={inputId}
          readOnly
          value={state.url}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Request link"
          className="mt-2 h-11 w-full rounded-(--r-ctl) bg-(--card) px-3 text-[14px] text-(--ink-2) ring-1 ring-(--hair-2)"
        />
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(state.url).then(
                () => setState({ ...state, copied: true }),
                () => (document.getElementById(inputId) as HTMLInputElement | null)?.select(),
              );
            }}
            className="ed-press inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-(--ink) text-[14px] font-semibold text-white active:bg-black/85"
          >
            {state.copied ? <Check className="size-4" strokeWidth={3} aria-hidden /> : <Copy className="size-4" aria-hidden />}
            {state.copied ? "Copied" : "Copy link"}
          </button>
          {share && (
            <button
              type="button"
              onClick={() => navigator.share({ title: "Send your video", url: state.url }).catch(() => undefined)}
              className="ed-press inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-(--card) text-[14px] font-semibold ring-1 ring-(--hair-2) active:bg-(--hair)"
            >
              <Share className="size-4" aria-hidden /> Share
            </button>
          )}
        </div>
        <button type="button" onClick={() => setState({ kind: "idle" })} className="ed-press mt-1 h-11 w-full rounded-full text-[13px] font-semibold text-(--ink-2) active:bg-(--hair)">
          Make another link
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={make}
        disabled={!handle || state.kind === "busy"}
        className="ed-press inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-(--card) px-4 text-[14px] font-semibold ring-1 ring-(--hair-2) active:bg-(--wash) disabled:text-(--ink-3) [@media(hover:hover)]:hover:ring-(--ink-3)"
      >
        {state.kind === "busy" ? <Spinner /> : <Link2 className="size-4" aria-hidden />}
        {handle ? `Request the video from @${handle}` : "Enter a handle to request the video"}
      </button>
      {state.kind === "error" && (
        <p role="alert" className="mt-2 text-[13px]">
          <ApiError message={state.message} />
        </p>
      )}
    </div>
  );
}
