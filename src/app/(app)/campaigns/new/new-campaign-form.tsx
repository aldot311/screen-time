"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Plus } from "lucide-react";
import { ApiError } from "@/components/api-error";
import { Spinner } from "@/components/ed/pending-link";
import { DISPLAY } from "@/components/ed/campaign-ui";

const EXAMPLE_TERMS = [
  "On screen at least 3 seconds in total",
  "On screen at least 2 seconds within the first 5 seconds",
  "Say the brand name at least once",
  "One continuous shot of at least 2 seconds",
];

const REQUIRED: Record<string, string> = {
  name: "Give the campaign a name.",
  brand: "Add the brand name.",
  prompt: "Add a short word for the object, like “drink can”.",
  productDescription: "Describe what the product looks like.",
};

const INPUT =
  "block w-full rounded-(--r-ctl) bg-(--card) px-3.5 text-[16px] text-(--ink) shadow-[0_1px_1px_rgb(20_19_15/0.03)] ring-1 ring-(--hair-2) outline-none transition-shadow duration-150 placeholder:text-(--ink-3) focus:ring-2 focus:ring-(--ink) focus-visible:outline-none! aria-invalid:ring-2 aria-invalid:ring-(--short)";

export function NewCampaignForm() {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const errorNote = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<Record<string, string>>({});
  const [terms, setTerms] = useState(EXAMPLE_TERMS.slice(0, 3).join("\n"));
  // On a phone the keyboard needs the room: the sticky Create bar steps aside while a text field has focus.
  const [typing, setTyping] = useState(false);
  const isText = (t: EventTarget) => t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const data = new FormData(e.currentTarget);
    const get = (k: string) => String(data.get(k) ?? "").trim();

    // Client-side check first, with the message under the field and focus on the first problem.
    const missing = Object.fromEntries(Object.entries(REQUIRED).filter(([k]) => !get(k)));
    setInvalid(missing);
    const first = Object.keys(missing)[0];
    if (first) {
      const el = form.current?.elements.namedItem(first) as HTMLElement | null;
      el?.focus();
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }

    setBusy(true);
    setError(null);
    const list = (k: string, sep: RegExp) =>
      get(k)
        .split(sep)
        .map((s) => s.trim())
        .filter(Boolean);
    const body = {
      name: get("name"),
      brand: get("brand"),
      prompt: get("prompt"),
      productDescription: get("productDescription"),
      brandTerms: list("brandTerms", /,/),
      contractTerms: list("contractTerms", /\n/),
    };
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setBusy(false);
        setError((await res.json().catch(() => null))?.error ?? `Could not create the campaign (${res.status}).`);
        requestAnimationFrame(() => errorNote.current?.scrollIntoView({ block: "center", behavior: "smooth" }));
        return;
      }
      const c = (await res.json()) as { id: string };
      router.push(`/campaigns/${c.id}`); // busy stays on until the campaign page commits
    } catch {
      setBusy(false);
      setError("Could not reach Screen-Time. Check the connection and try again.");
    }
  }

  const clear = (k: string) => {
    if (invalid[k]) setInvalid((m) => Object.fromEntries(Object.entries(m).filter(([key]) => key !== k)));
  };

  return (
    <form
      ref={form}
      onSubmit={submit}
      noValidate
      onFocus={(e) => isText(e.target) && setTyping(true)}
      onBlur={(e) => isText(e.target) && setTyping(false)}
      className="mt-8 grid gap-x-14 gap-y-9 lg:grid-cols-2"
    >
      <p className="-mt-4 text-[13.5px] text-(--ink-3) lg:col-span-2">
        Fields marked <span className="font-semibold text-(--ink-2)">Required</span> are needed to create the campaign.
      </p>

      <div className="min-w-0 space-y-9">
        <Group title="The campaign">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Campaign name" name="name" required error={invalid.name}>
              <input id="f-name" name="name" placeholder="e.g. Alani Nu: Fall creators" autoComplete="off" enterKeyHint="next" aria-required onInput={() => clear("name")} aria-invalid={!!invalid.name} aria-describedby={invalid.name ? "f-name-err" : undefined} className={`${INPUT} h-12`} />
            </Field>
            <Field label="Brand" name="brand" required error={invalid.brand}>
              <input id="f-brand" name="brand" placeholder="e.g. Alani Nu" autoComplete="organization" enterKeyHint="next" aria-required onInput={() => clear("brand")} aria-invalid={!!invalid.brand} aria-describedby={invalid.brand ? "f-brand-err" : undefined} className={`${INPUT} h-12`} />
            </Field>
          </div>
        </Group>

        <Group title="The product">
          <Field
            label="Product type (one or two words)"
            name="prompt"
            required
            error={invalid.prompt}
            hint="The kind of object, like “drink can”, “sneaker” or “tumbler”. SAM 3.1 finds every one in the video. If the word finds nothing, Muse Spark suggests a better one and tries again."
          >
            <input id="f-prompt" name="prompt" placeholder="e.g. drink can" autoCapitalize="none" autoComplete="off" enterKeyHint="next" aria-required onInput={() => clear("prompt")} aria-invalid={!!invalid.prompt} aria-describedby={`f-prompt-hint${invalid.prompt ? " f-prompt-err" : ""}`} className={`${INPUT} h-12`} />
          </Field>
          <Field
            label="What your product looks like"
            name="productDescription"
            required
            error={invalid.productDescription}
            hint="Muse Spark checks every find against this and rejects look-alikes from other brands. Colour, shape and logo help most."
          >
            <textarea
              id="f-productDescription"
              name="productDescription"
              rows={2}
              placeholder="e.g. a slim teal can with a peach graphic and a pink ‘Alani’ logo"
              aria-required
              onInput={() => clear("productDescription")}
              aria-invalid={!!invalid.productDescription}
              aria-describedby={`f-productDescription-hint${invalid.productDescription ? " f-productDescription-err" : ""}`}
              className={`${INPUT} min-h-[76px] resize-none py-3 leading-snug field-sizing-content`}
            />
          </Field>
        </Group>
      </div>

      <div className="min-w-0 space-y-7">
        <Group title="The contract">
          <Field label="Spoken brand names" name="brandTerms" hint="Comma-separated. Voice Transcribe listens for these in the audio.">
            <input id="f-brandTerms" name="brandTerms" placeholder="e.g. Alani, Alani Nu" autoComplete="off" enterKeyHint="next" aria-describedby="f-brandTerms-hint" className={`${INPUT} h-12`} />
          </Field>
          <Field label="Contract terms" name="contractTerms" hint="One per line, in plain English. Muse Spark turns each into a rule that is checked to the frame.">
            <textarea
              id="f-contractTerms"
              name="contractTerms"
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              rows={3}
              placeholder="e.g. On screen at least 3 seconds in total"
              aria-describedby="f-contractTerms-hint"
              className={`${INPUT} min-h-[100px] resize-none py-3 leading-relaxed field-sizing-content`}
            />
            {EXAMPLE_TERMS.some((t) => !terms.includes(t)) && (
              <div className="mt-3">
                <p className="text-[13px] font-semibold text-(--ink-2)">Add an example</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {EXAMPLE_TERMS.filter((t) => !terms.includes(t)).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTerms((s) => (s.trim() ? `${s.trim()}\n${t}` : t))}
                      className="ed-press inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full bg-(--card) py-2 pr-4 pl-3 text-left text-[14px] leading-tight font-medium text-(--ink) ring-1 ring-(--hair-2) active:bg-(--wash) [@media(hover:hover)]:hover:ring-(--ink-3)"
                    >
                      <Plus className="size-4 shrink-0 text-(--ink-2)" strokeWidth={2.5} aria-hidden />
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Field>
        </Group>

        {error && (
          <div ref={errorNote} role="alert" className="rounded-(--r-inner) bg-(--short-soft) px-4 py-3 text-[14.5px] leading-snug">
            <ApiError message={error} />
          </div>
        )}

        {/* On a phone the submit sits in thumb reach on top of the tab bar (and steps aside for the keyboard); from md
            up it ends the contract column. */}
        <div
          className={[
            "fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+58px)] z-30 border-t border-(--hair)/70 bg-[rgb(250_249_246/0.86)] px-4 py-2.5 backdrop-blur-[18px] backdrop-saturate-[1.6] transition-[opacity,translate] duration-200 md:static md:translate-y-0 md:border-0 md:bg-transparent md:p-0 md:opacity-100 md:backdrop-blur-none md:backdrop-saturate-100",
            typing ? "pointer-events-none translate-y-4 opacity-0 md:pointer-events-auto" : "",
          ].join(" ")}
        >
          <div className="mx-auto flex max-w-[480px] items-center gap-4 md:mx-0 md:max-w-none">
            <button
              type="submit"
              disabled={busy}
              aria-busy={busy}
              className="ed-press inline-flex h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-full bg-(--ink) px-6 text-[15px] font-semibold text-white shadow-(--sh-2) active:bg-black/85 disabled:cursor-wait disabled:opacity-80 md:flex-none [@media(hover:hover)]:hover:bg-black"
            >
              {busy ? <Spinner className="size-[18px]" /> : null}
              {busy ? "Creating campaign…" : "Create campaign"}
              {!busy && <ArrowRight className="size-[18px]" strokeWidth={2.25} aria-hidden />}
            </button>
            <span className="hidden text-[14px] text-(--ink-3) md:inline">You add creator videos on the next page.</span>
          </div>
        </div>
      </div>
    </form>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-5">
      <legend className={`${DISPLAY} mb-4 text-[22px]`}>{title}</legend>
      {children}
    </fieldset>
  );
}

function Field(props: { label: string; name: string; hint?: string; error?: string; required?: boolean; children: ReactNode }) {
  const id = `f-${props.name}`;
  return (
    <div>
      <label htmlFor={id} className="flex items-baseline gap-2 text-[15px] font-semibold">
        {props.label}
        {props.required ? (
          <span className="text-[12.5px] font-semibold text-(--ink-2)">Required</span>
        ) : (
          <span className="text-[12.5px] font-normal text-(--ink-3)">Optional</span>
        )}
      </label>
      {props.hint && (
        <p id={`${id}-hint`} className="mt-1 max-w-[62ch] text-[13.5px] leading-snug text-(--ink-3)">
          {props.hint}
        </p>
      )}
      <div className="mt-2">{props.children}</div>
      {props.error && (
        <p id={`${id}-err`} className="mt-1.5 text-[13.5px] font-medium text-(--short)">
          {props.error}
        </p>
      )}
    </div>
  );
}
