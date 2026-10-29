import { TabBar } from "@/components/ed/tab-bar";

// Pages render their own top bar (back link and actions differ per screen). The phone tab bar shows on top-level
// screens only and reserves its own room; detail screens own their bottom edge.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      {children}
      <TabBar />
    </div>
  );
}
