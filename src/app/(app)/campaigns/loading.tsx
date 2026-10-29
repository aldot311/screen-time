import { TopBar } from "@/components/ed/top-bar";

// The campaigns grid while it loads: heading, then cards with a thumbnail cluster.
export default function Loading() {
  return (
    <>
      <TopBar />
      <main className="mx-auto w-full max-w-[1200px] px-4 pt-6 pb-10 sm:px-6 lg:px-8 lg:pt-12" aria-busy="true" aria-label="Loading campaigns">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="ed-skel h-10 w-52 rounded-[12px] sm:h-14 sm:w-80" />
            <div className="ed-skel mt-3 h-4 w-64 rounded-full" />
          </div>
          <div className="ed-skel hidden h-11 w-[170px] rounded-full md:block" />
        </div>
        <div className="mt-7 grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex gap-4 rounded-[22px] bg-(--card) p-3 shadow-(--sh-1)">
              <div className="ed-skel aspect-[9/16] w-[70px] shrink-0 rounded-[13px]" />
              <div className="flex flex-1 flex-col gap-2 py-1">
                <div className="ed-skel h-6 w-32 rounded-[8px]" />
                <div className="ed-skel h-3.5 w-24 rounded-full" />
                <div className="ed-skel mt-auto h-4 w-40 rounded-full" />
                <div className="ed-skel h-2 w-full rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
