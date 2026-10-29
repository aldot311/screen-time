"use client";

// Eight frames of the video in a row, with the boxes SAM 3.1 drew on exactly those frames: what "SAM tracked 2
// objects" looks like. The frames are drawn from the video in the browser (one hidden element seeks to each in turn).
// Before Muse Spark has judged an object its box is plain white; then the brand's product turns lime and a
// look-alike dashed red, as on the player.
import { useEffect, useRef, useState } from "react";
import { filmstripFrames } from "@/lib/frames";
import { FPS, type Box, type VerifyVerdict } from "@/lib/types";

interface StripBox {
  frame: number;
  objectId: number;
  box: Box;
  verdict?: VerifyVerdict;
}

export function Filmstrip({
  videoUrl,
  frameCount,
  width,
  height,
  boxes,
  verdicts = {},
}: {
  videoUrl: string;
  frameCount: number;
  width: number;
  height: number;
  boxes: StripBox[];
  /** Muse Spark's verdict per objectId, once known. */
  verdicts?: Record<number, VerifyVerdict>;
}) {
  const frames = filmstripFrames(frameCount);
  const canvases = useRef<(HTMLCanvasElement | null)[]>([]);
  const [drawn, setDrawn] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.setAttribute("playsinline", "");
    // In the document but out of sight: WebKit does not load or seek a detached video reliably.
    video.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-10px;top:0";
    document.body.appendChild(video);
    // A video that cannot load leaves the frames empty; the boxes and labels still show.
    video.addEventListener("error", () => setDrawn(frames.length), { once: true });
    video.src = videoUrl;
    let i = 0;
    const next = () => {
      if (cancelled || i >= frames.length) return;
      // The middle of the frame, so a seek never lands on the one before.
      video.currentTime = (frames[i] + 0.5) / FPS;
    };
    const onSeeked = () => {
      const c = canvases.current[i];
      const ctx = c?.getContext("2d");
      if (c && ctx) ctx.drawImage(video, 0, 0, c.width, c.height);
      i++;
      setDrawn(i);
      next();
    };
    video.addEventListener("loadeddata", next, { once: true });
    video.addEventListener("seeked", onSeeked);
    return () => {
      cancelled = true;
      video.removeEventListener("seeked", onSeeked);
      video.removeAttribute("src");
      video.load();
      video.remove();
    };
    // frames derive from frameCount
  }, [videoUrl, frameCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const cw = 120;
  const ch = Math.round((cw * height) / width);
  return (
    <ol className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:thin]" aria-label={`${frames.length} frames with SAM 3.1's boxes`}>
      {frames.map((f, k) => {
        const here = boxes.filter((b) => b.frame === f);
        return (
          <li key={f} className="relative shrink-0 overflow-hidden rounded-[8px] bg-(--wash) ring-1 ring-(--hair)" style={{ width: cw, aspectRatio: `${width} / ${height}` }}>
            <canvas
              ref={(el) => {
                canvases.current[k] = el;
              }}
              width={cw * 2}
              height={ch * 2}
              className={`size-full transition-opacity duration-300 ${k < drawn ? "opacity-100" : "opacity-0"}`}
              aria-hidden
            />
            {here.map((b) => {
              const v = b.verdict ?? verdicts[b.objectId];
              return (
                <span
                  key={b.objectId}
                  aria-hidden
                  className={[
                    "absolute rounded-[3px] transition-colors duration-300",
                    v === "match"
                      ? "border-2 border-(--signal) shadow-[0_0_0_1px_rgb(20_19_15/0.45)]"
                      : v === "lookalike"
                        ? "border-2 border-dashed border-(--reject) bg-white/15 shadow-[0_0_0_1.5px_rgb(255_255_255/0.85)]"
                        : "border-2 border-white/90 shadow-[0_0_0_1px_rgb(0_0_0/0.25)]",
                  ].join(" ")}
                  style={{
                    left: `${(b.box.x1 / width) * 100}%`,
                    top: `${(b.box.y1 / height) * 100}%`,
                    width: `${((b.box.x2 - b.box.x1 + 1) / width) * 100}%`,
                    height: `${((b.box.y2 - b.box.y1 + 1) / height) * 100}%`,
                  }}
                />
              );
            })}
            <span className="absolute right-1 bottom-0.5 font-mono text-[9.5px] text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.6)]">
              {(f / FPS).toFixed(1)}s
            </span>
          </li>
        );
      })}
    </ol>
  );
}
