import { Mark } from "./wordmark";

// A 9:16 still of a creator video: the moment the product was largest on screen. Preview and older entries have
// none, so they get a quiet placeholder with the mark.
export function Thumb({ src, className = "w-9" }: { src?: string; className?: string }) {
  return (
    <span className={`relative block aspect-[9/16] shrink-0 overflow-hidden rounded-[5px] bg-sunken ring-1 ring-line ${className}`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- stored stills, already small JPEGs
        <img src={src} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <span className="grid size-full place-items-center opacity-30">
          <Mark size={14} />
        </span>
      )}
    </span>
  );
}
