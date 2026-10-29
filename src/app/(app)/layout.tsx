import { TabBar } from "@/components/ed/tab-bar";

// Pages render their own top bar (back link and actions differ per screen); the phone tab bar is shared. Every page
// leaves room at the bottom for it.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-full flex-1 flex-col pb-[calc(env(safe-area-inset-bottom)+58px)] md:pb-0">
      {children}
      <TabBar />
    </div>
  );
}
