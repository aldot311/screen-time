import { ChevronLeft } from "lucide-react";

// Shown the instant a report link is tapped: the report's own shape, shimmering, so the tap reads as "opening".
// The top bar is drawn here rather than with TopBar: the campaign's name is not known until the page loads.
export default function Loading() {
  return (
    <>
      <header className="ed-glass sticky top-0 z-30 border-b border-(--hair)/70 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center gap-2 pr-4 pl-[max(8px,env(safe-area-inset-left))] sm:pl-6 lg:px-8">
          <ChevronLeft className="size-5 shrink-0 text-(--ink-3)" strokeWidth={2.5} aria-hidden />
          <span className="ed-skel h-4 w-24 rounded-full" />
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1200px] px-4 pb-24 sm:px-6 sm:pt-6 lg:px-8 lg:pt-8" aria-busy="true" aria-label="Loading report">
        <div className="grid gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <div className="lg:sticky lg:top-[76px] lg:self-start">
            <div className="-mx-4 bg-(--wash) px-4 py-3 sm:mx-0 sm:rounded-(--r-card) sm:py-4 lg:py-5">
              <div className="ed-skel mx-auto aspect-[9/16] w-[min(100%,calc(58svh*0.5625))] rounded-[18px] lg:w-[min(100%,calc((100svh-360px)*0.5625))]" />
            </div>
            <div className="ed-skel mt-4 hidden h-[190px] rounded-(--r-card) lg:block" />
          </div>
          <div className="space-y-10">
            <div className="rounded-(--r-card) bg-(--wash) p-5 sm:p-6">
              <div className="ed-skel h-9 w-40 rounded-full" />
              <div className="ed-skel mt-4 h-8 w-full max-w-[520px] rounded-[10px]" />
              <div className="ed-skel mt-2.5 h-8 w-3/4 max-w-[400px] rounded-[10px]" />
              <div className="ed-skel mt-4 h-11 w-64 rounded-full" />
            </div>
            <div className="space-y-2.5">
              <div className="ed-skel h-7 w-32 rounded-full" />
              {[0, 1, 2].map((i) => (
                <div key={i} className="ed-skel h-[120px] rounded-(--r-inner)" />
              ))}
            </div>
          </div>
        </div>
        <span className="sr-only" role="status">
          Loading the report
        </span>
      </main>
    </>
  );
}
