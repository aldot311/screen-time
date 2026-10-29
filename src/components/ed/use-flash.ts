"use client";

import { useEffect, useRef, useState } from "react";

/** A short-lived confirmation ("Copied"): flash(key) shows it, and it clears itself after `ms`. */
export function useFlash<T = true>(ms = 2000) {
  const [on, setOn] = useState<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const flash = (key: T) => {
    clearTimeout(timer.current);
    setOn(() => key);
    timer.current = setTimeout(() => setOn(null), ms);
  };
  return [on, flash] as const;
}
