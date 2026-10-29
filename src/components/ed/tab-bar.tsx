"use client";

// The phone's main navigation on top-level screens, in thumb reach: Campaigns and New, always the same two tabs.
// Detail screens (a campaign, a report, unlock) hide it, so each screen has at most one bar at the bottom: there the
// back link leads home and the screen's own action bar or player takes the bottom edge. Hidden from md up, where the
// top bar carries the links.
import { usePathname } from "next/navigation";
import { LayoutGrid, Plus } from "lucide-react";
import { useLinkStatus } from "next/link";
import { PendingLink } from "./pending-link";

/** Whether a path shows the tab bar (exported so pages can leave room for it). */
export function showsTabBar(path: string): boolean {
  return path === "/campaigns" || path === "/campaigns/new";
}

export function TabBar() {
  const path = usePathname();
  if (!showsTabBar(path)) return null;
  const tabs = [
    { href: "/campaigns", label: "Campaigns", icon: LayoutGrid, on: path === "/campaigns" },
    { href: "/campaigns/new", label: "New campaign", icon: Plus, on: path === "/campaigns/new" },
  ];
  return (
    <>
      {/* Room for the bar, so the last content is never under it. */}
      <div aria-hidden className="h-[calc(env(safe-area-inset-bottom)+58px)] md:hidden" />
      <nav aria-label="Main" className="ed-glass fixed inset-x-0 bottom-0 z-40 border-t border-(--hair) pb-[env(safe-area-inset-bottom)] md:hidden">
        <ul className="mx-auto flex max-w-[480px] px-[max(8px,env(safe-area-inset-left))]">
          {tabs.map((t) => (
            <li key={t.href} className="flex-1">
              <PendingLink
                href={t.href}
                aria-current={t.on ? "page" : undefined}
                hint="none"
                className={[
                  "relative flex h-[58px] flex-col items-center justify-center gap-0.5 rounded-(--r-ctl) text-[11px] active:bg-(--wash)",
                  t.on ? "font-bold text-(--ink)" : "font-semibold text-(--ink-3)",
                ].join(" ")}
              >
                <t.icon className="size-[22px]" strokeWidth={t.on ? 2.6 : 2} aria-hidden />
                {t.label}
                {t.on && <span aria-hidden className="absolute bottom-1.5 size-1 rounded-full bg-(--ink)" />}
                <TabPending />
              </PendingLink>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}

// A bar over the tapped tab and a small spinner while its page loads.
function TabPending() {
  const { pending } = useLinkStatus();
  return (
    <>
      <span aria-hidden className={`absolute inset-x-6 top-0 h-[3px] rounded-full bg-(--ink) transition-opacity duration-100 ${pending ? "opacity-100" : "opacity-0"}`} />
      {pending && <span className="sr-only" role="status">Loading</span>}
    </>
  );
}
