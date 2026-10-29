"use client";

// CSV export. A download never navigates, so the button carries its own feedback: a spinner while the file is
// fetched, then a check, then back to rest.
import { useState } from "react";
import { Check, Download } from "lucide-react";
import { Spinner } from "./pending-link";

export function ExportButton({
  href,
  filename,
  variant = "solid",
  className = "",
}: {
  href: string;
  filename: string;
  variant?: "solid" | "quiet";
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");

  async function run() {
    if (state === "busy") return;
    setState("busy");
    try {
      const res = await fetch(href);
      if (!res.ok) throw new Error(String(res.status));
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setState("done");
    } catch {
      setState("error");
    }
    setTimeout(() => setState("idle"), 2200);
  }

  const label = { idle: "Export CSV", busy: "Preparing CSV…", done: "CSV downloaded", error: "Export failed, try again" }[state];
  const Icon = state === "busy" ? Spinner : state === "done" ? Check : Download;
  return (
    <a
      href={href}
      download={filename}
      onClick={(e) => {
        e.preventDefault();
        void run();
      }}
      aria-busy={state === "busy"}
      className={[
        "ed-press inline-flex h-12 cursor-pointer items-center justify-center gap-2 rounded-full px-5 text-[15px] font-semibold whitespace-nowrap",
        variant === "solid"
          ? "bg-(--ink) text-white shadow-(--sh-2) hover:bg-black active:bg-black/85"
          : "bg-(--card) text-(--ink) shadow-(--sh-1) ring-1 ring-(--hair) hover:ring-(--hair-2) active:bg-(--wash)",
        className,
      ].join(" ")}
    >
      <Icon className="size-[18px]" strokeWidth={2.25} aria-hidden />
      <span aria-live="polite">{label}</span>
    </a>
  );
}
