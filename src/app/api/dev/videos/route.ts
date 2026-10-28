import { readdir } from "node:fs/promises";
import { relative } from "node:path";
import { devOnly, VIDEOS_DIR } from "@/lib/dev/files";

export async function GET() {
  const blocked = devOnly();
  if (blocked) return blocked;
  let entries: string[];
  try {
    entries = await readdir(VIDEOS_DIR, { recursive: true });
  } catch (e) {
    // A fresh clone has no data/videos yet: that is an empty list, not an error.
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return Response.json([]);
    throw e;
  }
  const ids = entries
    .filter((f) => f.endsWith(".mp4"))
    .map((f) => relative(VIDEOS_DIR, `${VIDEOS_DIR}/${f}`).replace(/\.mp4$/, ""))
    .sort();
  return Response.json(ids);
}
