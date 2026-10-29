// Campaigns and videos as JSON documents, plus video files. Local filesystem under data/store/ in dev; Vercel Blob
// when BLOB_READ_WRITE_TOKEN is set. Keys are built only from validated ids, so nothing can escape the store root.
// The synthetic preview campaign is served from code and is read-only.
import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { BlobNotFoundError, BlobPreconditionFailedError, del, get, head, list, put } from "@vercel/blob";
import type { LedgerEntry } from "@/lib/meta/cost-guard";
import { ownBlobHost } from "./schema";
import { PREVIEW_ID, previewCampaign, previewVideos } from "./preview";
import type { Campaign, VideoEntry } from "./types";

/** Lowercase letters, digits and inner hyphens, 1-64 chars: safe in URLs, file names and blob paths. */
export const ID_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

export class InvalidIdError extends Error {
  constructor(what: string, id: string) {
    super(`Invalid ${what} id: ${JSON.stringify(id)}`);
    this.name = "InvalidIdError";
  }
}

export class ReadOnlyError extends Error {
  constructor() {
    super("The preview campaign is read-only");
    this.name = "ReadOnlyError";
  }
}

export const isValidId = (id: unknown): id is string => typeof id === "string" && ID_RE.test(id);

function assertId(what: string, id: string): void {
  if (!isValidId(id)) throw new InvalidIdError(what, id);
}

/** "Alani Nu: Fall creators!" -> "alani-nu-fall-creators"; never empty. */
export function slugify(text: string, maxLength = 48): string {
  const slug = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // accents split off by NFKD
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, maxLength)
    .replace(/^-+|-+$/g, "");
  return slug || "item";
}

export const randomSuffix = () => Math.random().toString(36).slice(2, 8).padEnd(6, "0");

export type FileBody = Uint8Array | ReadableStream<Uint8Array> | Readable;

export interface Backend {
  readonly kind: "local" | "blob";
  readJson(key: string): Promise<unknown | null>;
  writeJson(key: string, value: unknown): Promise<void>;
  /** Writes `value` only if `key` does not exist yet; false when it already did. Atomic on both backends. */
  createJson(key: string, value: unknown): Promise<boolean>;
  /**
   * Read-modify-write of one document that never loses a concurrent update: `mutate` gets the current value and
   * returns the new one (it may run more than once, so it must not have side effects). Null when there is no document.
   */
  updateJson<T>(key: string, mutate: (current: T) => T | Promise<T>): Promise<T | null>;
  removeJson(key: string): Promise<void>;
  /** Size and type of a stored file by its URL, or null when there is no such file. */
  fileInfo(url: string): Promise<{ size: number; contentType: string } | null>;
  listKeys(prefix: string): Promise<string[]>;
  /** Stores a file and returns a URL the browser can fetch. */
  putFile(key: string, body: FileBody, contentType: string): Promise<string>;
}

// ---------- local backend ----------

export const LOCAL_FILE_ROUTE = "/api/store/file";

export function localStoreRoot(): string {
  return resolve(process.env.SCREEN_TIME_STORE_DIR ?? join(process.cwd(), "data", "store"));
}

/** Absolute path for a store key, or null if it could escape the root. */
export function localPath(root: string, key: string): string | null {
  if (!key || key.includes("\0") || key.split("/").some((p) => !p || p === "." || p === "..")) return null;
  const full = resolve(root, key);
  return full.startsWith(root + sep) ? full : null;
}

/** The local file a dev URL from putFile points at, or null for any other URL. */
export function localFileFromUrl(url: string, root = localStoreRoot()): string | null {
  if (!url.startsWith(`${LOCAL_FILE_ROUTE}?`)) return null;
  const key = new URLSearchParams(url.slice(LOCAL_FILE_ROUTE.length + 1)).get("path") ?? "";
  return isFileKey(key) ? localPath(root, key) : null;
}

/** Only files written by saveVideoFile and saveImageFile are servable: campaigns/<id>/files/<video id or
 *  "campaign">/<name>.<ext>. Campaign-wide files (the product photo) use the folder name "campaign", which no video id
 *  can take (video ids always end in a random suffix). */
