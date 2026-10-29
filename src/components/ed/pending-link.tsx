"use client";

// A Link that answers the tap: it sinks on press (CSS) and shows a spinner from the moment navigation starts until
// the next page commits. The spinner is always rendered and only fades, so nothing shifts.
import Link, { useLinkStatus } from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function Spinner({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`ed-spin ${className}`} aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.22" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function Hint({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  return (
    <span data-on={pending} className={`ed-pending pointer-events-none ${className ?? ""}`} role={pending ? "status" : undefined}>
      <Spinner />
      {pending && <span className="sr-only">Loading</span>}
    </span>
  );
}

type Props = ComponentProps<typeof Link> & {
  children: ReactNode;
  /** Where the spinner sits: inline after the label, or covering the whole link (cards). */
  hint?: "inline" | "cover" | "none";
  hintClassName?: string;
};

export function PendingLink({ children, hint = "inline", hintClassName, className = "", ...rest }: Props) {
  return (
    <Link {...rest} className={`ed-press ${className}`}>
      {children}
      {hint === "inline" && <Hint className={`inline-grid ${hintClassName ?? ""}`} />}
      {hint === "cover" && (
        <Hint
          className={`absolute inset-0 z-10 grid place-items-center rounded-[inherit] bg-[rgb(247_246_242/0.6)] text-(--ink) backdrop-blur-[2px] ${hintClassName ?? ""}`}
        />
      )}
    </Link>
  );
}
