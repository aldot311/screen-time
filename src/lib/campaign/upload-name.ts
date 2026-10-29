/** A storage name the upload route accepts ([\w.-]+.mp4|mov): "Final cut (2).MOV" -> "final-cut-2.mov". */
export function safeUploadName(file: { name: string; type: string }): string {
  const ext = file.type === "video/quicktime" || /\.mov$/i.test(file.name) ? "mov" : "mp4";
  const base = file.name.replace(/\.[^.]+$/, "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return `${base || "video"}.${ext}`;
}
