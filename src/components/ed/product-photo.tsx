"use client";

// The product photo: the campaign's cover, and the reference Muse Spark compares each find with.
//  - ProductPhotoField: the optional picker on the new-campaign form (tap to choose, preview, replace or remove).
//  - CampaignCover: the cover beside the brand name on the campaign page, or a placeholder that adds one.
// Both upload through uploadProductPhoto: Vercel Blob client upload + JSON { url } when the server has a Blob store
// ("blob"), multipart `file` otherwise ("direct"), the same split as upload-videos.tsx.
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, ImagePlus, RefreshCw, Trash2 } from "lucide-react";
import type { Campaign } from "@/lib/campaign/types";
import { ApiError } from "@/components/api-error";
import { Spinner } from "./pending-link";
import { postWithProgress } from "./upload-videos";

export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const PHOTO_MAX_BYTES = 8 * 1024 * 1024;
const ACCEPT = PHOTO_TYPES.join(",");

/** A reason the file cannot be the product photo, or null when it can. */
export function checkPhoto(file: File): string | null {
  if (!(PHOTO_TYPES as readonly string[]).includes(file.type)) return "Use a JPEG, PNG or WebP photo.";
  if (file.size > PHOTO_MAX_BYTES) return `This photo is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is 8 MB.`;
  if (file.size === 0) return "This file is empty. Choose another photo.";
  return null;
}

/** campaigns/<id>/files/product-<safe>.<jpg|png|webp>, the pathname the photo API accepts from a Blob upload. */
function photoPathname(campaignId: string, file: File) {
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const base =
    file.name
      .replace(/\.[^.]+$/, "")
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "photo";
  return `campaigns/${campaignId}/files/product-${base}.${ext}`;
}

const errorOf = (body: unknown, status: number) =>
  (body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : null) ??
  `The photo did not upload (${status}).`;

/** Uploads the photo and attaches it to the campaign. Resolves with the updated campaign; throws a readable Error. */
export async function uploadProductPhoto(
  campaignId: string,
  file: File,
  mode: "blob" | "direct",
  onProgress: (fraction: number) => void,
): Promise<Campaign> {
  const url = `/api/campaigns/${campaignId}/photo`;
  if (mode === "blob") {
    const { upload } = await import("@vercel/blob/client");
    const blob = await upload(photoPathname(campaignId, file), file, {
      access: "public",
      handleUploadUrl: "/api/blob-upload",
      clientPayload: campaignId,
      onUploadProgress: (e) => onProgress(e.percentage / 100),
    });
    onProgress(1);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: blob.url }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(errorOf(body, res.status));
    return body as Campaign;
  }
  const form = new FormData();
  form.set("file", file);
  const res = await postWithProgress(url, form, onProgress);
  if (!res.ok) throw new Error(errorOf(res.body, res.status));
  return res.body as Campaign;
}

/** A local preview URL for a picked file, made when the file is picked. */
function usePreview() {
  const [src, setSrc] = useState<string | null>(null);
  // A preview is freed when it is replaced and when the component goes away.
  useEffect(() => () => void (src && URL.revokeObjectURL(src)), [src]);
  const set = (file: File | null) => setSrc(file ? URL.createObjectURL(file) : null);
  return [src, set] as const;
}

const SECONDARY =
  "ed-press inline-flex h-11 cursor-pointer items-center justify-center gap-1.5 rounded-full bg-(--card) px-4 text-[14px] font-semibold text-(--ink) shadow-(--sh-1) ring-1 ring-(--hair-2) active:bg-(--wash) disabled:cursor-wait disabled:opacity-60 [@media(hover:hover)]:hover:ring-(--ink-3)";

/** The optional photo on the new-campaign form. The file stays in the browser until the campaign exists. */
export function ProductPhotoField({ file, onChange }: { file: File | null; onChange: (file: File | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const [error, setError] = useState<string | null>(null);
  const [src, setPreview] = usePreview();

  function pick(f: File | undefined) {
    if (!f) return;
    const problem = checkPhoto(f);
    setError(problem);
    if (problem) return;
    setPreview(f);
    onChange(f);
  }

  return (
    <div>
      <p className="flex items-baseline gap-2 text-[15px] font-semibold">
        Product photo <span className="text-[12.5px] font-normal text-(--ink-3)">Optional</span>
      </p>
      <p id={hintId} className="mt-1 max-w-[62ch] text-[13.5px] leading-snug text-(--ink-3)">
        A clear photo of the product. It becomes the campaign&rsquo;s cover, and Muse Spark compares each find with it as well as
        with your description. JPEG, PNG or WebP, up to 8 MB.
      </p>
      <div className="mt-2.5 flex items-center gap-4">
        <button
          type="button"
          onClick={() => input.current?.click()}
          aria-describedby={hintId}
          aria-label={file ? `Replace the product photo, ${file.name}` : "Choose a product photo"}
          className={[
            "ed-press relative grid size-[104px] shrink-0 cursor-pointer place-items-center overflow-hidden rounded-[18px] active:bg-(--wash)",
            file ? "bg-(--wash) shadow-(--sh-1) ring-1 ring-(--hair)" : "border-[1.5px] border-dashed border-(--hair-2) bg-(--card) [@media(hover:hover)]:hover:border-(--ink-3)",
          ].join(" ")}
        >
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element -- a local object URL preview
            <img src={src} alt="" className="size-full object-cover" />
          ) : (
            <span className="flex flex-col items-center gap-1.5 text-(--ink-2)">
              <ImagePlus className="size-6" strokeWidth={1.75} aria-hidden />
              <span className="text-[12.5px] font-semibold">Add photo</span>
            </span>
          )}
        </button>
        {file ? (
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold">{file.name}</p>
            <p className="text-[12.5px] text-(--ink-3) tabular">
              {file.size < 1024 * 1024 ? `${Math.max(1, Math.round(file.size / 1024))} KB` : `${(file.size / 1024 / 1024).toFixed(1)} MB`} · uploads when you create the campaign
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => input.current?.click()} className={SECONDARY}>
                <RefreshCw className="size-4" strokeWidth={2.25} aria-hidden />
                Replace
              </button>
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setPreview(null);
                  setError(null);
                }}
                className="ed-press inline-flex h-11 cursor-pointer items-center justify-center gap-1.5 rounded-full px-3 text-[14px] font-semibold text-(--ink-2) active:bg-(--wash) [@media(hover:hover)]:hover:bg-(--wash) [@media(hover:hover)]:hover:text-(--ink)"
              >
                <Trash2 className="size-4" strokeWidth={2.25} aria-hidden />
                Remove
              </button>
            </div>
          </div>
        ) : (
          <p className="max-w-[30ch] text-[13.5px] leading-snug text-(--ink-2)">
            Tap to choose one. The product on its own, in good light, works best.
          </p>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 flex items-start gap-1.5 text-[14px] leading-snug font-medium text-(--short)">
          <CircleAlert className="mt-px size-[17px] shrink-0" strokeWidth={2.25} aria-hidden />
          {error}
        </p>
      )}
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/**
 * The campaign's cover beside the brand name. With a photo it is the photo (tap to replace when editable); without
 * one, a placeholder that uploads one. Progress shows on the tile itself; errors show under the header.
 */
