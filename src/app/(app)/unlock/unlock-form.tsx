"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function UnlockForm() {
  const router = useRouter();
  const next = useSearchParams().get("next") ?? "/campaigns";
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="mt-6 space-y-3"
      action={async (form) => {
        setBusy(true);
        setError(null);
        const res = await fetch("/api/unlock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: String(form.get("password") ?? "") }),
        });
        if (!res.ok) {
          setBusy(false);
          setError((await res.json().catch(() => null))?.error ?? "Could not unlock.");
          return;
        }
        router.push(next.startsWith("/") && !next.startsWith("//") ? next : "/campaigns");
        router.refresh();
      }}
    >
      <label className="block">
        <span className="font-medium">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-2 block w-full rounded-[8px] border border-line bg-surface px-3 py-2 hover:border-line-strong"
        />
      </label>
      {error && <p className="rounded-[8px] bg-fail-soft px-3 py-2 text-fail">{error}</p>}
      <button disabled={busy} className="rounded-[8px] bg-ink px-4 py-2 font-medium text-white shadow-1 hover:bg-ink/90 disabled:opacity-60">
        {busy ? "Checking…" : "Unlock"}
      </button>
    </form>
  );
}
