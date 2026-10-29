"use client";

// Add creator videos to a campaign. Two transports, same API as before:
//  - "blob" (production): the browser uploads straight to Vercel Blob with a client token from /api/blob-upload, then
//    registers the file with POST /api/campaigns/:id/videos { creator, title, url }.
//  - "direct" (local dev): multipart POST /api/campaigns/:id/videos with creator + file.
// Either way the run starts with POST /api/campaigns/:id/videos/:videoId/run, and the page refreshes so the new row
// appears; the roll-up's AutoRefresh then polls while it runs. Every file gets its own row with real progress.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, RotateCcw, Upload, X } from "lucide-react";
import { ApiError } from "@/components/api-error";
import { Spinner } from "./pending-link";
import { RequestFromCreator } from "./campaign-request";
import { safeUploadName } from "@/lib/campaign/upload-name";

interface Props {
  campaignId: string;
  /** "blob" in production: big files go straight to Vercel Blob instead of through a function. */
  mode: "blob" | "direct";
}

type State = "uploading" | "starting" | "running" | "failed";
type Item = { key: number; file: File; handle: string; state: State; progress: number; error?: string; /** Rejected before upload; retrying cannot help. */ local?: boolean };

const MAX_BYTES = 200 * 1024 * 1024; // matches MAX_VIDEO_BYTES in lib/campaign/schema
const TYPES = ["video/mp4", "video/quicktime"];

let nextKey = 1;

