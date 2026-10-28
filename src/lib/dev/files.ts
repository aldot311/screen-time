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

export type ByteRange = { start: number; end: number };

/**
 * Parses a single-range `Range` header against a file of `size` bytes (RFC 9110 §14.1.2).
 * Returns the inclusive byte range to serve, "unsatisfiable" for a well-formed range that misses the
 * file (send 416), or null when there is no usable range header (send the whole file with 200).
 */
export function parseRange(header: string | null, size: number): ByteRange | "unsatisfiable" | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? "");
  if (!m || (!m[1] && !m[2])) return null; // absent, multi-range or malformed: ignore it
  if (!m[1]) {
    // Suffix range: the last N bytes.
    const n = Number(m[2]);
    if (n === 0 || size === 0) return "unsatisfiable";
    return { start: Math.max(0, size - n), end: size - 1 };
  }
  const start = Number(m[1]);
  const last = m[2] ? Number(m[2]) : Infinity;
  if (last < start) return null; // invalid range-spec: the header is ignored
  if (start >= size) return "unsatisfiable";
  return { start, end: Math.min(last, size - 1) };
}
