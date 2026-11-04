"use client";

// The report's proof clip tile. The clip is rendered on the first request (which takes a while) and kept, so the tile
// asks first and shows what is happening on the page: a spinner while it renders, a retry while another request is
// rendering it (202), and the reason when it fails, instead of opening raw JSON in a new tab. Once the route answers
// with its redirect to the stored MP4, the clip opens in the tab opened on the tap (so no popup blocker stops it).
import { useEffect, useRef, useState } from "react";
import { Clapperboard } from "lucide-react";
import { ACTION_TILE } from "./action-style";
import { Spinner } from "./pending-link";

/** How long to wait before asking again while another request renders the clip, and how many times to ask. */
const RETRY_MS = 5000;
const MAX_TRIES = 24;

export type ProofAnswer = { kind: "ready" } | { kind: "rendering"; retryMs: number } | { kind: "failed"; message: string };

/** What the proof route's answer means, fetched with `redirect: "manual"`: its redirect to the stored clip (an opaque
 *  redirect in a browser), "rendering, come back" (202), or an error with the reason it gives. */
export async function readProofAnswer(res: Pick<Response, "type" | "status" | "headers" | "json">): Promise<ProofAnswer> {
  if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400)) return { kind: "ready" };
  if (res.status === 202) {
    const after = Number(res.headers.get("Retry-After"));
    return { kind: "rendering", retryMs: Number.isFinite(after) && after > 0 ? after * 1000 : RETRY_MS };
  }
  const body: unknown = await res.json().catch(() => null);
  const error = body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : null;
  return { kind: "failed", message: error ?? `Could not make the proof clip (${res.status}).` };
}

type State = { kind: "idle" } | { kind: "making" } | { kind: "rendering" } | { kind: "failed"; message: string };

export function ProofClipTile({ href }: { href: string }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const busy = state.kind === "making" || state.kind === "rendering";

  async function make() {
    if (busy) return;
    // Opened on the tap itself, so the browser allows it; it is pointed at the clip once the clip exists.
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    setState({ kind: "making" });
    for (let i = 0; i < MAX_TRIES && alive.current; i++) {
      let answer: ProofAnswer;
      try {
        answer = await readProofAnswer(await fetch(href, { redirect: "manual", cache: "no-store" }));
      } catch {
        answer = { kind: "failed", message: "Could not reach the server. Check the connection and try again." };
      }
      if (!alive.current) break;
      if (answer.kind === "ready") {
        // The route redirects to the stored MP4 straight away now.
        if (tab) tab.location.href = href;
        else window.location.assign(href);
        setState({ kind: "idle" });
        return;
      }
      if (answer.kind === "failed") {
        tab?.close();
        setState(answer);
        return;
      }
      setState({ kind: "rendering" });
      await new Promise((r) => setTimeout(r, answer.retryMs));
    }
    tab?.close();
    if (alive.current) setState({ kind: "failed", message: "The proof clip is taking longer than usual. Try again in a minute." });
  }

  return (
    <>
      <button type="button" onClick={() => void make()} aria-busy={busy} className={`${ACTION_TILE} disabled:cursor-wait`} disabled={busy}>
        {busy ? <Spinner /> : <Clapperboard className="size-4" aria-hidden />}
        <span className="sm:hidden">Proof clip</span>
        <span className="hidden sm:inline">Proof clip (MP4)</span>
      </button>
      {/* Spans the whole row of tiles on a phone. */}
      <p role="status" className="col-span-3 text-[13px] leading-snug empty:hidden sm:basis-full">
        {state.kind === "making" && <span className="text-(--ink-3)">Making the proof clip…</span>}
        {state.kind === "rendering" && <span className="text-(--ink-3)">Rendering the clip, a few seconds…</span>}
        {state.kind === "failed" && <span className="font-medium text-(--short)">{state.message}</span>}
      </p>
    </>
  );
}
