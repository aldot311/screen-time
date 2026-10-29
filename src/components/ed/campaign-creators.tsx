"use client";

// The campaign's creators: who the brand expects a video from, and where each one stands. The status comes from the
// roster (a request link made, and when it expires) plus the videos whose handle matches (case-insensitive), so it is
// always derived, never typed in. "Request videos from all" makes one link per creator without a video and shows the
// links once: the server never stores a link (it is the creator's upload credential), only its expiry.
import { useEffect, useId, useRef, useState, useTransition, type Ref } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, ChevronRight, CircleDashed, Copy, Inbox, Link2, Plus, Send, Share, X } from "lucide-react";
import { ApiError } from "@/components/api-error";
import { VerdictPill } from "./bits";
import { PendingLink, Spinner } from "./pending-link";
import { CampaignRunButton } from "./campaign-run-button";
import { DISPLAY } from "./campaign-ui";
import { useFlash } from "./use-flash";
import { FeeEditor } from "./fee-editor";

export type CreatorStatus =
  "none" | "sent" | "expired" | "waiting" | "uploaded" | "starting" | "running" | "delivered" | "short" | "review" | "stopped";

export interface CreatorEntry {
  handle: string;
  status: CreatorStatus;
  /** ISO; when the latest request link stops working. */
  expiresAt?: string;
  /** The creator's latest video: the report to open, or the one waiting to run. */
  videoId?: string;
  href?: string;
  videos: number;
  /** The fee for this creator's video: their own, else the campaign's (inherited), else null. */
  fee?: number | null;
  feeInherited?: boolean;
}

type Made = {
  creator: string;
  url: string;
  expiresAt: string;
};

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const errorOf = (body: unknown, status: number, fallback: string) =>
  (body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : null) ?? `${fallback} (${status}).`;