export function UploadVideos({ campaignId, mode }: Props) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [creator, setCreator] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);

  const patch = (key: number, p: Partial<Item>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));

  // The phone's "Add videos" action scrolls here via #add-videos; bring the handle field into play too.
  useEffect(() => {
    const onHash = () => {
      if (location.hash === "#add-videos") document.getElementById("creator-handle")?.focus({ preventScroll: true });
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  function add(files: File[]) {
    const raw = creator.trim().replace(/^@+/, "");
    const handle = raw ? `@${raw}` : "@creator";
    for (const file of files) {
      const item: Item = { key: nextKey++, file, handle, state: "uploading", progress: 0 };
      if (!TYPES.includes(file.type) && !/\.(mp4|mov)$/i.test(file.name)) {
        item.state = "failed";
        item.local = true;
        item.error = "Only MP4 or MOV videos can be checked.";
      } else if (file.size > MAX_BYTES) {
        item.state = "failed";
        item.local = true;
        item.error = "The video is too large (over 200 MB). Upload a shorter or smaller copy.";
      }
      setItems((xs) => [...xs, item]);
      if (item.state === "uploading") void send(item);
    }
  }

  async function send(item: Item) {
    const { key, file, handle } = item;
    patch(key, { state: "uploading", progress: 0, error: undefined });
    try {
      let res: { ok: boolean; status: number; body: unknown };
      if (mode === "blob") {
        const { upload } = await import("@vercel/blob/client");
        const blob = await upload(`campaigns/${campaignId}/files/${safeUploadName(file)}`, file, {
          access: "public",
          handleUploadUrl: "/api/blob-upload",
          clientPayload: campaignId,
          onUploadProgress: (e) => patch(key, { progress: e.percentage / 100 }),
        });
        patch(key, { progress: 1 });
        const r = await fetch(`/api/campaigns/${campaignId}/videos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ creator: handle, title: file.name.slice(0, 200), url: blob.url }),
        });
        res = { ok: r.ok, status: r.status, body: await r.json().catch(() => null) };
      } else {
        const form = new FormData();
        form.set("creator", handle);
        form.set("file", file);
        res = await postWithProgress(`/api/campaigns/${campaignId}/videos`, form, (p) => patch(key, { progress: p }));
      }
      if (!res.ok) throw new Error(errorOf(res.body) ?? `Upload failed (${res.status})`);
      const video = res.body as { id: string };
      patch(key, { state: "starting", progress: 1 });
      const run = await fetch(`/api/campaigns/${campaignId}/videos/${video.id}/run`, { method: "POST" });
      if (!run.ok) throw new Error(errorOf(await run.json().catch(() => null)) ?? `Could not start (${run.status})`);
      patch(key, { state: "running" });
      router.refresh();
    } catch (e) {
      patch(key, { state: "failed", error: e instanceof Error ? e.message : String(e) });
      router.refresh();
    }
  }

  const busy = items.filter((x) => x.state === "uploading" || x.state === "starting").length;

  return (
    <section
      id="add-videos"
      aria-labelledby="add-videos-title"
      className="scroll-mt-24 rounded-(--r-card) bg-(--card) p-4 shadow-(--sh-1) ring-1 ring-(--hair) target:ring-2 target:ring-(--ink) sm:p-5"
    >
      <h2 id="add-videos-title" className="ed-display text-[20px] font-semibold! tracking-[-0.022em]!">
        Add creator videos
      </h2>

      <label htmlFor="creator-handle" className="mt-4 block text-[14px] font-semibold">
        Creator
      </label>
      <div className="mt-1.5 flex h-12 items-center rounded-(--r-ctl) bg-(--card) ring-1 ring-(--hair-2) focus-within:ring-2 focus-within:ring-(--focus)">
        <span className="pl-3.5 text-[16px] text-(--ink-3)" aria-hidden>
          @
        </span>
        <input
          id="creator-handle"
          value={creator}
          onChange={(e) => setCreator(e.target.value.replace(/^@+/, ""))}
          placeholder="handle"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="done"
          aria-describedby="creator-note"
          className="h-full min-w-0 flex-1 rounded-r-(--r-ctl) bg-transparent pr-3.5 pl-1 text-[16px] outline-none placeholder:text-(--ink-3)"
        />
      </div>
      <p id="creator-note" className="mt-2 text-[13px] leading-snug text-(--ink-2)">
        Platforms don&rsquo;t let third parties download creator videos. Upload the file the creator delivered, or ask the
        creator to send it.
      </p>
      {/* Slot: the lead adds a "Request video from creator" link here. */}
      <RequestFromCreator campaignId={campaignId} creator={creator} />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          add(Array.from(e.dataTransfer.files));
        }}
        className={[
          "mt-4 rounded-(--r-inner) border-[1.5px] border-dashed p-3 transition-colors duration-150",
          dragging ? "border-(--ink) bg-(--wash)" : "border-(--hair-2)",
        ].join(" ")}
      >
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="ed-press flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-(--ink) px-5 text-[15px] font-semibold text-white shadow-(--sh-2) active:bg-black/85 [@media(hover:hover)]:hover:bg-black"
        >
          {busy ? <Spinner className="size-[18px]" /> : <Upload className="size-[18px]" strokeWidth={2.25} aria-hidden />}
          {busy ? `Uploading ${busy}… add more` : "Choose videos"}
        </button>
        <p className="mt-2.5 text-center text-[12.5px] text-(--ink-3)">
          <span className="hidden md:inline">Or drop them here. </span>MP4 or MOV, up to 200 MB and 10 minutes. Only use videos
          you have the rights to.
        </p>
      </div>
      <input
        ref={input}
        type="file"
        accept="video/mp4,video/quicktime"
        multiple
        hidden
        onChange={(e) => {
          add(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />

      {items.length > 0 && (
        <ul className="mt-3 divide-y divide-(--hair)" aria-live="polite">
          {items.map((it) => (
            <UploadRow
              key={it.key}
              it={it}
              onRetry={() => void send(it)}
              onDismiss={() => setItems((xs) => xs.filter((x) => x.key !== it.key))}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function UploadRow({ it, onRetry, onDismiss }: { it: Item; onRetry: () => void; onDismiss: () => void }) {
  const pct = Math.round(it.progress * 100);
  return (
    <li className="py-3">
      <div className="flex items-center gap-3">
        <span
          className={[
            "grid size-8 shrink-0 place-items-center rounded-full",
            it.state === "failed" ? "bg-(--short-soft) text-(--short)" : "bg-(--wash) text-(--ink)",
          ].join(" ")}
          aria-hidden
        >
          {it.state === "failed" ? (
            <AlertTriangle className="size-4" strokeWidth={2.5} />
          ) : it.state === "running" ? (
            <Check className="size-4" strokeWidth={2.75} />
          ) : (
            <Spinner className="size-4" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold">{it.file.name}</span>
          <span className="block text-[12.5px] text-(--ink-3) tabular">
            {it.handle} · {(it.file.size / 1024 / 1024).toFixed(1)} MB
            {it.state === "uploading" && <> · Uploading {pct}%</>}
            {it.state === "starting" && " · Starting the check…"}
            {it.state === "running" && " · Added. Checking now, see the list"}
          </span>
        </span>
        {it.state === "failed" && (
          <span className="flex shrink-0 gap-1">
            {!it.local && (
            <button
              type="button"
              onClick={onRetry}
              aria-label={`Try ${it.file.name} again`}
              className="ed-press grid size-11 cursor-pointer place-items-center rounded-full text-(--ink) active:bg-(--wash)"
            >
              <RotateCcw className="size-[18px]" strokeWidth={2.25} aria-hidden />
            </button>
            )}
            <button
              type="button"
              onClick={onDismiss}
              aria-label={`Remove ${it.file.name}`}
              className="ed-press grid size-11 cursor-pointer place-items-center rounded-full text-(--ink-3) active:bg-(--wash)"
            >
              <X className="size-[18px]" strokeWidth={2.25} aria-hidden />
            </button>
          </span>
        )}
      </div>
      {(it.state === "uploading" || it.state === "starting") && (
        <div
          className="mt-2 ml-11 h-1.5 overflow-hidden rounded-full bg-(--wash)"
          role="progressbar"
          aria-label={`Uploading ${it.file.name}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <div
            className="h-full rounded-full bg-(--ink) transition-[width] duration-200 ease-out"
            style={{ width: `${Math.max(4, pct)}%` }}
          />
        </div>
      )}
      {it.state === "failed" && it.error && (
        <p className="mt-1.5 ml-11 text-[13px] leading-snug">
          <ApiError message={it.error} />
        </p>
      )}
    </li>
  );
}

function errorOf(body: unknown): string | undefined {
  return body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : undefined;
}

/** fetch() cannot report upload progress, so the direct (multipart) upload uses XHR; same request otherwise. */
function postWithProgress(url: string, body: FormData, onProgress: (fraction: number) => void) {
  return new Promise<{ ok: boolean; status: number; body: unknown }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(xhr.responseText);
      } catch {}
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, body: parsed });
    };
    xhr.onerror = () => reject(new Error("Upload failed: the connection dropped. Try again."));
    xhr.send(body);
  });
}
