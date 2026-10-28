import Link from "next/link";
import { Wordmark } from "@/components/wordmark";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur-sm">
        <div className="mx-auto flex h-13 max-w-[1240px] items-center gap-8 px-5 sm:px-8">
          <Link href="/campaigns" className="rounded-[4px]">
            <Wordmark />
          </Link>
          <nav className="flex items-center gap-1 text-ink-2">
            <Link href="/campaigns" className="rounded-[6px] px-2.5 py-1.5 hover:bg-sunken hover:text-ink">
              Campaigns
            </Link>
          </nav>
          <span className="ml-auto hidden text-[12px] text-ink-3 sm:block">
            Built on Meta SAM 3.1, Muse Spark and Muse Voice Transcribe · by Aetrai
          </span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1240px] flex-1 px-5 pt-8 pb-16 sm:px-8">{children}</main>
    </div>
  );
}
