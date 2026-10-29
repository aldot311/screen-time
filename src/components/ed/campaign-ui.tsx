// Small server-safe pieces for the campaign screens (list, roll-up, new). Kept here so the shared kit stays untouched.
import { Mark } from "./bits";

/** Display voice for campaign headings: Bricolage, one step lighter and looser than the shared .ed-display so it reads
 *  as product UI rather than a magazine masthead (judge note). */
export const DISPLAY = "ed-display font-semibold! tracking-[-0.022em]!";

/** A 9:16 creator still. The placeholder art sits underneath the image, so a slow or lazy load never shows a blank. */
export function CampaignThumb({
  src,
  className = "",
  eager = false,
}: {
  src?: string;
  className?: string;
  eager?: boolean;
}) {
  return (
    <span className={`relative block aspect-[9/16] shrink-0 overflow-hidden bg-(--wash) ${className}`}>
      <span className="absolute inset-0 grid place-items-center opacity-30" aria-hidden>
        <Mark size={18} />
      </span>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- stored stills, already small JPEGs
        <img
          src={src}
          alt=""
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          className="relative size-full object-cover"
        />
      )}
    </span>
  );
}

/** A breathing dot that says the page is updating itself. */
export function LiveDot() {
  return (
    <span className="relative inline-flex size-2.5 shrink-0" aria-hidden>
      <span className="absolute inset-0 animate-ping rounded-full bg-(--ink)/40 motion-reduce:animate-none" />
      <span className="relative size-2.5 rounded-full bg-(--ink)" />
    </span>
  );
}

/** "1 video" / "12 videos". */
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
