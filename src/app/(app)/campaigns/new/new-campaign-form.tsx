"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CircleAlert } from "lucide-react";
import { ApiError } from "@/components/api-error";
import { Spinner } from "@/components/ed/pending-link";
import { DISPLAY } from "@/components/ed/campaign-ui";
import { ProductPhotoField, uploadProductPhoto } from "@/components/ed/product-photo";
import { DEFAULT_TERMS, TermPicker, termsFrom, type TermState } from "./term-picker";

const REQUIRED: Record<string, string> = {
  name: "Give the campaign a name.",
  brand: "Add the brand name.",
  prompt: "Add a short word for the object, like “drink can”.",
  productDescription: "Describe what the product looks like.",
};

const INPUT =
  "block w-full rounded-(--r-ctl) bg-(--card) px-3.5 text-[16px] text-(--ink) shadow-[0_1px_1px_rgb(20_19_15/0.03)] ring-1 ring-(--hair-2) outline-none transition-shadow duration-150 placeholder:text-[#a8a298] focus:ring-2! focus:ring-(--ink) focus-visible:outline-none! aria-invalid:ring-2! aria-invalid:ring-(--short) aria-invalid:focus:ring-(--short)";

type Phase = { kind: "idle" } | { kind: "creating" } | { kind: "photo"; progress: number } | { kind: "opening" };

