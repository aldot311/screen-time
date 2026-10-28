import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { devOnly, LABELS_DIR, safePath } from "@/lib/dev/files";

const Target = z.object({
  name: z.string().regex(/^[a-z0-9-]+$/),
  prompt: z.string(), // the SAM concept prompt this target is tested with
  product: z.string(), // what the brand's product looks like
  brandTerms: z.array(z.string()).default([]),
  // Frames (at 15 fps) where the product is visible, as inclusive [start, end] ranges.
  ranges: z.array(z.tuple([z.number().int().min(0), z.number().int().min(0)])),
  notes: z.string().default(""),
});

// One file per clip; a clip can hold several products, each scored separately.
const Labels = z.object({
  id: z.string(),
  method: z.string().default(""),
  checkedBy: z.string().default(""),
  targets: z.array(Target),
});

function pathFor(id: string) {
  return safePath(LABELS_DIR, id, ".json");
}

export async function GET(req: Request) {
  const blocked = devOnly();
  if (blocked) return blocked;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const path = pathFor(id);
  if (!path) return new Response("Bad id", { status: 400 });
  try {
    return Response.json(JSON.parse(await readFile(path, "utf8")));
  } catch {
    return Response.json({ id, method: "", checkedBy: "", targets: [] });
  }
}

export async function POST(req: Request) {
  const blocked = devOnly();
  if (blocked) return blocked;
  const parsed = Labels.safeParse(await req.json());
  if (!parsed.success) return new Response(parsed.error.message, { status: 400 });
  const path = pathFor(parsed.data.id);
  if (!path) return new Response("Bad id", { status: 400 });
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(parsed.data, null, 2) + "\n");
  return Response.json({ ok: true });
}
