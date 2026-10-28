import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { devOnly, parseRange, safePath, VIDEOS_DIR } from "@/lib/dev/files";

// Serves a local clip with Range support so the browser can seek frame by frame.
export async function GET(req: Request) {
  const blocked = devOnly();
  if (blocked) return blocked;
  const path = safePath(VIDEOS_DIR, new URL(req.url).searchParams.get("id") ?? "", ".mp4");
  if (!path) return new Response("Bad id", { status: 400 });
  const info = await stat(path).catch(() => null);
  if (!info?.isFile()) return new Response("Not found", { status: 404 });
  const size = info.size;
  const range = parseRange(req.headers.get("range"), size);
  if (range === "unsatisfiable") {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }
  const { start, end } = range ?? { start: 0, end: size - 1 };
  // createReadStream rejects end < start, so an empty file gets an empty body.
  const body = size ? (Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream) : null;
  return new Response(body, {
    status: range ? 206 : 200,
    headers: {
      "Content-Type": "video/mp4",
      "Accept-Ranges": "bytes",
      "Content-Length": String(end - start + 1),
      ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
    },
  });
}
