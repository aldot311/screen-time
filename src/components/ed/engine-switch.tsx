"use client";

// Which model checks each tracked object against the product: hosted Muse Spark through the Meta Model API, or Meta's
// open-weight Muse Spark Open on a partner host. Applies to videos analyzed from now on; finished reports keep theirs.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/components/api-error";
import { Spinner } from "./pending-link";

export function EngineSwitch({ endpoint, engine, provider }: { endpoint: string; engine: "hosted" | "open"; provider: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"hosted" | "open" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pick(next: "hosted" | "open") {
    if (next === engine || busy) return;
    setBusy(next);
    setError(null);
    try {
      const res = await fetch(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ checkEngine: next }) });
      const out = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(out?.error ?? `Could not save (${res.status}).`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(null);
    }
  }

  const options = [
    { id: "hosted" as const, label: "Muse Spark", hint: "Meta Model API" },
    { id: "open" as const, label: "Muse Spark Open", hint: `open weights · ${provider}` },
  ];
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[14px] text-(--ink-2)">
      <span id="engine-l">Object check</span>
      <div role="radiogroup" aria-labelledby="engine-l" className="inline-flex rounded-full bg-(--wash) p-1 ring-1 ring-(--hair)">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={engine === o.id}
            onClick={() => void pick(o.id)}
            disabled={busy !== null}
            title={o.hint}
            className={`ed-press inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[13.5px] font-semibold disabled:cursor-wait ${
              engine === o.id ? "bg-(--card) text-(--ink) shadow-(--sh-1)" : "text-(--ink-3)"
            }`}
          >
            {busy === o.id && <Spinner className="size-3.5" />}
            {o.label}
          </button>
        ))}
      </div>
      <span className="text-[13px] text-(--ink-3)">{engine === "open" ? `open weights, served by ${provider} · for videos analyzed from now on` : "for videos analyzed from now on"}</span>
      {error && (
        <p role="alert" className="w-full text-[13px]">
          <ApiError message={error} />
        </p>
      )}
    </div>
  );
}