export const FILE_KEY_RE = /^campaigns\/[a-z0-9-]+\/files\/[a-z0-9-]+\/[a-z0-9-]+\.(mp4|mov|jpg|jpeg|png|webp)$/;
export const isFileKey = (key: string) => FILE_KEY_RE.test(key);

/** The folder for files that belong to the campaign rather than one video. */
export const CAMPAIGN_FILES = "campaign";

/** Content type of a stored file by its extension. */
export const FILE_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

let tmpCounter = 0;

// Local read-modify-writes of one file run one after another within this process (dev runs a single process).
const localQueues = new Map<string, Promise<unknown>>();

function queued<T>(path: string, task: () => Promise<T>): Promise<T> {
  const run = (localQueues.get(path) ?? Promise.resolve()).catch(() => undefined).then(task);
  const tail = run.catch(() => undefined);
  localQueues.set(path, tail);
  void tail.then(() => {
    if (localQueues.get(path) === tail) localQueues.delete(path);
  });
  return run;
}

export function localBackend(root = localStoreRoot()): Backend {
  const pathOf = (key: string) => {
    const p = localPath(root, key);
    if (!p) throw new InvalidIdError("store key", key);
    return p;
  };
  // Write to a temp name and rename, so a reader never sees half a document or half a video.
  const atomic = async (key: string, write: (tmp: string) => Promise<void>) => {
    const path = pathOf(key);
    await mkdir(dirname(path), { recursive: true });
    const tmp = `${path}.${process.pid}.${++tmpCounter}.tmp`;
    try {
      await write(tmp);
      await rename(tmp, path);
    } catch (err) {
      await rm(tmp, { force: true });
      throw err;
    }
  };
  const readJson = async (key: string): Promise<unknown | null> => {
    try {
      return JSON.parse(await readFile(pathOf(key), "utf8"));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  };
  const writeJson = (key: string, value: unknown) => atomic(key, (tmp) => writeFile(tmp, JSON.stringify(value, null, 2)));
  return {
    kind: "local",
    readJson,
    writeJson,
    updateJson: <T,>(key: string, mutate: (current: T) => T | Promise<T>) =>
      queued(pathOf(key), async () => {
        const current = (await readJson(key)) as T | null;
        if (current === null) return null;
        const next = await mutate(current);
        await writeJson(key, next);
        return next;
      }),
    removeJson: (key) => rm(pathOf(key), { force: true }),
    async fileInfo(url) {
      const path = localFileFromUrl(url, root);
      const info = path ? await stat(path).catch(() => null) : null;
      if (!info?.isFile()) return null;
      return { size: info.size, contentType: FILE_TYPES[path!.split(".").at(-1)!.toLowerCase()] ?? "application/octet-stream" };
    },
    async createJson(key, value) {
      const path = pathOf(key);
      await mkdir(dirname(path), { recursive: true });
      try {
        await writeFile(path, JSON.stringify(value), { flag: "wx" });
        return true;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "EEXIST") return false;
        throw err;
      }
    },
    async listKeys(prefix) {
      const dir = pathOf(prefix.replace(/\/$/, ""));
      const names = await readdir(dir, { recursive: true }).catch((err: NodeJS.ErrnoException) => {
        if (err.code === "ENOENT") return [] as string[];
        throw err;
      });
      return names.map((n) => `${prefix.replace(/\/$/, "")}/${n.split(sep).join("/")}`);
    },
    async putFile(key, body) {
      await atomic(key, async (tmp) => {
        if (body instanceof Uint8Array) return writeFile(tmp, body);
        const source = body instanceof Readable ? body : Readable.fromWeb(body as import("node:stream/web").ReadableStream);
        await pipeline(source, createWriteStream(tmp));
      });
      return `${LOCAL_FILE_ROUTE}?path=${encodeURIComponent(key)}`;
    },
  };
}

// ---------- Vercel Blob backend ----------

// Public access so the browser can play videos straight from the Blob CDN. Video paths get a random suffix, so
// their URLs are unguessable; JSON documents use fixed paths and are readable by anyone who knows the store URL.
const ACCESS = "public" as const;

/**
 * Reads a JSON document past the CDN, uncompressed. The SDK honors useCache: false only for private blobs; a public read can serve a
 * copy up to cacheControlMaxAge old, so a poll would miss a status just written and an ETag update would retry on the
 * old version until it gave up. A one-off query string is always a cache miss.
 */
