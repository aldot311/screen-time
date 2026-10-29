"use client";

// A fee in dollars, edited in place: the amount (or "Add fee") as a button, which opens a small dollar field with Save.
// Used for the campaign's fee per video and for one creator's own fee. Clearing the field removes the fee.
import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, Plus } from "lucide-react";
import { usd } from "@/lib/campaign/money";
import { Spinner } from "./pending-link";

export function FeeEditor({
  endpoint,
  extra,
  fee,
  inherited = false,
  label,
  editable,
}: {
  /** PATCH target. */
  endpoint: string;
  /** Sent with the fee in the PATCH body, e.g. { handle: "@maya" }. A null fee clears it. */
  extra?: Record<string, string>;
  fee: number | null;
  /** True when `fee` comes from the campaign rather than this creator: shown quieter, and "Add fee" sets an own one. */
  inherited?: boolean;
  /** What the fee is for, for screen readers: "Fee for @maya". */
  label: string;
  editable: boolean;
}) {
  const router = useRouter();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shown = fee === null ? null : usd(fee);

  if (!editable) {
    return shown ? (
      <span className={`text-[13px] font-semibold tabular ${inherited ? "text-(--ink-3)" : "text-(--ink-2)"}`}>{shown}</span>
    ) : null;
  }

  async function save() {
    const raw = value.replace(/[$,\s]/g, "");
    const next = raw === "" ? null : Number(raw);
    if (next !== null && (!Number.isFinite(next) || next < 0 || next > 1_000_000)) {
      setError("Enter an amount from $0 to $1,000,000.");
      input.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...extra, fee: next }) });
      const out = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(out?.error ?? `Could not save the fee (${res.status}).`);
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the fee.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setValue(fee !== null && !inherited ? String(fee) : "");
          setError(null);
          setOpen(true);
          requestAnimationFrame(() => input.current?.focus());
        }}
        aria-label={shown ? `${label}: ${shown}${inherited ? " (campaign fee)" : ""}. Change it` : `${label}: add a fee`}
        className={[
          "ed-press inline-flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[13.5px] font-semibold tabular active:bg-(--wash) [@media(hover:hover)]:hover:bg-(--wash)",
          shown && !inherited ? "text-(--ink)" : "text-(--ink-3)",
        ].join(" ")}
      >
        {shown ? <Pencil className="size-3.5" strokeWidth={2.25} aria-hidden /> : <Plus className="size-3.5" strokeWidth={2.5} aria-hidden />}
        {shown ?? "Add fee"}
      </button>
    );
  }

  return (
    <form
      className="flex shrink-0 flex-wrap items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) void save();
      }}
    >
      <label htmlFor={id} className="sr-only">
        {label}, in US dollars. Leave empty to remove it.
      </label>
      <span className="relative">
        <span aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[15px] text-(--ink-3)">
          $
        </span>
        <input
          ref={input}
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
          placeholder={inherited && fee !== null ? String(fee) : "300"}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          className="h-11 w-[104px] rounded-full bg-(--card) pr-3 pl-6 text-[16px] tabular ring-1 ring-(--hair-2) outline-none focus:ring-2 focus:ring-(--ink)"
        />
      </span>
      <button
        type="submit"
        disabled={busy}
        aria-busy={busy}
        className="ed-press inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-full bg-(--ink) px-3.5 text-[13.5px] font-semibold text-white active:bg-black/85 disabled:cursor-wait"
      >
        {busy ? <Spinner className="size-3.5" /> : <Check className="size-3.5" strokeWidth={3} aria-hidden />}
        Save
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="ed-press h-11 cursor-pointer rounded-full px-3 text-[13.5px] font-semibold text-(--ink-2) active:bg-(--wash)"
      >
        Cancel
      </button>
      {error && (
        <p id={`${id}-err`} role="alert" className="w-full text-[13px] text-(--short)">
          {error}
        </p>
      )}
    </form>
  );
}
