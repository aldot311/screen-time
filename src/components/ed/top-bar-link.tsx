"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { PendingLink } from "./pending-link";

/** A header link that marks itself as the current page (aria-current, bold ink) when you are on it. */
export function CurrentLink({ href, className, children }: { href: string; className: string; children: ReactNode }) {
  const on = usePathname() === href;
  return (
    <PendingLink href={href} aria-current={on ? "page" : undefined} className={`${className} ${on ? "font-bold! text-(--ink)!" : ""}`}>
      {children}
    </PendingLink>
  );
}
