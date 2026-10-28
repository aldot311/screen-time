import { readdir } from "node:fs/promises";
import { relative } from "node:path";
import { devOnly, VIDEOS_DIR } from "@/lib/dev/files";

export async function GET() {
  const blocked = devOnly();
  if (blocked) return blocked;
  const entries = await readdir(VIDEOS_DIR, { recursive: true });
  const ids = entries
    .filter((f) => f.endsWith(".mp4"))
    .map((f) => relative(VIDEOS_DIR, `${VIDEOS_DIR}/${f}`).replace(/\.mp4$/, ""))
    .sort();
  return Response.json(ids);
}
