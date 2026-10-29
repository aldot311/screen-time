import { TopBar } from "@/components/ed/top-bar";
import { Spinner } from "@/components/ed/pending-link";

// Root fallback while a page without its own loading state streams in: the real top bar, then the shape of a page
// header and a few rows shimmering, so the tap that got here visibly landed.
export default function Loading() {
  return (
    <>
      <TopBar appNav={false} />
      <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 pt-8 pb-16 sm:px-6 lg:px-8 lg:pt-12" aria-busy>
        <p role="status" className="inline-flex items-center gap-2 text-[14px] font-medium text-(--ink-3)">
          <Spinner />
          Loading
        </p>
        <div aria-hidden>
          <div className="ed-skel mt-6 h-11 w-[min(520px,80%)] rounded-[12px]" />
          <div className="ed-skel mt-3 h-5 w-[min(360px,60%)] rounded-full" />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-4 rounded-(--r-card) bg-(--card) p-3 ring-1 ring-(--hair)">
                <div className="ed-skel aspect-[9/16] w-20 shrink-0 rounded-[12px]" />
                <div className="flex-1 space-y-3 py-2">
                  <div className="ed-skel h-4 w-2/3 rounded-full" />
                  <div className="ed-skel h-3 w-1/2 rounded-full" />
                  <div className="ed-skel mt-6 h-3 w-full rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
