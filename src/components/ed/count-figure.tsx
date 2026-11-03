"use client";

// A big figure that counts up to its value the first time it scrolls into view. It renders the real value on the server
// and on first paint; it only drops to 0 while still off screen, so a reader never sees it jump. With reduced motion,
// or when it is already on screen at load, it simply stays at its value.
import { useEffect, useRef, useState } from "react";
import { Figure } from "./bits";

const COUNT_MS = 700;

export function CountFigure({ value, digits = 1 }: { value: number; digits?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);

  useEffect(() => {
    const el = ref.current;
    if (!el || value <= 0 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const box = el.getBoundingClientRect();
    if (box.top < innerHeight && box.bottom > 0) return;
    setShown(0);
    let frame = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        io.disconnect();
        const t0 = performance.now();
        const tick = (now: number) => {
          const t = Math.min(1, (now - t0) / COUNT_MS);
          // Ease-out (cubic): fast start, settling on the value.
          setShown(t === 1 ? value : value * (1 - (1 - t) ** 3));
          if (t < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
      setShown(value);
    };
  }, [value]);

  return (
    <span ref={ref}>
      <Figure value={shown} digits={digits} />
    </span>
  );
}
