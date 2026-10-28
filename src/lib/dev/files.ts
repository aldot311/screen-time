// Local-only helpers for the labelling tool. Never reachable in production (see devOnly).
import { resolve, sep } from "node:path";

export const DATA_DIR = resolve(process.cwd(), "data");
export const VIDEOS_DIR = resolve(DATA_DIR, "videos");
export const LABELS_DIR = resolve(DATA_DIR, "labels");

const SAFE_ID = /^[a-z0-9_-]+(\/[a-z0-9_-]+)?$/i;

/** "stock/stock01" -> absolute path inside `root`, or null for anything that could escape it. */
export function safePath(root: string, id: string, ext: string): string | null {
  if (!SAFE_ID.test(id)) return null;
  const full = resolve(root, `${id}${ext}`);
  return full.startsWith(root + sep) ? full : null;
}

export function devOnly(): Response | null {
  return process.env.NODE_ENV === "development" ? null : new Response("Not found", { status: 404 });
}
