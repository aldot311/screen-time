"use client";

// The roll-up's actions. On phones and tablets: ONE bar at the bottom edge (the tab bar is hidden on this screen) with
// "Add videos" and "Export CSV"; "Add videos" opens the upload card as a bottom sheet that runs to the screen's bottom
// edge, traps focus while open and closes on Esc, the backdrop or the close button on its title row. From lg up the
// upload card sits inline in the sticky side column and Export lives in the top bar, so there is no bottom bar at all.
// Fixed layers carry m-0! because the side column spaces its children with margins.
// The upload card is mounted once and only shown or hidden, so uploads keep going when the sheet closes.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Upload, X } from "lucide-react";
import { ExportButton } from "./export-button";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),textarea,select,[tabindex]:not([tabindex="-1"])';

export function CampaignActions({ csv, filename, children }: { csv: string; filename: string; children?: ReactNode }) {
  const canUpload = Boolean(children);
  const [open, setOpen] = useState(false);
  const sheet = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const back = opener.current;
    const el = sheet.current;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    el?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return setOpen(false);
      if (e.key !== "Tab" || !el) return;
      // Focus trap: Tab and Shift+Tab cycle inside the sheet.
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (!el.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      }
    };
    // The sheet only exists below lg; growing past it closes the sheet so nothing stays locked.
    const mq = window.matchMedia("(min-width: 1024px)");
    const onMq = () => mq.matches && setOpen(false);
    window.addEventListener("keydown", onKey);
    mq.addEventListener("change", onMq);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      mq.removeEventListener("change", onMq);
      back?.focus({ preventScroll: true });
    };
  }, [open]);

  return (
    <>
      {canUpload && (
        <>
          {open && <div aria-hidden className="ed-dock-in fixed inset-0 z-40 m-0! bg-[rgb(20_19_15/0.32)] lg:hidden" onClick={() => setOpen(false)} />}
          <div
            ref={sheet}
            role={open ? "dialog" : undefined}
            aria-modal={open || undefined}
            aria-labelledby={open ? "sheet-title" : undefined}
            tabIndex={open ? -1 : undefined}
            className={[
              "outline-none lg:block",
              open
                ? "ed-dock-in fixed inset-x-0 top-auto bottom-0 z-50 m-0! max-h-[90dvh] overflow-y-auto overscroll-contain rounded-t-[26px] bg-(--card) px-4 pb-[calc(env(safe-area-inset-bottom)+20px)] shadow-(--sh-3) sm:px-6 lg:static lg:max-h-none lg:overflow-visible lg:rounded-none lg:bg-transparent lg:p-0 lg:shadow-none"
                : "hidden",
            ].join(" ")}
          >
            {open && (
              <div className="sticky top-0 z-10 -mx-4 mb-2 bg-(--card) px-4 pt-2 sm:-mx-6 sm:px-6 lg:hidden">
                <span aria-hidden className="mx-auto block h-1 w-10 rounded-full bg-(--hair-2)" />
                <div className="mt-1.5 flex items-center justify-between gap-3">
                  <h2 id="sheet-title" className="ed-display text-[21px] font-semibold! tracking-[-0.022em]!">
                    Add creator videos
                  </h2>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Close"
                    className="ed-press -mr-1 grid size-11 shrink-0 cursor-pointer place-items-center rounded-full bg-(--wash) text-(--ink) active:bg-(--hair)"
                  >
                    <X className="size-5" strokeWidth={2.25} aria-hidden />
                  </button>
                </div>
              </div>
            )}
            {children}
          </div>
        </>
      )}

      <div className="ed-glass fixed inset-x-0 bottom-0 z-30 m-0! border-t border-(--hair)/70 px-4 pt-2.5 pb-[calc(env(safe-area-inset-bottom)+10px)] lg:hidden">
        <div className={`mx-auto grid max-w-[520px] gap-2 ${canUpload ? "grid-cols-2" : ""}`}>
          {canUpload && (
            <button
              ref={opener}
              type="button"
              onClick={() => setOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={open}
              className="ed-press inline-flex h-12 cursor-pointer items-center justify-center gap-2 rounded-full bg-(--ink) px-4 text-[15px] font-semibold text-white shadow-(--sh-2) active:bg-black/85"
            >
              <Upload className="size-[18px]" strokeWidth={2.25} aria-hidden />
              Add videos
            </button>
          )}
          <ExportButton href={csv} filename={filename} variant={canUpload ? "quiet" : "solid"} />
        </div>
      </div>
    </>
  );
}
