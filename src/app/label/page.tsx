import { notFound } from "next/navigation";
import checklist from "../../../data/labels/lacroix/checklist.json";
import { localFilesOpen } from "@/lib/dev/files";
import { LabelTool } from "./label-tool";

// The labelling tool reads and writes files under data/, so it exists only where its API routes do: under `pnpm dev`,
// or a local build with SCREEN_TIME_LOCAL_FILES=1 (devOnly in lib/dev/files.ts). Anywhere else, 404. Decided per
// request, so the variable counts when the server starts, not when it was built.
export const dynamic = "force-dynamic";

export default function LabelPage() {
  if (!localFilesOpen()) notFound();
  return <LabelTool checklist={checklist.clips} />;
}
