import { ChevronLeft } from "lucide-react";
import { CurrentLink } from "./top-bar-link";
import type { ReactNode } from "react";
import { Wordmark } from "./bits";
import { PendingLink } from "./pending-link";

/** Frosted top bar that respects the notch. A back link on inner screens, the wordmark on the landing page. From md up
 *  it also carries the app's links, which the phone's tab bar carries below md. */
export function TopBar({ back, right, appNav = true }: { back?: { href: string; label: string }; right?: ReactNode; appNav?: boolean }) {
  return (
    <header className="ed-glass sticky top-0 z-30 border-b border-(--hair)/70 pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center gap-3 pr-[max(16px,env(safe-area-inset-right))] pl-[max(8px,env(safe-area-inset-left))] sm:pl-6 lg:pr-8 lg:pl-8">
        {back && (
          <PendingLink href="/" className="mr-1 hidden h-11 items-center rounded-full px-2 md:inline-flex" hint="none" aria-label="Screen-Time home">
            <Wordmark />
          </PendingLink>
        )}
        {back ? (
          <PendingLink
            href={back.href}
            className="-ml-1 inline-flex h-11 min-w-0 items-center gap-1 rounded-full pr-3 pl-2 text-[15px] font-semibold active:bg-(--wash)"
            hintClassName="ml-1"
          >
            <ChevronLeft className="size-5 shrink-0" strokeWidth={2.5} aria-hidden />
            <span className="truncate">{back.label}</span>
          </PendingLink>
        ) : (
          <PendingLink href="/" className="inline-flex h-11 items-center rounded-full px-2" hint="none" aria-label="Screen-Time home">
            <Wordmark />
          </PendingLink>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {appNav && (
            <nav aria-label="App" className="hidden items-center gap-1 md:flex">
              {/* No link that repeats the back link beside it. */}
              {back?.href !== "/campaigns" && (
                <CurrentLink href="/campaigns" className="inline-flex h-11 items-center rounded-full px-3.5 text-[14px] font-semibold text-(--ink-2) [@media(hover:hover)]:hover:bg-(--wash) [@media(hover:hover)]:hover:text-(--ink) active:bg-(--hair)">
                  Campaigns
                </CurrentLink>
              )}
              <CurrentLink href="/campaigns/new" className="inline-flex h-11 items-center rounded-full px-3.5 text-[14px] font-semibold text-(--ink-2) [@media(hover:hover)]:hover:bg-(--wash) [@media(hover:hover)]:hover:text-(--ink) active:bg-(--hair)">
                  New campaign
                </CurrentLink>
            </nav>
          )}
          {right}
        </div>
      </div>
    </header>
  );
}
