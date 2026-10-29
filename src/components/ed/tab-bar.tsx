"use client";

// The phone's main navigation, in thumb reach: Campaigns, New, and the campaign you are in. Each tab answers the tap at
// once (press) and shows a spinner until the next page commits. Hidden from md up, where the top bar carries the links.
import { usePathname } from "next/navigation";
import { LayoutGrid, Plus, Film } from "lucide-react";
import { useLinkStatus } from "next/link";
import { PendingLink } from "./pending-link";

export function TabBar() {
  const path = usePathname();
  const campaignId = /^\/campaigns\/(?!new$)([^/]+)/.exec(path)?.[1];
  const tabs = [
    { href: "/campaigns", label: "Campaigns", icon: LayoutGrid, on: path === "/campaigns" },
    { href: "/campaigns/new", label: "New", icon: Plus, on: path === "/campaigns/new" },
    ...(campaignId
      ? [{ href: `/campaigns/${campaignId}`, label: "Creators", icon: Film, on: path === `/campaigns/${campaignId}` }]
      : []),
  ];
  return (
    <nav
      aria-label="Main"
      className="ed-glass fixed inset-x-0 bottom-0 z-40 border-t border-(--hair)/80 pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="mx-auto flex max-w-[480px] px-[max(8px,env(safe-area-inset-left))]">
        {tabs.map((t) => (
          <li key={t.href} className="flex-1">
            <PendingLink
              href={t.href}
              aria-current={t.on ? "page" : undefined}
              hint="none"
              className={[
                "relative flex h-[58px] flex-col items-center justify-center gap-0.5 rounded-(--r-ctl) text-[11px] font-semibold active:bg-(--wash)",
                t.on ? "text-(--ink)" : "text-(--ink-3)",
              ].join(" ")}
            >
              <t.icon className="size-[22px]" strokeWidth={t.on ? 2.5 : 2} aria-hidden />
              {t.label}
              <TabPending />
            </PendingLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// A thin bar over the tapped tab while its page loads.
function TabPending() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={`absolute inset-x-6 top-0 h-[3px] rounded-full bg-(--ink) transition-opacity duration-100 ${pending ? "opacity-100" : "opacity-0"}`}
    />
  );
}