/** "@a, b\nhttps://www.tiktok.com/@c?lang=en" -> ["@a", "@b", "@c"]: handles from whatever was pasted. */
export function parseHandles(text: string): {
  handles: string[];
  skipped: string[];
} {
  const handles: string[] = [];
  const skipped: string[] = [];
  for (const raw of text.split(/[\s,;]+/)) {
    if (!raw) continue;
    // A profile URL: take the "@name" segment, or the last path segment.
    const fromUrl = raw.includes("/")
      ? (raw
          .split(/[?#]/)[0]
          .split("/")
          .filter(Boolean)
          .find((p) => p.startsWith("@")) ??
        raw.split(/[?#]/)[0].split("/").filter(Boolean).pop() ??
        "")
      : raw;
    const name = fromUrl.replace(/^@+/, "");
    if (/^[\w.-]{1,63}$/.test(name)) {
      const h = `@${name}`;
      if (!handles.some((x) => x.toLowerCase() === h.toLowerCase())) handles.push(h);
    } else skipped.push(raw);
  }
  return { handles, skipped };
}

export function CampaignCreators({ campaignId, entries, editable }: { campaignId: string; entries: CreatorEntry[]; editable: boolean }) {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const [text, setText] = useState("");
  const [adding, setAdding] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState<string | "all" | null>(null);
  const [made, setMade] = useState<Made[] | null>(null);
  const linksRef = useRef<HTMLDivElement>(null);
  const fieldId = useId();

  // What the bulk request covers by default: every creator who has not sent a video yet.
  const askable = entries.filter((e) => e.videos === 0);
  const refresh = () => startTransition(() => router.refresh());

  async function add() {
    const { handles, skipped } = parseHandles(text);
    const fresh = handles.filter((h) => !entries.some((e) => e.handle.toLowerCase() === h.toLowerCase()));
    if (!handles.length) {
      setError(
        skipped.length
          ? `“${skipped[0]}” is not a handle. Use letters, numbers, dots or underscores.`
          : "Type or paste at least one handle.",
      );
      return;
    }
    if (!fresh.length) {
      setNote(handles.length === 1 ? `${handles[0]} is already on the list.` : "Everyone pasted is already on the list.");
      setError(null);
      setText("");
      return;
    }
    setAdding(true);
    setError(null);
    setNote(null);
    let sent = 0;
    try {
      // The API takes up to 50 handles per request, so a longer paste goes in batches of 50, in order.
      for (let i = 0; i < fresh.length; i += 50) {
        const batch = fresh.slice(i, i + 50);
        if (fresh.length > 50) setNote(`Adding ${Math.min(i + 50, fresh.length)} of ${fresh.length}…`);
        const res = await fetch(`/api/campaigns/${campaignId}/creators`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ handles: batch }),
        });
        if (!res.ok) throw new Error(errorOf(await res.json().catch(() => null), res.status, "Could not add the creators"));
        sent += batch.length;
      }
      const already = handles.length - fresh.length;
      setNote(
        [
          `Added ${fresh.length === 1 ? fresh[0] : `${fresh.length} creators`}.`,
          already ? `${already} ${already === 1 ? "was" : "were"} already on the list.` : "",
          skipped.length ? `Skipped “${skipped[0]}”${skipped.length > 1 ? ` and ${skipped.length - 1} more` : ""}: not a handle.` : "",
        ]
          .filter(Boolean)
          .join(" "),
      );
      setText("");
      refresh();
    } catch (e) {
      const why = e instanceof Error ? e.message : "Could not add the creators.";
      // Batches that went through stay added; say so, and leave the rest in the field to try again.
      if (sent) {
        setText(fresh.slice(sent).join("\n"));
        setNote(null);
        setError(`Added ${sent} of ${fresh.length}; the rest are still in the box. ${why}`);
        refresh();
      } else setError(why);
    } finally {
      setAdding(false);
    }
  }

  async function request(creators?: string[]) {
    setAsking(creators?.length === 1 ? creators[0] : "all");
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/requests/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(creators ? { creators } : {}),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(body)) throw new Error(errorOf(body, res.status, "Could not make the links"));
      const links = (body as { creator: string; path: string; expiresAt: string }[]).map((l) => ({
        creator: l.creator,
        url: new URL(l.path, location.origin).toString(),
        expiresAt: l.expiresAt,
      }));
      if (!links.length) throw new Error("Everyone on the list has already sent a video.");
      // A single new link joins the ones already showing (it replaces that creator's older one).
      setMade((cur) => (creators && cur ? [...cur.filter((m) => !links.some((l) => l.creator.toLowerCase() === m.creator.toLowerCase())), ...links] : links));
      refresh();
      requestAnimationFrame(() =>
        linksRef.current?.scrollIntoView({
          block: "nearest",
          behavior: "smooth",
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not make the links.");
    } finally {
      setAsking(null);
    }
  }

  return (
    <section aria-labelledby="creators-h" className="min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div>
          <h2 id="creators-h" className={`${DISPLAY} text-[24px] leading-tight`}>
            Creators
            {entries.length > 0 && <span className="ml-2 text-(--ink-3) tabular">{entries.length}</span>}
          </h2>
          <p className="mt-0.5 text-[13.5px] text-(--ink-3)">Who you expect a video from, and where each one stands.</p>
        </div>
        {editable && entries.length > 0 && (
          <button
            type="button"
            onClick={() => void request()}
            disabled={!askable.length || asking !== null}
            aria-busy={asking === "all"}
            className="ed-press inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full bg-(--ink) px-4 text-[14px] font-semibold text-white shadow-(--sh-1) active:bg-black/85 disabled:cursor-not-allowed disabled:bg-(--ink)/40 disabled:shadow-none max-sm:w-full [@media(hover:hover)]:hover:bg-black [@media(hover:hover)]:disabled:hover:bg-(--ink)/40"
          >
            {asking === "all" ? <Spinner /> : <Send className="size-4" strokeWidth={2.25} aria-hidden />}
            {asking === "all" ? "Making links…" : "Request videos from all"}
          </button>
        )}
      </div>
      {editable && entries.length > 0 && (
        <p className="mt-2 text-[13px] text-(--ink-3) sm:text-right">
          {askable.length
            ? `Makes a link for ${askable.length === entries.length ? (askable.length === 1 ? "the one creator" : `all ${askable.length} creators`) : `the ${askable.length} without a video`}.`
            : "Everyone on the list has sent a video."}
        </p>
      )}

      {made && <Links ref={linksRef} links={made} onChange={setMade} />}

      <div className="mt-3 overflow-hidden rounded-(--r-card) bg-(--card) shadow-(--sh-1) ring-1 ring-(--hair)">
        {entries.length > 0 ? (
          <ul className="divide-y divide-(--hair)" aria-label="Creators and their status">
            {entries.map((e) => (
              <CreatorRow
                key={e.handle}
                entry={e}
                campaignId={campaignId}
                editable={editable}
                asking={asking === e.handle}
                busy={asking !== null}
                onRequest={() => void request([e.handle])}
                onRemoved={refresh}
                onError={setError}
              />
            ))}
          </ul>
        ) : (
          <p className="px-4 py-5 text-[14.5px] text-(--ink-2)">
            No creators yet. {editable ? "Add the handles you expect videos from; each one can get a request link to send their cut." : ""}
          </p>
        )}

        {editable && (
          <form
            className="border-t border-(--hair) bg-(--paper)/60 p-3 sm:p-4"
            onSubmit={(ev) => {
              ev.preventDefault();
              if (!adding) void add();
            }}
          >
            <label htmlFor={fieldId} className="text-[14px] font-semibold">
              Add creators
            </label>
            <p id={`${fieldId}-h`} className="text-[12.5px] text-(--ink-3)">
              Paste one or several handles, separated by commas or new lines. Profile links work too.
            </p>
            <div className="mt-2 flex items-start gap-2">
              <textarea
                id={fieldId}
                value={text}
                onChange={(ev) => {
                  setText(ev.target.value);
                  setError(null);
                }}
                onKeyDown={(ev) => {
                  // Enter adds; Shift+Enter starts a new line for one handle per line.
                  if (ev.key === "Enter" && !ev.shiftKey && !ev.nativeEvent.isComposing) {
                    ev.preventDefault();
                    if (!adding) void add();
                  }
                }}
                rows={1}
                placeholder="@maya.films, @jon.eats"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-describedby={`${fieldId}-h`}
                className="block min-h-12 min-w-0 flex-1 resize-none rounded-(--r-ctl) bg-(--card) px-3.5 py-3 text-[16px] leading-snug ring-1 ring-(--hair-2) outline-none field-sizing-content placeholder:text-(--ink-3) focus:ring-2 focus:ring-(--ink)"
              />
              <button
                type="submit"
                disabled={adding}
                aria-busy={adding}
                className="ed-press inline-flex h-12 shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-(--card) px-4 text-[14px] font-semibold text-(--ink) shadow-(--sh-1) ring-1 ring-(--hair-2) active:bg-(--wash) disabled:cursor-wait [@media(hover:hover)]:hover:ring-(--ink-3)"
              >
                {adding ? <Spinner /> : <Plus className="size-4" strokeWidth={2.5} aria-hidden />}
                {adding ? "Adding…" : "Add"}
              </button>
            </div>
            <p className="mt-2 min-h-[1lh] text-[13px] leading-snug" aria-live="polite">
              {error ? (
                <ApiError message={error} />
              ) : note ? (
                <span className="text-(--ink-2)">{note}</span>
              ) : refreshing ? (
                <span className="text-(--ink-3)">Updating…</span>
              ) : null}
            </p>
          </form>
        )}
        {!editable && error && (
          <p role="alert" className="border-t border-(--hair) px-4 py-3 text-[13px]">
            <ApiError message={error} />
          </p>
        )}
      </div>
    </section>
  );
}

const STATUS: Record<Exclude<CreatorStatus, "delivered" | "short" | "review">, { Icon: typeof Check; cls: string }> = {
  none: { Icon: CircleDashed, cls: "text-(--ink-3)" },
  sent: { Icon: Send, cls: "text-(--ink-2)" },
  expired: { Icon: Link2, cls: "text-(--ink-3)" },
  waiting: { Icon: Inbox, cls: "text-(--ink-2)" },
  uploaded: { Icon: Inbox, cls: "text-(--ink-2)" },
  starting: { Icon: CircleDashed, cls: "text-(--ink-2)" },
  running: { Icon: CircleDashed, cls: "text-(--ink-2)" },
  stopped: { Icon: AlertTriangle, cls: "text-(--ink-2)" },
};

function StatusLine({ e }: { e: CreatorEntry }) {
  if (e.status === "delivered" || e.status === "short" || e.status === "review") return <VerdictPill verdict={e.status} />;
  const s = STATUS[e.status];
  const label =
    e.status === "none"
      ? "Not requested"
      : e.status === "sent"
        ? `Link sent · expires ${e.expiresAt ? day(e.expiresAt) : "soon"}`
        : e.status === "expired"
          ? `Link expired ${e.expiresAt ? day(e.expiresAt) : ""}`.trim()
          : e.status === "waiting"
            ? "Video received, waiting to run"
            : e.status === "uploaded"
              ? "Uploaded, not started"
              : e.status === "starting"
                ? "Starting"
                : e.status === "running"
                  ? "Analyzing"
                  : "Stopped";
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 text-[13px] font-medium ${s.cls}`}>
      {e.status === "running" || e.status === "starting" ? (
        <Spinner className="size-3.5 shrink-0" />
      ) : (
        <s.Icon className="size-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
      )}
      <span className="truncate">{label}</span>
    </span>
  );
}

function CreatorRow({
  entry: e,
  campaignId,
  editable,
  asking,
  busy,
  onRequest,
  onRemoved,
  onError,
}: {
  entry: CreatorEntry;
  campaignId: string;
  editable: boolean;
  asking: boolean;
  busy: boolean;
  onRequest: () => void;
  onRemoved: () => void;
  onError: (m: string | null) => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [removing, setRemoving] = useState(false);
  // The confirm step stands down by itself, so a stray tap never leaves a loaded remove button behind.
  useEffect(() => {
    if (!confirm) return;
    const t = setTimeout(() => setConfirm(false), 4000);
    return () => clearTimeout(t);
  }, [confirm]);

  async function remove() {
    setRemoving(true);
    onError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/creators`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: e.handle }),
      });
      if (!res.ok) throw new Error(errorOf(await res.json().catch(() => null), res.status, `Could not remove ${e.handle}`));
      onRemoved();
    } catch (err) {
      setRemoving(false);
      setConfirm(false);
      onError(err instanceof Error ? err.message : `Could not remove ${e.handle}.`);
    }
  }

  const who = (
    <span className="min-w-0 flex-1">
      <span className="block truncate text-[15px] leading-tight font-semibold">{e.handle}</span>
      <span className="mt-1 flex min-w-0 items-center gap-2">
        <StatusLine e={e} />
        {e.videos > 1 && <span className="shrink-0 text-[12px] text-(--ink-3) tabular">{e.videos} videos</span>}
      </span>
    </span>
  );
  // A new link can always be made; it replaces the creator's older one on the list.
  const canLink = editable;
  const canRun = editable && (e.status === "waiting" || e.status === "uploaded") && e.videoId;

  return (
    // The actions wrap under the name on a narrow screen when there are several (Run analysis + New link + remove).
    <li className={`flex min-h-[64px] flex-wrap items-center gap-x-2 pr-2 pl-4 ${removing ? "opacity-50" : ""}`}>
      {e.href ? (
        <PendingLink
          href={e.href}
          hint="none"
          className="ed-press-soft -my-px -ml-4 flex min-h-[64px] min-w-0 flex-1 basis-[140px] items-center gap-2 rounded-[12px] py-2.5 pl-4 active:bg-(--wash) [@media(hover:hover)]:hover:bg-(--paper)"
          aria-label={`${e.handle}: open the report`}
        >
          {who}
          <ChevronRight className="size-5 shrink-0 text-(--ink-3)" strokeWidth={2.25} aria-hidden />
        </PendingLink>
      ) : (
        <span className="flex min-h-[64px] min-w-0 flex-1 basis-[140px] items-center py-2.5">{who}</span>
      )}

      <span className={`ml-auto flex max-w-full flex-wrap items-center justify-end gap-1.5 ${canRun ? "max-sm:pb-3" : ""}`}>
        {canRun && <CampaignRunButton campaignId={campaignId} videoId={e.videoId!} />}

        {!confirm && (
          <FeeEditor
            endpoint={`/api/campaigns/${campaignId}/creators`}
            extra={{ handle: e.handle }}
            fee={e.fee ?? null}
            inherited={e.feeInherited}
            label={`Fee for ${e.handle}`}
            editable={editable}
          />
        )}

        {canLink && !confirm && (
          <button
            type="button"
            onClick={onRequest}
            disabled={busy}
            aria-busy={asking}
            aria-label={`${e.status === "none" && !e.videos ? "Make a request link for" : "Make a new request link for"} ${e.handle}`}
            className="ed-press inline-flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[13.5px] font-semibold text-(--ink) ring-1 ring-(--hair-2) active:bg-(--wash) disabled:cursor-wait disabled:opacity-60 [@media(hover:hover)]:hover:bg-(--wash)"
          >
            {asking ? <Spinner className="size-3.5" /> : <Link2 className="size-3.5" strokeWidth={2.5} aria-hidden />}
            {e.status === "none" && !e.videos ? "Make link" : "New link"}
          </button>
        )}

        {editable &&
          (confirm ? (
            <span className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => void remove()}
                disabled={removing}
                aria-busy={removing}
                className="ed-press inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-full bg-(--ink) px-3.5 text-[13.5px] font-semibold text-white active:bg-black/85 disabled:cursor-wait"
              >
                {removing && <Spinner className="size-3.5" />}
                Remove
              </button>
              <button
                type="button"
                onClick={() => setConfirm(false)}
                className="ed-press h-11 cursor-pointer rounded-full px-3 text-[13.5px] font-semibold text-(--ink-2) active:bg-(--wash)"
              >
                Keep
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirm(true)}
              aria-label={`Remove ${e.handle} from the list`}
              className="ed-press grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-(--ink-3) active:bg-(--wash) [@media(hover:hover)]:hover:bg-(--wash) [@media(hover:hover)]:hover:text-(--ink)"
            >
              <X className="size-[18px]" strokeWidth={2.25} aria-hidden />
            </button>
          ))}
      </span>
    </li>
  );
}

