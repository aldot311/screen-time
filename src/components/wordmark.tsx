// The mark is the product's own idea: an ink strip with the on-screen stretch highlighted and the playhead on it.
export function Mark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={(size * 2) / 3} viewBox="0 0 24 16" aria-hidden className="shrink-0">
      <rect width="24" height="16" rx="4" fill="var(--ink)" />
      <rect x="6" y="3" width="10" height="10" rx="1.5" fill="var(--lime)" />
      <rect x="12.25" y="1.5" width="1.5" height="13" rx="0.75" fill="#fff" />
    </svg>
  );
}

export function Wordmark({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <span className={`flex items-center font-semibold tracking-[-0.02em] ${size === "lg" ? "gap-2.5 text-[17px]" : "gap-2 text-[15px]"}`}>
      <Mark size={size === "lg" ? 27 : 24} />
      Screen-Time
    </span>
  );
}
