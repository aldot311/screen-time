"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { ApiError } from "@/components/api-error";

interface Props {
  campaignId: string;
  /** "blob" in production: big files go straight to Vercel Blob instead of through a function. */
  mode: "blob" | "direct";
}

type Item = { name: string; state: "uploading" | "starting" | "running" | "failed"; error?: string };

export function UploadVideos({ campaignId, mode }: Props) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [creator, setCreator] = useState("");
  const [items, setItems] = useState<Item[]>([]);

  const set = (name: string, patch: Partial<Item>) =>
    setItems((xs) => xs.map((x) => (x.name === name ? { ...x, ...patch } : x)));

  async function send(file: File) {
    setItems((xs) => [...xs.filter((x) => x.name !== file.name), { name: file.name, state: "uploading" }]);
    try {
      const handle = creator.trim() || "@creator";
      let res: Response;
      if (mode === "blob") {
        const { upload } = await import("@vercel/blob/client");
        const blob = await upload(`campaigns/${campaignId}/files/${file.name}`, file, {
          access: "public",
          handleUploadUrl: "/api/blob-upload",
          clientPayload: campaignId,
        });
        res = await fetch(`/api/campaigns/${campaignId}/videos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ creator: handle, title: file.name, url: blob.url }),
        });
      } else {
        const form = new FormData();
        form.set("creator", handle);
        form.set("file", file);
        res = await fetch(`/api/campaigns/${campaignId}/videos`, { method: "POST", body: form });
      }
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Upload failed (${res.status})`);
      const video = (await res.json()) as { id: string };
      set(file.name, { state: "starting" });
      const run = await fetch(`/api/campaigns/${campaignId}/videos/${video.id}/run`, { method: "POST" });
      if (!run.ok) throw new Error((await run.json().catch(() => null))?.error ?? `Could not start (${run.status})`);
      set(file.name, { state: "running" });
      router.refresh();
    } catch (e) {
      set(file.name, { state: "failed", error: e instanceof Error ? e.message : String(e) });
      router.refresh();
    }
  }

  return (
    <div className="rounded-[10px] border border-dashed border-line-strong bg-surface p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-[180px] flex-1">
          <span className="text-[12px] text-ink-3">Creator</span>
          <input
            value={creator}
            onChange={(e) => setCreator(e.target.value)}
            placeholder="@handle"
            className="mt-1 block w-full rounded-[8px] border border-line bg-surface px-3 py-2 placeholder:text-ink-3 hover:border-line-strong"
          />
        </label>
        <button
          onClick={() => input.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-[8px] bg-ink px-3.5 py-2 font-medium text-white shadow-1 hover:bg-ink/90"
        >
          <Upload className="size-4" aria-hidden /> Add videos
        </button>
        <input
          ref={input}
          type="file"
          accept="video/mp4,video/quicktime"
          multiple
          hidden
          onChange={(e) => {
            for (const f of Array.from(e.target.files ?? [])) void send(f);
            e.target.value = "";
          }}
        />
        <p className="basis-full text-[12px] text-ink-3">
          MP4 or MOV, up to 10 minutes. Each video starts its analysis as soon as it is uploaded; only use videos you
          have the rights to.
        </p>
      </div>
      {items.length > 0 && (
        <ul className="mt-3 space-y-1 text-[13px]">
          {items.map((it) => (
            <li key={it.name} className="flex items-baseline gap-2">
              <span className="truncate font-medium">{it.name}</span>
              <span className={it.state === "failed" ? "text-fail" : "text-ink-3"}>
                {it.state === "uploading" && "Uploading…"}
                {it.state === "starting" && "Starting analysis…"}
                {it.state === "running" && "Analysing, see the table below"}
                {it.state === "failed" && it.error && <ApiError message={it.error} />}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
