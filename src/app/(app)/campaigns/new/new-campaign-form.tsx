"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const EXAMPLE_TERMS = [
  "On screen at least 3 seconds in total",
  "On screen at least 2 seconds within the first 5 seconds",
  "Say the brand name at least once",
  "One continuous shot of at least 2 seconds",
];

export function NewCampaignForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [terms, setTerms] = useState(EXAMPLE_TERMS.slice(0, 3).join("\n"));

  async function submit(form: FormData) {
    setBusy(true);
    setError(null);
    const list = (k: string, sep: RegExp) =>
      String(form.get(k) ?? "")
        .split(sep)
        .map((s) => s.trim())
        .filter(Boolean);
    const body = {
      name: String(form.get("name") ?? "").trim(),
      brand: String(form.get("brand") ?? "").trim(),
      prompt: String(form.get("prompt") ?? "").trim(),
      productDescription: String(form.get("productDescription") ?? "").trim(),
      brandTerms: list("brandTerms", /,/),
      contractTerms: list("contractTerms", /\n/),
    };
    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setBusy(false);
      setError((await res.json().catch(() => null))?.error ?? `Could not create the campaign (${res.status}).`);
      return;
    }
    const c = (await res.json()) as { id: string };
    router.push(`/campaigns/${c.id}`);
  }

  return (
    <form action={submit} className="mt-6 max-w-[720px] space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Campaign name" name="name" placeholder="Alani Nu: Fall creators" required />
        <Field label="Brand" name="brand" placeholder="Alani Nu" required />
      </div>

      <Field
        label="What to track"
        name="prompt"
        placeholder="drink can"
        required
        hint="A short noun for the kind of object, like “drink can”, “sneaker” or “tumbler”. SAM 3.1 finds every one of these in the video."
      />
      <Field
        label="What your product looks like"
        name="productDescription"
        placeholder="a slim teal can with a peach graphic and a pink ‘Alani’ logo"
        required
        hint="Muse Spark checks every find against this and rejects look-alikes from other brands."
      />
      <Field
        label="Spoken brand names"
        name="brandTerms"
        placeholder="Alani, Alani Nu"
        hint="Comma-separated. Screen-Time listens for these in the audio."
      />

      <label className="block">
        <span className="font-medium">Contract terms</span>
        <span className="block text-[13px] text-ink-3">One per line, in plain English. Muse Spark turns each into a rule that is checked to the frame.</span>
        <textarea
          name="contractTerms"
          value={terms}
          onChange={(e) => setTerms(e.target.value)}
          rows={4}
          className="mt-2 block w-full rounded-[8px] border border-line bg-surface px-3 py-2 placeholder:text-ink-3 hover:border-line-strong"
        />
        <span className="mt-2 flex flex-wrap gap-1.5">
          {EXAMPLE_TERMS.filter((t) => !terms.includes(t)).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTerms((s) => (s.trim() ? `${s.trim()}\n${t}` : t))}
              className="rounded-full border border-line px-2.5 py-0.5 text-[12px] text-ink-2 hover:border-line-strong hover:text-ink"
            >
              + {t}
            </button>
          ))}
        </span>
      </label>

      {error && <p className="rounded-[8px] bg-fail-soft px-3 py-2 text-fail">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-[8px] bg-ink px-4 py-2 font-medium text-white shadow-1 hover:bg-ink/90 disabled:opacity-60"
        >
          {busy ? "Creating…" : "Create campaign"}
        </button>
        <span className="text-[13px] text-ink-3">You add creator videos on the next page.</span>
      </div>
    </form>
  );
}

function Field(props: { label: string; name: string; placeholder?: string; hint?: string; required?: boolean }) {
  return (
    <label className="block">
      <span className="font-medium">{props.label}</span>
      {props.hint && <span className="block text-[13px] text-ink-3">{props.hint}</span>}
      <input
        name={props.name}
        placeholder={props.placeholder}
        required={props.required}
        className="mt-2 block w-full rounded-[8px] border border-line bg-surface px-3 py-2 placeholder:text-ink-3 hover:border-line-strong"
      />
    </label>
  );
}
