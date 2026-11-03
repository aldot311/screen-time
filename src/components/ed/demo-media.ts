// The landing page's demo video. It is embedded once public/demo.mp4 exists, with public/demo-poster.jpg as its poster
// (else the hero's still) and public/demo.vtt as its captions when present; until then the section shows the script
// and a labelled placeholder. Checked on the server with fs on each render, never fetched by the browser. The paths are
// written out in full so the build's file tracing ships the files with the page (on Vercel, public/ is otherwise only
// on the CDN, not beside the function).
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface DemoMedia {
  src: string;
  poster?: string;
  captions?: string;
}

/** The video's URLs from which of its files exist; null without the video itself. */
export function demoMediaFrom(found: { video: boolean; poster: boolean; captions: boolean }, fallbackPoster?: string): DemoMedia | null {
  if (!found.video) return null;
  return {
    src: "/demo.mp4",
    poster: found.poster ? "/demo-poster.jpg" : fallbackPoster,
    captions: found.captions ? "/demo.vtt" : undefined,
  };
}

export function demoMedia(fallbackPoster?: string): DemoMedia | null {
  return demoMediaFrom(
    {
      video: existsSync(join(process.cwd(), "public", "demo.mp4")),
      poster: existsSync(join(process.cwd(), "public", "demo-poster.jpg")),
      captions: existsSync(join(process.cwd(), "public", "demo.vtt")),
    },
    fallbackPoster,
  );
}
