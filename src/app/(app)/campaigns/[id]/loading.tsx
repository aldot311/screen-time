import { TopBar } from "@/components/ed/top-bar";

// The roll-up's shape while it loads: brand, verdict sentence, totals, story rail, filter and creator cards.
export default function Loading() {
  return (
    <>
      <TopBar back={{ href: "/campaigns", label: "Campaigns" }} />
      <main className="mx-auto w-full max-w-[1200px] px-4 pt-5 pb-24 sm:px-6 lg:px-8 lg:pt-10" aria-busy="true" aria-label="Loading campaign">
        <div className="grid gap-x-12 gap-y-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 space-y-5">
            <div>
              <div className="ed-skel h-10 w-48 rounded-[12px] sm:h-14 sm:w-72" />
              <div className="ed-skel mt-3 h-4 w-56 rounded-full" />
              <div className="ed-skel mt-6 h-7 w-full max-w-[420px] rounded-[10px]" />
              <div className="ed-skel mt-2 h-7 w-2/3 max-w-[300px] rounded-[10px]" />
              <div className="ed-skel mt-5 h-5 w-64 rounded-full" />
            </div>
            <div className="flex gap-2 overflow-hidden lg:hidden">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="flex w-[80px] shrink-0 flex-col items-center gap-1.5 pt-1">
                  <div className="ed-skel h-[124px] w-[72px] rounded-[22px]" />
                  <div className="ed-skel h-3 w-12 rounded-full" />
                </div>
              ))}
            </div>
            <div className="ed-skel h-[68px] w-full rounded-[20px] sm:w-[460px]" />
            <div className="grid gap-3 md:grid-cols-2">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="grid grid-cols-[84px_1fr] gap-3.5 rounded-[22px] bg-(--card) p-2.5 shadow-(--sh-1)">
                  <div className="ed-skel aspect-[9/16] rounded-[14px]" />
                  <div className="flex flex-col gap-2 py-1">
                    <div className="ed-skel h-5 w-24 rounded-[8px]" />
                    <div className="ed-skel h-3.5 w-20 rounded-full" />
                    <div className="ed-skel h-6 w-28 rounded-full" />
                    <div className="ed-skel mt-auto h-7 w-24 rounded-[8px]" />
                    <div className="ed-skel h-2 w-full rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="hidden lg:block">
            <div className="ed-skel h-[320px] rounded-[22px]" />
          </div>
        </div>
      </main>
    </>
  );
}