function Links({ links, onChange, ref }: { links: Made[]; onChange: (l: Made[] | null) => void; ref: Ref<HTMLDivElement> }) {
  // One "Copied" at a time: a link's url, or "all"; it clears after 2 s.
  const [copied, flash] = useFlash<string>();
  const share = typeof navigator !== "undefined" && "share" in navigator;
  const all = links.map((l) => `${l.creator} ${l.url}`).join("\n");
  const copy = (text: string) => navigator.clipboard.writeText(text);
  const until = day(links.reduce((a, l) => (l.expiresAt < a ? l.expiresAt : a), links[0].expiresAt));

  return (
    <div ref={ref} role="status" className="mt-4 scroll-mt-[90px] rounded-(--r-card) bg-(--wash) p-3 ring-1 ring-(--hair) sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[15px] font-semibold">
            {links.length === 1 ? `Request link for ${links[0].creator}` : `${links.length} request links`}
          </p>
          <p className="mt-0.5 max-w-[60ch] text-[13px] leading-snug text-(--ink-2)">
            <span className="font-semibold text-(--ink)">Shown once.</span> Screen-Time does not keep these links, so copy or share them
            now. Each works once, until {until}. You can make a new link for anyone, any time.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label="Hide the links"
          className="ed-press -mt-1 -mr-1 grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-(--ink-2) active:bg-(--hair) [@media(hover:hover)]:hover:bg-(--hair)"
        >
          <X className="size-[18px]" strokeWidth={2.25} aria-hidden />
        </button>
      </div>

      <ul className="mt-3 space-y-2">
        {links.map((l) => (
          <li key={l.creator} className="flex items-center gap-2 rounded-(--r-ctl) bg-(--card) py-1.5 pr-1.5 pl-3 ring-1 ring-(--hair)">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-semibold">{l.creator}</span>
              <input
                readOnly
                value={l.url}
                onFocus={(e) => e.currentTarget.select()}
                aria-label={`Request link for ${l.creator}`}
                className="block w-full truncate bg-transparent text-[12.5px] text-(--ink-3) outline-none focus-visible:outline-2!"
              />
            </span>
            <button
              type="button"
              onClick={() =>
                copy(l.url).then(
                  () => flash(l.url),
                  () => undefined,
                )
              }
              className="ed-press inline-flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-(--ink) px-3.5 text-[13.5px] font-semibold text-white active:bg-black/85 [@media(hover:hover)]:hover:bg-black"
            >
              {copied === l.url ? <Check className="size-4" strokeWidth={3} aria-hidden /> : <Copy className="size-4" aria-hidden />}
              {copied === l.url ? "Copied" : "Copy"}
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap gap-2">
        {links.length > 1 && (
          <button
            type="button"
            onClick={() =>
              copy(all).then(
                () => flash("all"),
                () => undefined,
              )
            }
            className="ed-press inline-flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-full bg-(--card) px-4 text-[14px] font-semibold text-(--ink) shadow-(--sh-1) ring-1 ring-(--hair-2) active:bg-(--hair) sm:flex-none [@media(hover:hover)]:hover:ring-(--ink-3)"
          >
            {copied === "all" ? <Check className="size-4" strokeWidth={3} aria-hidden /> : <Copy className="size-4" aria-hidden />}
            {copied === "all" ? "Copied all" : "Copy all"}
          </button>
        )}
        {share && (
          <button
            type="button"
            onClick={() => navigator.share({ title: "Send your video", text: all }).catch(() => undefined)}
            className="ed-press inline-flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-full bg-(--card) px-4 text-[14px] font-semibold text-(--ink) shadow-(--sh-1) ring-1 ring-(--hair-2) active:bg-(--hair) sm:flex-none [@media(hover:hover)]:hover:ring-(--ink-3)"
          >
            <Share className="size-4" aria-hidden /> Share
          </button>
        )}
      </div>
    </div>
  );
}
