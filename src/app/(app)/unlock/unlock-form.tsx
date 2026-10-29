"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CircleAlert, Eye, EyeOff, LockKeyholeOpen } from "lucide-react";
import { Spinner } from "@/components/ed/pending-link";

// The same white field as the app's other forms. One error style only: a red border, and while the field shows an
// error the focus ring is dropped so the two never stack.
const INPUT = [
  "block h-[52px] w-full rounded-(--r-ctl) border-[1.5px] bg-(--card) pr-14 pl-4 text-[16px] text-(--ink)",
  "shadow-[0_1px_1px_rgb(20_19_15/0.03)] transition-[border-color] duration-150 placeholder:text-(--ink-3)",
  "border-(--hair-2) hover:border-(--ink-3)",
  "aria-invalid:border-(--short) aria-invalid:outline-none! aria-invalid:shadow-none!",
].join(" ");

export function UnlockForm() {
  const router = useRouter();
  const next = useSearchParams().get("next") ?? "/campaigns";
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const errorId = `${id}-error`;

  const fail = (message: string) => {
    setBusy(false);
    setError(message);
    input.current?.focus();
  };

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    if (!password) return fail("Type the demo password.");
    setBusy(true);
    setError(null);
    let res: Response;
    try {
      res = await fetch("/api/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
    } catch {
      return fail("Could not reach the server. Check your connection and try again.");
    }
    if (!res.ok) {
      // 503: this deployment has no demo password, so uploads are off for everyone.
      if (res.status === 503) return fail("Uploads are switched off on this demo. Browse the reports instead.");
      return fail((await res.json().catch(() => null))?.error ?? "Could not unlock.");
    }
    // Stay busy until the next page commits, so the button never snaps back while the router navigates.
    router.push(sameOriginPath(next));
    router.refresh();
  }

  return (
    <form className="mt-7 space-y-4" noValidate onSubmit={submit}>
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
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError(null);
            }}
            autoComplete="current-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className={INPUT}
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
        <div aria-live="assertive">
          {error && (
            <p id={errorId} role="alert" className="mt-2 flex items-start gap-1.5 text-[14px] leading-snug font-medium text-(--short)">
              <CircleAlert className="mt-px size-[17px] shrink-0" strokeWidth={2.25} aria-hidden />
              {error}
            </p>
          )}
        </div>
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
