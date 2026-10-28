"use client";

// Local labelling tool: mark the frames where the product is visible, to measure Screen-Time's accuracy.
// Only works under `pnpm dev`; the API routes it uses return 404 in production.
import { useCallback, useEffect, useRef, useState } from "react";

const FPS = 15;
type Range = [number, number];

export default function LabelPage() {
  const [ids, setIds] = useState<string[]>([]);
  const [id, setId] = useState("");
  const [product, setProduct] = useState("");
  const [notes, setNotes] = useState("");
  const [ranges, setRanges] = useState<Range[]>([]);
  const [markIn, setMarkIn] = useState<number | null>(null);
  const [frame, setFrame] = useState(0);
  const [frames, setFrames] = useState(0);
  const [rate, setRate] = useState(0.5);
  const [saved, setSaved] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const loaded = useRef(false);

  useEffect(() => {
    fetch("/api/dev/videos")
      .then((r) => r.json())
      .then((list: string[]) => {
        setIds(list);
        setId((cur) => cur || list[0] || "");
      });
  }, []);

  useEffect(() => {
    if (!id) return;
    loaded.current = false;
    fetch(`/api/dev/labels?id=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((l) => {
        setProduct(l.product ?? "");
        setNotes(l.notes ?? "");
        setRanges(l.ranges ?? []);
        loaded.current = true;
      });
  }, [id]);

  // Autosave after every change once the clip's labels have loaded.
  useEffect(() => {
    if (!id || !loaded.current) return;
    const t = setTimeout(() => {
      fetch("/api/dev/labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, product, notes, ranges }),
      }).then((r) => setSaved(r.ok ? `Saved ${new Date().toLocaleTimeString()}` : "Save failed"));
    }, 400);
    return () => clearTimeout(t);
  }, [id, product, notes, ranges]);

  const seekFrame = useCallback((f: number) => {
    const v = video.current;
    if (!v) return;
    v.pause();
    // Aim for the middle of the frame so the browser shows exactly that frame.
    v.currentTime = (Math.max(0, f) + 0.5) / FPS;
  }, []);

  const addRange = useCallback(
    (end: number) => {
      if (markIn === null) return;
      const r: Range = [Math.min(markIn, end), Math.max(markIn, end)];
      setRanges((rs) => mergeRanges([...rs, r]));
      setMarkIn(null);
    },
    [markIn],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "TEXTAREA") return;
      const v = video.current;
      if (!v) return;
      if (e.key === " ") {
        e.preventDefault();
        if (v.paused) void v.play();
        else v.pause();
      } else if (e.key === "ArrowRight") seekFrame(frame + (e.shiftKey ? FPS : 1));
      else if (e.key === "ArrowLeft") seekFrame(frame - (e.shiftKey ? FPS : 1));
      else if (e.key === "i") setMarkIn(frame);
      else if (e.key === "o") addRange(frame);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [frame, seekFrame, addRange]);

  useEffect(() => {
    if (video.current) video.current.playbackRate = rate;
  }, [rate, id]);

  const visibleFrames = ranges.reduce((n, [a, b]) => n + b - a + 1, 0);

  return (
    <main className="mx-auto grid max-w-6xl gap-6 p-4 md:grid-cols-[minmax(0,420px)_1fr]">
      <section>
        <video
          ref={video}
          key={id}
          src={id ? `/api/dev/video?id=${encodeURIComponent(id)}` : undefined}
          className="aspect-[9/16] w-full rounded bg-black object-contain"
          onLoadedMetadata={(e) => setFrames(Math.round(e.currentTarget.duration * FPS))}
          onTimeUpdate={(e) => setFrame(Math.floor(e.currentTarget.currentTime * FPS))}
          onSeeked={(e) => setFrame(Math.floor(e.currentTarget.currentTime * FPS))}
          controls
          muted
          playsInline
        />
        <Timeline frames={frames} ranges={ranges} markIn={markIn} frame={frame} onSeek={seekFrame} />
      </section>

      <section className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={id}
            onChange={(e) => {
              setMarkIn(null);
              setId(e.target.value);
            }}
            className="rounded border px-2 py-1"
          >
            {ids.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
          <label>
            Speed{" "}
            <select value={rate} onChange={(e) => setRate(Number(e.target.value))} className="rounded border px-2 py-1">
              {[0.25, 0.5, 1].map((r) => (
                <option key={r} value={r}>
                  {r}×
                </option>
              ))}
            </select>
          </label>
          <span className="text-zinc-500">{saved}</span>
        </div>

        <label className="block">
          Product you are labelling
          <input
            value={product}
            onChange={(e) => setProduct(e.target.value)}
            placeholder="teal energy drink can"
            className="mt-1 block w-full rounded border px-2 py-1"
          />
        </label>

        <p className="font-mono">
          Frame {frame} / {frames} · {(frame / FPS).toFixed(2)} s · marked in at {markIn ?? "—"} · visible{" "}
          {(visibleFrames / FPS).toFixed(1)} s
        </p>

        <div className="flex flex-wrap gap-2">
          <button className="rounded border px-3 py-1" onClick={() => setMarkIn(frame)}>
            Mark in (I)
          </button>
          <button className="rounded border px-3 py-1" onClick={() => addRange(frame)} disabled={markIn === null}>
            Mark out (O)
          </button>
          <button className="rounded border px-3 py-1" onClick={() => setRanges([])}>
            Clear all
          </button>
        </div>

        <p className="text-zinc-500">
          Space play/pause · ← → one frame · Shift+← → one second · I start of an appearance · O end of it. Mark
          every frame where any part of the product is visible, even small or partly covered.
        </p>

        <ul className="space-y-1 font-mono">
          {ranges.map(([a, b], i) => (
            <li key={`${a}-${b}`} className="flex items-center gap-3">
              <button className="underline" onClick={() => seekFrame(a)}>
                {a}–{b} ({(a / FPS).toFixed(2)}–{((b + 1) / FPS).toFixed(2)} s)
              </button>
              <button className="text-red-600" onClick={() => setRanges(ranges.filter((_, j) => j !== i))}>
                remove
              </button>
            </li>
          ))}
        </ul>

        <label className="block">
          Notes
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="mt-1 block w-full rounded border px-2 py-1"
          />
        </label>
      </section>
    </main>
  );
}

function Timeline(props: { frames: number; ranges: Range[]; markIn: number | null; frame: number; onSeek: (f: number) => void }) {
  const { frames, ranges, markIn, frame, onSeek } = props;
  if (!frames) return null;
  const pct = (f: number) => `${(f / frames) * 100}%`;
  return (
    <div
      className="relative mt-3 h-8 cursor-pointer rounded bg-zinc-200 dark:bg-zinc-800"
      onClick={(e) => {
        const box = e.currentTarget.getBoundingClientRect();
        onSeek(Math.floor(((e.clientX - box.left) / box.width) * frames));
      }}
    >
      {ranges.map(([a, b]) => (
        <div key={`${a}-${b}`} className="absolute inset-y-0 bg-emerald-500" style={{ left: pct(a), width: pct(b - a + 1) }} />
      ))}
      {markIn !== null && <div className="absolute inset-y-0 w-0.5 bg-amber-500" style={{ left: pct(markIn) }} />}
      <div className="absolute inset-y-0 w-0.5 bg-black dark:bg-white" style={{ left: pct(frame) }} />
    </div>
  );
}

function mergeRanges(ranges: Range[]): Range[] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const out: Range[] = [];
  for (const r of sorted) {
    const last = out.at(-1);
    if (last && r[0] <= last[1] + 1) last[1] = Math.max(last[1], r[1]);
    else out.push([...r]);
  }
  return out;
}