function getFresh(key: string) {
  const host = ownBlobHost();
  const target = host ? `https://${host}/${key}?fresh=${crypto.randomUUID()}` : key;
  // Uncompressed: a compressed response carries a weak ETag (W/"..."), which an ifMatch write never matches.
  return get(target, { access: ACCESS, useCache: false, headers: { "accept-encoding": "identity" } });
}

/** The strong form of an ETag (a weak W/ prefix dropped), as ifMatch needs it. */
export const strongEtag = (etag: string) => etag.replace(/^W\//, "");

const UPDATE_ATTEMPTS = 5;

export function blobBackend(): Backend {
  return {
    kind: "blob",
    async readJson(key) {
      const res = await getFresh(key);
      if (!res || res.statusCode !== 200) return null;
      return JSON.parse(await new Response(res.stream).text());
    },
    async writeJson(key, value) {
      await put(key, JSON.stringify(value), {
        access: ACCESS,
        allowOverwrite: true,
        addRandomSuffix: false,
        contentType: "application/json",
        cacheControlMaxAge: 60,
      });
    },
    // Optimistic concurrency: write only if the document is still the version read (its ETag), else read and retry.
    async updateJson<T>(key: string, mutate: (current: T) => T | Promise<T>): Promise<T | null> {
      for (let attempt = 0; attempt < UPDATE_ATTEMPTS; attempt++) {
        const res = await getFresh(key);
        if (!res || res.statusCode !== 200) return null;
        const next = await mutate(JSON.parse(await new Response(res.stream).text()) as T);
        try {
          await put(key, JSON.stringify(next), {
            access: ACCESS,
            addRandomSuffix: false,
            ifMatch: strongEtag(res.blob.etag),
            contentType: "application/json",
            cacheControlMaxAge: 60,
          });
          return next;
        } catch (err) {
          if (!(err instanceof BlobPreconditionFailedError)) throw err;
        }
      }
      throw new Error("The campaign was being changed by someone else at the same time. Try again.");
    },
    async createJson(key, value) {
      try {
        await put(key, JSON.stringify(value), {
          access: ACCESS,
          allowOverwrite: false,
          addRandomSuffix: false,
          contentType: "application/json",
        });
        return true;
      } catch (err) {
        // Blob refuses to overwrite an existing pathname when allowOverwrite is false.
        if (err instanceof BlobPreconditionFailedError || (err instanceof Error && /already exists/i.test(err.message))) return false;
        throw err;
      }
    },
    async removeJson(key) {
      await del(key);
    },
    async fileInfo(url) {
      try {
        const h = await head(url);
        return { size: h.size, contentType: h.contentType };
      } catch (err) {
        if (err instanceof BlobNotFoundError) return null;
        throw err;
      }
    },
    async listKeys(prefix) {
      const keys: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await list({ prefix, cursor, limit: 1000 });
        keys.push(...page.blobs.map((b) => b.pathname));
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
      return keys;
    },
    async putFile(key, body, contentType) {
      const res = await put(key, body as Parameters<typeof put>[1], {
        access: ACCESS,
        addRandomSuffix: true,
        contentType,
        multipart: !(body instanceof Uint8Array),
      });
      return res.url;
    },
  };
}

export const usingBlob = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

/** Chosen per call, so tests and scripts can switch backends through the environment. */
export const backend = (): Backend => (usingBlob() ? blobBackend() : localBackend());

// ---------- campaigns and videos ----------

const campaignKey = (id: string) => `campaigns/${id}/campaign.json`;
const videoKey = (campaignId: string, id: string) => `campaigns/${campaignId}/videos/${id}.json`;

export async function listCampaigns(): Promise<Campaign[]> {
  const keys = await backend().listKeys("campaigns/");
  const ids = keys.map((k) => /^campaigns\/([^/]+)\/campaign\.json$/.exec(k)?.[1]).filter(isValidId);
  const stored = (await Promise.all(ids.map((id) => getCampaign(id)))).filter((c): c is Campaign => c !== null);
  stored.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  // The labelled preview fills an empty store; once real runs exist it would sit beside them with different numbers.
  return stored.length ? stored : [previewCampaign()];
}

export async function getCampaign(id: string): Promise<Campaign | null> {
  if (id === PREVIEW_ID) return previewCampaign();
  if (!isValidId(id)) return null;
  return (await backend().readJson(campaignKey(id))) as Campaign | null;
}

export async function putCampaign(c: Campaign): Promise<Campaign> {
  assertId("campaign", c.id);
  if (c.id === PREVIEW_ID) throw new ReadOnlyError();
  await backend().writeJson(campaignKey(c.id), c);
  return c;
}

/**
 * Changes a stored campaign without losing a change made at the same moment (by another request or instance).
 * `mutate` may run more than once and must not have side effects. Null when the campaign does not exist.
 */
export async function updateCampaign(id: string, mutate: (c: Campaign) => Campaign | Promise<Campaign>): Promise<Campaign | null> {
  if (id === PREVIEW_ID) throw new ReadOnlyError();
  if (!isValidId(id)) return null;
  return backend().updateJson<Campaign>(campaignKey(id), async (c) => {
    const next = await mutate(c);
    if (next.id !== id) throw new Error("A campaign update cannot change its id");
    return next;
  });
}

export async function listVideos(campaignId: string): Promise<VideoEntry[]> {
  if (campaignId === PREVIEW_ID) return previewVideos();
  if (!isValidId(campaignId)) return [];
  const keys = await backend().listKeys(`campaigns/${campaignId}/videos/`);
  const ids = keys.map((k) => /\/videos\/([^/]+)\.json$/.exec(k)?.[1]).filter(isValidId);
  const videos = (await Promise.all(ids.map((id) => getVideo(campaignId, id)))).filter(
    (v): v is VideoEntry => v !== null,
  );
  return videos.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getVideo(campaignId: string, videoId: string): Promise<VideoEntry | null> {
  if (campaignId === PREVIEW_ID) return previewVideos().find((v) => v.id === videoId) ?? null;
  if (!isValidId(campaignId) || !isValidId(videoId)) return null;
  return (await backend().readJson(videoKey(campaignId, videoId))) as VideoEntry | null;
}

/** Saves the entry with a fresh updatedAt and returns what was stored. */
export async function putVideo(v: VideoEntry): Promise<VideoEntry> {
  assertId("campaign", v.campaignId);
  assertId("video", v.id);
  if (v.campaignId === PREVIEW_ID) throw new ReadOnlyError();
  const saved = { ...v, updatedAt: new Date().toISOString() };
  await backend().writeJson(videoKey(v.campaignId, v.id), saved);
  return saved;
}

/** Read-modify-write of one video entry, safe against a concurrent write (ETag on Blob, a queue locally). */
export async function updateVideo(
  campaignId: string,
  videoId: string,
  mutate: (v: VideoEntry) => VideoEntry | Promise<VideoEntry>,
): Promise<VideoEntry | null> {
  if (campaignId === PREVIEW_ID) throw new ReadOnlyError();
  if (!isValidId(campaignId) || !isValidId(videoId)) return null;
  return backend().updateJson<VideoEntry>(videoKey(campaignId, videoId), async (v) => {
    const next = await mutate(v);
    if (next.id !== videoId || next.campaignId !== campaignId) throw new Error("A video update cannot change its id");
    return { ...next, updatedAt: new Date().toISOString() };
  });
}

const EXTENSIONS: Record<string, string> = { "video/mp4": "mp4", "video/quicktime": "mov" };

/** Stores a video file ("source" upload or "normalized" copy) and returns its playable URL. */
export async function saveVideoFile(
  campaignId: string,
  videoId: string,
  body: FileBody,
  contentType: string,
  name = "source",
): Promise<string> {
  const ext = EXTENSIONS[contentType];
  if (!ext) throw new Error(`Unsupported video type ${contentType}`);
  return saveFile(campaignId, videoId, name, ext, body, contentType);
}

const IMAGE_EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Stores a still (a video's thumbnail or a product crop, or with videoId CAMPAIGN_FILES the product photo) and
 *  returns its URL. JPEG unless another image type is given. */
export async function saveImageFile(
  campaignId: string,
  videoId: string,
  name: string,
  body: Uint8Array,
  contentType = "image/jpeg",
): Promise<string> {
  const ext = IMAGE_EXTENSIONS[contentType];
  if (!ext) throw new Error(`Unsupported image type ${contentType}`);
  return saveFile(campaignId, videoId, name, ext, body, contentType);
}

async function saveFile(campaignId: string, videoId: string, name: string, ext: string, body: FileBody, contentType: string) {
  assertId("campaign", campaignId);
  assertId("video", videoId);
  assertId("file", name);
  if (campaignId === PREVIEW_ID) throw new ReadOnlyError();
  return backend().putFile(`campaigns/${campaignId}/files/${videoId}/${name}.${ext}`, body, contentType);
}

// ---------- cost ledger ----------

const LEDGER_KEY = "ledger.json";

/**
 * Runs `fn` with a ledger file path for a CostGuard. Locally that is data/store/ledger.json, shared by every run in
 * this process (the guard serializes writes per file). On Blob the ledger is copied to a temp file, the run spends
 * against that copy, and its new entries are appended to the latest Blob ledger afterwards. Two instances running
 * at once each check the total cap against their own copy, so the total cap is approximate there: concurrent runs
 * can together overshoot it by up to one per-video budget each. The per-video cap is exact.
 */
export async function withLedgerFile<T>(fn: (ledgerPath: string) => Promise<T>): Promise<T> {
  const store = backend();
  if (store.kind === "local") return fn(join(localStoreRoot(), LEDGER_KEY));

  const dir = await mkdtemp(join(tmpdir(), "st-ledger-"));
  const path = join(dir, LEDGER_KEY);
  const seeded = ((await store.readJson(LEDGER_KEY)) as LedgerEntry[] | null) ?? [];
  await writeFile(path, JSON.stringify(seeded));
  try {
    return await fn(path);
  } finally {
    const after = JSON.parse(await readFile(path, "utf8")) as LedgerEntry[];
    const added = after.slice(seeded.length);
    if (added.length) {
      const latest = ((await store.readJson(LEDGER_KEY)) as LedgerEntry[] | null) ?? [];
      await store.writeJson(LEDGER_KEY, [...latest, ...added]);
    }
    await rm(dir, { recursive: true, force: true });
  }
}

// ---------- request links ----------

const requestKey = (nonce: string) => `requests/${nonce}.json`;

/** Marks a request link's one-time id as used; false if it already was. */
export function claimRequest(nonce: string, videoId: string): Promise<boolean> {
  return backend().createJson(requestKey(nonce), { videoId, at: new Date().toISOString() });
}

export async function requestUsed(nonce: string): Promise<boolean> {
  return (await backend().readJson(requestKey(nonce))) !== null;
}

/** Gives a link back when storing its video failed after the claim, so the creator can try again. */
export function releaseRequest(nonce: string): Promise<void> {
  return backend().removeJson(requestKey(nonce));
}

/** Upload tokens a request link may mint: enough for a retry or two, never a way to fill the store. */
export const REQUEST_UPLOAD_SLOTS = 3;

export async function takeUploadSlot(nonce: string): Promise<boolean> {
  for (let i = 1; i <= REQUEST_UPLOAD_SLOTS; i++) {
    if (await backend().createJson(`requests/${nonce}-upload-${i}.json`, { at: new Date().toISOString() })) return true;
  }
  return false;
}

export function storedFileInfo(url: string) {
  return backend().fileInfo(url);
}

// ---------- small documents for rate limits and one-time setup ----------

/**
 * Takes the first free of `max` numbered slots under `prefix` (each slot is a document created only if absent, so
 * two requests never get the same one). False when all are taken: the limit is reached.
 */
export async function takeSlot(prefix: string, max: number): Promise<boolean> {
  for (let i = 1; i <= max; i++) {
    if (await backend().createJson(`${prefix}-${i}.json`, { at: new Date().toISOString() })) return true;
  }
  return false;
}

export function readDoc<T>(key: string): Promise<T | null> {
  return backend().readJson(key) as Promise<T | null>;
}

/** Creates the document only if it does not exist yet; false when it already did. */
export function createDoc(key: string, value: unknown): Promise<boolean> {
  return backend().createJson(key, value);
}
