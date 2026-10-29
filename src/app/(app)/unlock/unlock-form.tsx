"use client";

import { useId, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CircleAlert, Eye, EyeOff, LockKeyholeOpen } from "lucide-react";
import { Spinner } from "@/components/ed/pending-link";

export function UnlockForm() {
  const router = useRouter();
  const next = useSearchParams().get("next") ?? "/campaigns";
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <form
      className="mt-7 space-y-4"
      action={async (form) => {
        setBusy(true);
        setError(null);
        try {
          const res = await fetch("/api/unlock", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: String(form.get("password") ?? "") }),
          });
          if (!res.ok) {
            setBusy(false);
            setError((await res.json().catch(() => null))?.error ?? "Could not unlock.");
            input.current?.focus();
            input.current?.select();
            return;
          }
        } catch {
          setBusy(false);
          setError("Could not reach the server. Check your connection and try again.");
          return;
        }
        // Stay busy until the next page commits, so the button never snaps back while the router navigates.
        router.push(sameOriginPath(next));
        router.refresh();
      }}
    >
      <div>
        <label htmlFor={`${id}-pw`} className="block text-[14px] font-semibold">
          Demo password
        </label>
        <div className="relative mt-2">
          <input
            ref={input}
            id={`${id}-pw`}
            name="password"
            type={shown ? "text" : "password"}
            autoComplete="current-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            required
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className={[
              "block h-[52px] w-full rounded-(--r-ctl) bg-(--paper) pr-14 pl-4 text-[16px] text-(--ink) ring-1 transition-[box-shadow,background-color] duration-150 placeholder:text-(--ink-3)",
              // Focus is the app-wide focus ring (editorial.css); the field also brightens to card white.
              "hover:ring-(--ink-3) focus:bg-(--card)",
              error ? "ring-(--reject)" : "ring-(--hair-2)",
            ].join(" ")}
          />
          <button
            type="button"
            onClick={() => setShown((s) => !s)}
            className="ed-press absolute top-1/2 right-1 grid size-11 -translate-y-1/2 place-items-center rounded-[10px] text-(--ink-2) hover:bg-(--wash) hover:text-(--ink) active:bg-(--hair)"
            aria-label={shown ? "Hide password" : "Show password"}
            aria-pressed={shown}
            aria-controls={`${id}-pw`}
          >
            {shown ? <EyeOff className="size-5" strokeWidth={2} aria-hidden /> : <Eye className="size-5" strokeWidth={2} aria-hidden />}
          </button>
        </div>
      </div>

      <div aria-live="assertive">
        {error && (
          <p id={errorId} role="alert" className="flex items-start gap-2 rounded-(--r-ctl) bg-(--reject-soft) px-3.5 py-3 text-[14px] leading-snug font-medium text-(--reject)">
            <CircleAlert className="mt-px size-[18px] shrink-0" strokeWidth={2.25} aria-hidden />
            {error}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={busy}
        aria-busy={busy}
        className="ed-press inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-(--ink) px-6 text-[16px] font-semibold text-white shadow-(--sh-2) hover:bg-black active:bg-black/80 disabled:cursor-progress disabled:bg-(--ink)/85"
      >
        {busy ? <Spinner className="size-[18px]" /> : <LockKeyholeOpen className="size-[18px]" strokeWidth={2.25} aria-hidden />}
        {busy ? "Checking…" : "Unlock"}
      </button>
    </form>
  );
}

/** Only ever go back to a page on this site: "/\\evil.com", "//evil.com" and absolute URLs resolve elsewhere. */
function sameOriginPath(next: string): string {
  try {
    const u = new URL(next, window.location.origin);
    const path = u.pathname + u.search + u.hash;
    // The router treats "//host" and "/\\host" as other sites, so those never pass.
    return u.origin === window.location.origin && !/^\/[\/\\]/.test(path) ? path : "/campaigns";
  } catch {
    return "/campaigns";
  }
}
