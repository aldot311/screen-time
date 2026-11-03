// Scrubbing a timeline by key, mouse, pen or touch, shared by the report's lane timeline and the phone dock's strip so
// both move the same way. Keys: Arrow keys half a second, Shift+Arrow one frame, PageUp/PageDown a second, Home/End the
// ends, Space plays or pauses. Mouse and pen seek on press. Touch waits for the finger to show its direction: a
// sideways move scrubs, a vertical one is left to the browser (the element is touch-action: pan-y) so the page scrolls,
// and a tap that barely moved jumps to where it landed.
import { useRef, useState, type PointerEvent } from "react";
import { FPS } from "@/lib/types";

/** The new playhead for a key, "toggle" for Space, or null when the key is not a scrub key. */
export function scrubKey(key: string, shift: boolean, at: number, durationSec: number): number | "toggle" | null {
  const step = key === "PageUp" || key === "PageDown" ? 1 : shift ? 1 / FPS : 0.5;
  if (key === "ArrowRight" || key === "PageUp") return Math.min(durationSec, at + step);
  if (key === "ArrowLeft" || key === "PageDown") return Math.max(0, at - step);
  if (key === "Home") return 0;
  if (key === "End") return durationSec;
  if (key === " ") return "toggle";
  return null;
}

/** How far a finger moves before its direction counts, in CSS pixels. */
export const TOUCH_SLOP = 8;

/** What a touch that has moved (dx, dy) from where it landed is doing: scrubbing, scrolling the page, or not yet clear. */
export function touchIntent(dx: number, dy: number, slop = TOUCH_SLOP): "seek" | "scroll" | "wait" {
  if (Math.abs(dx) <= slop && Math.abs(dy) <= slop) return "wait";
  return Math.abs(dx) > Math.abs(dy) ? "seek" : "scroll";
}

/** Pointer handlers for a scrubbable element, given how to seek to a viewport x. `dragging` is true while a drag seeks. */
export function useScrubPointer(seekFrom: (clientX: number) => void) {
  const touch = useRef<{ id: number; x: number; y: number; mode: "seek" | "scroll" | null } | null>(null);
  const [dragging, setDragging] = useState(false);
  const end = () => {
    touch.current = null;
    setDragging(false);
  };
  return {
    dragging,
    handlers: {
      onPointerDown(e: PointerEvent<HTMLElement>) {
        if (e.pointerType === "touch") {
          touch.current = { id: e.pointerId, x: e.clientX, y: e.clientY, mode: null };
          return;
        }
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
        seekFrom(e.clientX);
      },
      onPointerMove(e: PointerEvent<HTMLElement>) {
        const t = touch.current;
        if (e.pointerType === "touch") {
          if (!t || t.id !== e.pointerId) return;
          if (t.mode === null) {
            const intent = touchIntent(e.clientX - t.x, e.clientY - t.y);
            if (intent === "wait") return;
            t.mode = intent;
            if (intent === "seek") {
              e.currentTarget.setPointerCapture(e.pointerId);
              setDragging(true);
            }
          }
          if (t.mode === "seek") seekFrom(e.clientX);
          return;
        }
        if (e.currentTarget.hasPointerCapture(e.pointerId)) seekFrom(e.clientX);
      },
      onPointerUp(e: PointerEvent<HTMLElement>) {
        const t = touch.current;
        // A tap: the finger lifted before it showed a direction, and not after a vertical move.
        if (t && t.id === e.pointerId && t.mode === null && touchIntent(e.clientX - t.x, e.clientY - t.y) !== "scroll") seekFrom(e.clientX);
        end();
      },
      // The browser took the touch to scroll the page (or the pointer was lost): nothing to seek.
      onPointerCancel: end,
    },
  };
}
