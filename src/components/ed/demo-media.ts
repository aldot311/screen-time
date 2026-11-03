// The landing page's demo video: public/demo.mp4, with public/demo-poster.jpg as its poster (else the hero's still) and
// public/demo.vtt as its captions. DEMO_FILES says which of them are committed; set it in the same commit that adds the
// files. Until the video is there the section shows the script and a labelled placeholder. (A file check at request
// time would not work on Vercel: public/ is served from the CDN, not shipped beside the page's function.)

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

/** Which demo files are in public/. */
export const DEMO_FILES = { video: true, poster: true, captions: false };

export function demoMedia(fallbackPoster?: string): DemoMedia | null {
  return demoMediaFrom(DEMO_FILES, fallbackPoster);
}
