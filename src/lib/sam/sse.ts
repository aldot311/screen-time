// Server-sent events from the Responses API, turned back into the JSON event objects the parser reads.

export interface StreamEvent {
  readonly type: string;
  readonly [key: string]: unknown;
}

/**
 * Splits SSE text into events. Only `data:` lines matter; `event:` names repeat the JSON `type`.
 * An unparseable final event is a cut-off stream: it is dropped, so the missing `response.completed` raises downstream.
 * An unparseable event anywhere else is malformed and throws.
 */
export function parseSseEvents(text: string): StreamEvent[] {
  const payloads = text
    .replace(/\r\n?/g, "\n")
    .split(/\n\n+/)
    .map((block) =>
      block
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).replace(/^ /, ""))
        .join("\n"),
    )
    .filter((data) => data !== "" && data !== "[DONE]");
  const events: StreamEvent[] = [];
  payloads.forEach((data, i) => {
    let event: unknown;
    try {
      event = JSON.parse(data);
    } catch (error) {
      if (i === payloads.length - 1) return;
      throw new Error(`malformed SSE event ${i + 1} of ${payloads.length}: ${(error as Error).message}`);
    }
    if (isEvent(event)) events.push(event);
  });
  return events;
}

export async function readStreamText(stream: ReadableStream<Uint8Array | string>): Promise<string> {
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += typeof value === "string" ? value : decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function isEvent(value: unknown): value is StreamEvent {
  return typeof value === "object" && value !== null && typeof (value as { type?: unknown }).type === "string";
}
