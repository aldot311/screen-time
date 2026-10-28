// Minimal server-sent-events reader for buffered Responses API streams.

export interface StreamEvent {
  type: string;
  [key: string]: unknown;
}

/** Splits an SSE body into JSON events. Comments, keepalives and the [DONE] sentinel are skipped. */
export function parseSseEvents(body: string): StreamEvent[] {
  const events: StreamEvent[] = [];
  const blocks = body.replace(/\r\n?/g, "\n").split("\n\n");
  for (const [i, block] of blocks.entries()) {
    const data = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, ""))
      .join("\n");
    if (!data || data === "[DONE]") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch (err) {
      // An unterminated last block is a dropped connection; callers detect truncation from the missing events.
      if (i === blocks.length - 1) continue;
      throw err;
    }
    if (parsed && typeof parsed === "object" && typeof (parsed as StreamEvent).type === "string") {
      events.push(parsed as StreamEvent);
    }
  }
  return events;
}

/** The @meta-sam/parser entry points take an AsyncIterable of events. */
export async function* toAsyncIterable<T>(items: readonly T[]): AsyncIterable<T> {
  for (const item of items) yield item;
}
