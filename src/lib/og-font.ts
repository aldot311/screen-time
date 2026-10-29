// Fonts for share cards (next/og), fetched from Google Fonts and subset to the card's text.

/** The brand faces from Google Fonts, subset to the card's text. Falls back to the default face if the fetch fails. */
export async function googleFont(family: string, axes: string, text: string): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(
      `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:${axes}&text=${encodeURIComponent(text)}`,
      { signal: AbortSignal.timeout(4000) },
    ).then((r) => (r.ok ? r.text() : ""));
    const url = /src: url\((.+?)\) format\('(?:opentype|truetype)'\)/.exec(css)?.[1];
    if (!url) return null;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}
