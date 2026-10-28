import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { devOnly, parseRange } from "@/lib/dev/files";
import { isFileKey, localPath, localStoreRoot } from "@/lib/campaign/store";

const TYPES: Record<string, string> = { mp4: "video/mp4", mov: "video/quicktime" };

// Serves videos from the local store (dev only) with Range support, so the player can seek.
export async function GET(req: Request) {
  const blocked = devOnly();
  if (blocked) return blocked;
  const key = new URL(req.url).searchParams.get("path") ?? "";
  const path = isFileKey(key) ? localPath(localStoreRoot(), key) : null;
  if (!path) return new Response("Bad path", { status: 400 });
  const info = await stat(path).catch(() => null);
  if (!info?.isFile()) return new Response("Not found", { status: 404 });
  const size = info.size;
  const range = parseRange(req.headers.get("range"), size);
  if (range === "unsatisfiable") {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }
  const { start, end } = range ?? { start: 0, end: size - 1 };
  const body = size ? (Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream) : null;
  return new Response(body, {
    status: range ? 206 : 200,
    headers: {
      "Content-Type": TYPES[key.split(".").at(-1)!] ?? "application/octet-stream",
      "Accept-Ranges": "bytes",
      "Content-Length": String(size ? end - start + 1 : 0),
      ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
    },
  });
}
