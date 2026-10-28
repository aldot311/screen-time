"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-renders the server page every few seconds while a video is still being analysed. */
export function AutoRefresh({ active, everyMs = 2500 }: { active: boolean; everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(t);
  }, [active, everyMs, router]);
  return null;
}
