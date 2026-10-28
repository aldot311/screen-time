// The mark is the product's own idea: a strip with one stretch highlighted.
export function Wordmark() {
  return (
    <span className="flex items-center gap-2 font-semibold tracking-[-0.01em]">
      <svg width="22" height="14" viewBox="0 0 22 14" aria-hidden className="shrink-0">
        <rect x="0.5" y="0.5" width="21" height="13" rx="3" fill="var(--sunken)" stroke="var(--line-strong)" />
        <rect x="6" y="1" width="9" height="12" fill="var(--lime)" />
        <rect x="17" y="7" width="1.5" height="6" fill="var(--violet)" />
      </svg>
      Screen-Time
    </span>
  );
}
