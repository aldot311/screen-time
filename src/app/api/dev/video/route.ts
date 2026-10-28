import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { devOnly, safePath, VIDEOS_DIR } from "@/lib/dev/files";

// Serves a local clip with Range support so the browser can seek frame by frame.
export async function GET(req: Request) {
  const blocked = devOnly();
  if (blocked) return blocked;
  const path = safePath(VIDEOS_DIR, new URL(req.url).searchParams.get("id") ?? "", ".mp4");
  if (!path) return new Response("Bad id", { status: 400 });
  const size = (await stat(path)).size;
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.get("range") ?? "");
  const start = range?.[1] ? Number(range[1]) : 0;
  const end = range?.[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
  const body = Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream;
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
