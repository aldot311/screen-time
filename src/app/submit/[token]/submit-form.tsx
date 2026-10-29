"use client";

import { useRef, useState } from "react";
import { Check, Upload } from "lucide-react";
import { Spinner } from "@/components/ed/pending-link";
import { safeUploadName } from "@/lib/campaign/upload-name";

type State = { kind: "idle" } | { kind: "sending"; name: string; pct: number | null } | { kind: "sent"; name: string } | { kind: "error"; message: string };

export function SubmitForm({ token, consent, mode, campaignId }: { token: string; consent: string; mode: "blob" | "direct"; campaignId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [agreed, setAgreed] = useState(false);
  const [state, setState] = useState<State>({ kind: "idle" });

  async function send(file: File) {
    setState({ kind: "sending", name: file.name, pct: null });
    try {
      let res: Response;
      if (mode === "blob") {
        const { upload } = await import("@vercel/blob/client");
        const blob = await upload(`campaigns/${campaignId}/files/${safeUploadName(file)}`, file, {
          access: "public",
          handleUploadUrl: "/api/blob-upload",
          clientPayload: token,
          onUploadProgress: (p) => setState({ kind: "sending", name: file.name, pct: Math.round(p.percentage) }),
        });
        res = await fetch(`/api/submit/${token}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: blob.url, title: file.name.slice(0, 200), consent: true }),
        });
      } else {
        const form = new FormData();
        form.set("file", file);
        form.set("consent", "true");
        res = await fetch(`/api/submit/${token}`, { method: "POST", body: form });
      }
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Upload failed (${res.status})`);
      setState({ kind: "sent", name: file.name });
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : "Upload failed" });
    }
  }

  if (state.kind === "sent") {
    return (
      <div role="status" className="mt-8 rounded-(--r-card) bg-(--pass-soft) p-6 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-(--pass) text-white">
          <Check className="size-6" strokeWidth={3} aria-hidden />
        </span>
        <h2 className="ed-display mt-4 text-[24px]">Sent. Thank you.</h2>
        <p className="mt-1 text-(--ink-2)">{state.name} is with the brand. You can close this page.</p>
      </div>
    );
  }

  const sending = state.kind === "sending";
  return (
    <div className="mt-8 grid gap-4">
      <label className="ed-press-soft flex cursor-pointer items-start gap-3 rounded-(--r-inner) bg-(--card) p-4 ring-1 ring-(--hair) has-checked:ring-2 has-checked:ring-(--ink)">
        <input
          id="consent"
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          disabled={sending}
          className="mt-0.5 size-5 shrink-0 accent-(--ink)"
        />
        <span className="text-[15px]">{consent}</span>
      </label>

      <button
        type="button"
        disabled={!agreed || sending}
        onClick={() => input.current?.click()}
        className="ed-press inline-flex h-14 items-center justify-center gap-2 rounded-full bg-(--ink) px-6 text-[16px] font-semibold text-white shadow-(--sh-2) active:bg-black/85 disabled:bg-(--hair-2) disabled:text-(--ink-3) disabled:shadow-none"
      >
        {sending ? <Spinner className="size-5" /> : <Upload className="size-5" aria-hidden />}
        {sending ? (state.pct === null ? `Sending ${state.name}…` : `Sending… ${state.pct}%`) : "Choose your video"}
      </button>
      <input
        ref={input}
        type="file"
        accept="video/mp4,video/quicktime"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void send(f);
        }}
      />
      {!agreed && !sending && <p className="text-center text-[13px] text-(--ink-3)">Tick the box above to choose a video.</p>}
      {state.kind === "error" && (
        <p role="alert" className="rounded-(--r-inner) bg-(--short-soft) px-4 py-3 text-[14px] text-(--short)">
          {state.message}
        </p>
      )}
      <p className="text-[13px] text-(--ink-3)">MP4 or MOV, up to 200 MB. It goes to the brand that sent this link, for this check.</p>
    </div>
  );
}
