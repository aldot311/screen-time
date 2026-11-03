// The client's address, for per-visitor limits. On Vercel the edge sets x-vercel-forwarded-for and x-real-ip itself,
// so those come first; x-forwarded-for is only a fallback elsewhere, where every one of these headers is the client's
// to set. Limits keyed on it are best effort; the daily caps behind them are what bound the cost.

export function clientIp(headers: Headers): string {
  return (
    headers.get("x-vercel-forwarded-for")?.split(",")[0].trim() ||
    headers.get("x-real-ip")?.trim() ||
    headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    "unknown"
  );
}

/** What a limit counts by: the IPv4 address, or the /64 of an IPv6 one (one holder usually controls the whole /64). */
export function clientKey(ip: string): string {
  let v = ip.trim().toLowerCase().slice(0, 64);
  // An IPv4 address written as IPv6 ("::ffff:1.2.3.4") is that IPv4 address.
  if (v.startsWith("::ffff:") && v.includes(".")) v = v.slice(7);
  if (!v.includes(":")) return v;
  v = v.split("%")[0]; // a zone id ("fe80::1%eth0")
  const halves = v.split("::");
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length > 1 && halves[1] ? halves[1].split(":") : [];
  // "2001:db8::1" has its zero groups folded into "::": unfold them, so every spelling of one /64 gives one key.
  const groups = halves.length > 1 ? [...head, ...Array<string>(Math.max(0, 8 - head.length - tail.length)).fill("0"), ...tail] : head;
  return `${groups
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, ""))
    .join(":")}::/64`;
}