export function NewCampaignForm({ mode }: { mode: "blob" | "direct" }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const errorNote = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const busy = phase.kind !== "idle";
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<Record<string, string>>({});
  const [terms, setTerms] = useState<TermState>(DEFAULT_TERMS);
  const [termsTried, setTermsTried] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  // On a phone the keyboard needs the room: the sticky Create bar steps aside while a text field has focus.
  const [keyboard, setKeyboard] = useState(false);
  const contract = useRef<HTMLDivElement>(null);

  // On a phone the Create bar steps aside only while the on-screen keyboard is open (the visual viewport shrinks by
  // more than 150px), not on every focus.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const check = () => setKeyboard(window.innerHeight - vv.height > 150);
    vv.addEventListener("resize", check);
    return () => vv.removeEventListener("resize", check);
  }, []);

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

    // The picked terms must make sense before anything is created.
    const picked = termsFrom(terms);
    setTermsTried(true);
    if (Object.keys(picked.problems).length) {
      requestAnimationFrame(() => {
        const el = contract.current?.querySelector<HTMLElement>('[role="alert"]');
        el?.scrollIntoView({ block: "center", behavior: "smooth" });
      });
      return;
    }

    const feeText = get("fee").replace(/[$,\s]/g, "");
    const fee = feeText === "" ? undefined : Number(feeText);
    if (fee !== undefined && (!Number.isFinite(fee) || fee < 0 || fee > 1_000_000)) {
      setError("Enter the fee per video as an amount from $0 to $1,000,000, or leave it empty.");
      requestAnimationFrame(() => document.getElementById("f-fee")?.focus());
      return;
    }

    setPhase({ kind: "creating" });
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
      // Blank spoken names default to the brand when a term asks the creator to say it.
      brandTerms: list("brandTerms", /,/).length
        ? list("brandTerms", /,/)
        : picked.terms.some((t) => /\b(say|says|said|mention|mentions|mentioned|spoken)\b/i.test(t))
          ? [get("brand")]
          : [],
      contractTerms: picked.terms,
      fee,
    };
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setPhase({ kind: "idle" });
        setError((await res.json().catch(() => null))?.error ?? `Could not create the campaign (${res.status}).`);
        requestAnimationFrame(() => errorNote.current?.scrollIntoView({ block: "center", behavior: "smooth" }));
        return;
      }
      const c = (await res.json()) as { id: string };
      // The campaign exists now. The photo is a bonus: if it fails, the campaign page says so and offers it again.
      let photoFailed = false;
      if (photo) {
        setPhase({ kind: "photo", progress: 0 });
        try {
          await uploadProductPhoto(c.id, photo, mode, (p) => setPhase({ kind: "photo", progress: p }));
        } catch {
          photoFailed = true;
        }
      }
      setPhase({ kind: "opening" });
      router.push(`/campaigns/${c.id}${photoFailed ? "?photo=failed" : ""}`); // busy stays on until the campaign page commits
    } catch {
      setPhase({ kind: "idle" });
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
            hint="Muse Spark checks every find against this and rejects look-alikes from other brands. Color, shape and logo help most."
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
          <ProductPhotoField file={photo} onChange={setPhoto} />
        </Group>
      </div>

      <div className="min-w-0 space-y-7">
        <Group title="The contract">
          <div ref={contract}>
            <p className="text-[15px] font-semibold">Contract terms</p>
            <p className="mt-1 mb-3 max-w-[62ch] text-[13.5px] leading-snug text-(--ink-3)">
              Tick what the creator agreed to and change any number. Each one is checked against the video, with the second
              that proves it.
            </p>
            <TermPicker value={terms} onChange={setTerms} showProblems={termsTried} />
          </div>
          <Field
            label="Spoken brand names"
            name="brandTerms"
            hint="Comma-separated. Voice Transcribe listens for these in the audio. Left blank, it listens for the brand name when a term asks the creator to say it."
          >
            <input id="f-brandTerms" name="brandTerms" placeholder="e.g. Alani, Alani Nu" autoComplete="off" enterKeyHint="next" aria-describedby="f-brandTerms-hint" className={`${INPUT} h-12`} />
          </Field>
          <Field
            label="Fee per video"
            name="fee"
            hint="What you pay a creator for one delivered video, in US dollars. Reports then say how much each verdict pays or holds. You can set a different fee per creator later."
          >
            <span className="relative block max-w-[200px]">
              <span aria-hidden className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[16px] text-(--ink-3)">
                $
              </span>
              <input id="f-fee" name="fee" inputMode="decimal" placeholder="e.g. 300" autoComplete="off" enterKeyHint="done" aria-describedby="f-fee-hint" className={`${INPUT} h-12 pl-8 tabular`} />
            </span>
          </Field>
        </Group>

        {error && (
          <div ref={errorNote} role="alert" className="flex items-start gap-1.5 text-[14.5px] leading-snug font-medium text-(--short)">
            <CircleAlert className="mt-px size-[17px] shrink-0" strokeWidth={2.25} aria-hidden />
            <ApiError message={error} />
          </div>
        )}

        {/* On a phone the submit sits in thumb reach at the bottom edge (this task flow has no tab bar) and steps aside
            while the keyboard is open; from md up it ends the contract column. */}
        <div
          className={[
            "fixed inset-x-0 bottom-0 z-30 border-t border-(--hair)/70 bg-[rgb(250_249_246/0.86)] px-4 pt-2.5 pb-[calc(env(safe-area-inset-bottom)+10px)] backdrop-blur-[18px] backdrop-saturate-[1.6] transition-[opacity,translate] duration-200 md:static md:translate-y-0 md:border-0 md:bg-transparent md:p-0 md:opacity-100 md:backdrop-blur-none md:backdrop-saturate-100",
            keyboard ? "pointer-events-none translate-y-4 opacity-0 md:pointer-events-auto" : "",
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
              <span className="tabular">
                {phase.kind === "photo"
                  ? `Uploading photo… ${Math.round(phase.progress * 100)}%`
                  : phase.kind === "opening"
                    ? "Opening campaign…"
                    : busy
                      ? "Creating campaign…"
                      : "Create campaign"}
              </span>
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
        <p id={`${id}-err`} className="mt-1.5 flex items-start gap-1.5 text-[14px] leading-snug font-medium text-(--short)">
          <CircleAlert className="mt-px size-[17px] shrink-0" strokeWidth={2.25} aria-hidden />
          {props.error}
        </p>
      )}
    </div>
  );
}