export function CampaignCover({
  campaignId,
  brand,
  url,
  mode,
  editable,
  failedOnCreate = false,
  children,
}: {
  campaignId: string;
  brand: string;
  url?: string;
  mode: "blob" | "direct";
  editable: boolean;
  /** The new-campaign form created the campaign but its photo did not upload. */
  failedOnCreate?: boolean;
  /** The title block that sits beside the cover. */
  children: ReactNode;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(
    failedOnCreate && !url ? "The campaign was created, but its product photo did not upload. Add it again here." : null,
  );
  const [preview, setPreview] = usePreview();
  const busy = progress !== null;
  const shown = preview ?? url;

  async function send(file: File | undefined) {
    if (!file || busy) return;
    const problem = checkPhoto(file);
    if (problem) return setError(problem);
    setError(null);
    setPreview(file);
    setProgress(0);
    try {
      await uploadProductPhoto(campaignId, file, mode, setProgress);
      router.refresh();
    } catch (e) {
      setPreview(null);
      setError(e instanceof Error ? e.message : "The photo did not upload.");
    } finally {
      setProgress(null);
    }
  }

  const tile = "relative block size-[72px] shrink-0 overflow-hidden rounded-[18px] sm:size-[104px] sm:rounded-[22px]";
  const image = shown ? (
    // eslint-disable-next-line @next/next/no-img-element -- the stored product photo (or a local preview while it uploads)
    <img src={shown} alt={`${brand} product`} className="size-full object-cover" />
  ) : null;
  const overlay = busy && (
    <span className="absolute inset-0 grid place-items-center bg-[rgb(20_19_15/0.42)] text-white" role="status">
      <span className="flex flex-col items-center gap-1">
        <Spinner className="size-5" />
        <span className="text-[12px] font-semibold tabular">{Math.round((progress ?? 0) * 100)}%</span>
      </span>
      <span className="sr-only">Uploading the product photo</span>
    </span>
  );

  const row = (cover: ReactNode) => (
    <div className="flex items-center gap-4 sm:gap-5">
      {cover}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );

  if (!editable) return row(shown ? <span className={`${tile} bg-(--wash) shadow-(--sh-1) ring-1 ring-(--hair)`}>{image}</span> : null);

  return (
    <div>
      {row(
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        aria-busy={busy}
        aria-label={shown ? "Replace the product photo" : "Add product photo"}
        className={[
          "ed-press group cursor-pointer disabled:cursor-wait",
          tile,
          shown
            ? "bg-(--wash) shadow-(--sh-1) ring-1 ring-(--hair)"
            : "grid place-items-center border-[1.5px] border-dashed border-(--hair-2) bg-(--card) text-(--ink-2) active:bg-(--wash) [@media(hover:hover)]:hover:border-(--ink-3) [@media(hover:hover)]:hover:text-(--ink)",
        ].join(" ")}
      >
        {image ?? (
          <span className="flex flex-col items-center gap-1 px-1 text-center">
            <ImagePlus className="size-5 sm:size-6" strokeWidth={1.75} aria-hidden />
            <span className="text-[11px] leading-tight font-semibold sm:text-[12.5px]">
              Add product
              <br />
              photo
            </span>
          </span>
        )}
        {shown && !busy && (
          <span
            aria-hidden
            className="absolute right-1.5 bottom-1.5 grid size-7 place-items-center rounded-full bg-(--card)/95 text-(--ink) shadow-(--sh-1) transition-opacity duration-150 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-visible:opacity-100"
          >
            <RefreshCw className="size-3.5" strokeWidth={2.5} />
          </span>
        )}
        {overlay}
      </button>,
      )}
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          void send(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {error && <CoverError message={error} />}
    </div>
  );
}

/** The cover's error sits under the whole header row, not squeezed into the tile's column. */
function CoverError({ message }: { message: string }) {
  return (
    <p role="alert" className="mt-3 flex max-w-[60ch] items-start gap-1.5 rounded-(--r-ctl) bg-(--short-soft) px-3 py-2 text-[13.5px] leading-snug font-medium">
      <CircleAlert className="mt-px size-4 shrink-0 text-(--short)" strokeWidth={2.25} aria-hidden />
      <ApiError message={message} />
    </p>
  );
}
