/** A storage name the upload route accepts ([\w.-]+.mp4|mov): "Final cut (2).MOV" -> "final-cut-2.mov". */
export function safeUploadName(file: { name: string; type: string }): string {
  const ext = file.type === "video/quicktime" || /\.mov$/i.test(file.name) ? "mov" : "mp4";
  const base = file.name.replace(/\.[^.]+$/, "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return `${base || "video"}.${ext}`;
}

/** Creator uploads through a request link are named after the link's one-time id, so the server can tell that a
 *  registered file was uploaded with that link and no other ("req-<nonce>-final-cut.mp4"). */
export const requestFilePrefix = (nonce: string) => `req-${nonce}-`;

/** The one-time id inside a request link (its claims are readable; only the signature is secret). Browser-safe. */
export function requestNonce(token: string): string | null {
  try {
    const body = token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/");
    const nonce = (JSON.parse(atob(body)) as { nonce?: unknown }).nonce;
    return typeof nonce === "string" && /^[a-z0-9]{8,32}$/.test(nonce) ? nonce : null;
  } catch {
    return null;
  }
}
