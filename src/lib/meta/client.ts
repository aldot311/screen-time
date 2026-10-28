// Thin Meta Model API client: Files upload, SAM 3.1 video, Muse Spark structured output, Voice transcribe.
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { type ClientOptions, MetaApiError, metaRequest } from "./http";
import { parseSseEvents, type StreamEvent } from "./sse";

const MIME_BY_EXT: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

function mimeFor(filename: string): string {
  return MIME_BY_EXT[extname(filename).toLowerCase()] ?? "application/octet-stream";
}

function toBlob(bytes: Uint8Array, type: string): Blob {
  // Copy into a plain ArrayBuffer so Buffer's shared pool never leaks into the upload.
  return new Blob([new Uint8Array(bytes)], { type });
}

// ---------- Files ----------

/** Uploads a file (path or bytes) with purpose=user_data and returns its file id. */
export async function uploadFile(
  source: string | Uint8Array,
  filename?: string,
  opts: ClientOptions = {},
): Promise<string> {
  const name = filename ?? (typeof source === "string" ? basename(source) : undefined);
  if (!name) throw new Error("uploadFile needs a filename when given raw bytes");
  const bytes = typeof source === "string" ? await readFile(source) : source;
  const blob = toBlob(bytes, mimeFor(name));

  const res = await metaRequest(
    "/files",
    {
      headers: { Accept: "application/json" },
      makeBody: () => {
        // The docs ask for the file part last so the server can start on metadata early.
        const form = new FormData();
        form.append("purpose", "user_data");
        form.append("file", blob, name);
        return form;
      },
    },
    opts,
  );
  const json = (await res.json()) as { id?: unknown };
  if (typeof json.id !== "string") throw new Error("Files upload response had no id");
  return json.id;
}

// ---------- SAM 3.1 video ----------

export interface SamVideoInput {
  fileId: string;
  prompt: string;
  includeConfidence?: boolean;
  maskEncoding?: "lossless" | "one_bit";
}

export interface SamVideoResult {
  /** Responses stream events, ready for parseVideoStream(toAsyncIterable(events)). */
  events: StreamEvent[];
  /** Concatenated output_text deltas (the special-token frame lines). */
  outputText: string;
  /** usage.video_frames_processed from response.completed; null if the server omitted it. */
  framesProcessed: number | null;
  raw: string;
}

export function buildSamVideoBody(input: SamVideoInput): Record<string, unknown> {
  const metadata: Record<string, string> = {
    include_confidence: input.includeConfidence ? "true" : "false",
  };
  if (input.maskEncoding) metadata.mask_encoding = input.maskEncoding;
  return {
    model: "sam-3.1",
    input: [
      {
        type: "message",
        role: "user",
        content: [
          { type: "input_text", text: input.prompt },
          { type: "input_video", file_id: input.fileId },
        ],
      },
    ],
    metadata,
    stream: true,
  };
}

/** Reads a buffered SAM stream: text, billed frames, and stream-level failures (which arrive under HTTP 200). */
export function readSamStream(raw: string): SamVideoResult {
  const events = parseSseEvents(raw);
  let outputText = "";
  let framesProcessed: number | null = null;
  let completed = false;
  let refusal = "";
  for (const event of events) {
    if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
      outputText += event.delta;
    } else if (event.type === "response.completed") {
      completed = true;
      const usage = (event.response as { usage?: { video_frames_processed?: unknown } } | undefined)?.usage;
      if (typeof usage?.video_frames_processed === "number") framesProcessed = usage.video_frames_processed;
    } else if (event.type === "response.refusal.done") {
      throw new MetaApiError(`SAM refused: ${String(event.refusal ?? "")}`, { status: 200, code: "refusal" });
    } else if (event.type === "response.refusal.delta") {
      refusal += typeof event.delta === "string" ? event.delta : "";
    } else if (event.type === "error") {
      throw new MetaApiError(`SAM stream error: ${String(event.message ?? "unknown")}`, {
        status: 200,
        code: (event.code as string | null) ?? null,
        param: (event.param as string | null) ?? null,
      });
    } else if (event.type === "response.failed") {
      const err = (event.response as { error?: { message?: string; code?: string } } | undefined)?.error;
      throw new MetaApiError(`SAM response failed: ${err?.message ?? "unknown"}`, {
        status: 200,
        code: err?.code ?? null,
      });
    } else if (event.type === "response.incomplete") {
      const why = (event.response as { incomplete_details?: { reason?: string } | null } | undefined)
        ?.incomplete_details?.reason;
      throw new MetaApiError(`SAM response incomplete: ${why ?? "unknown"}`, { status: 200 });
    }
  }
  // A refusal is never a result, even when the stream skipped refusal.done and still completed.
  if (refusal) throw new MetaApiError(`SAM refused: ${refusal}`, { status: 200, code: "refusal" });
  // A dropped connection leaves a partial frame list that would otherwise look like a valid result.
  if (!completed) {
    throw new MetaApiError("SAM stream ended without response.completed (truncated)", { status: 200 });
  }
  return { events, outputText, framesProcessed, raw };
}

export async function samVideo(input: SamVideoInput, opts: ClientOptions = {}): Promise<SamVideoResult> {
  const body = JSON.stringify(buildSamVideoBody(input));
  const res = await metaRequest(
    "/responses",
    {
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      makeBody: () => body,
      retryNetworkErrors: false,
    },
    opts,
  );
  return readSamStream(await res.text());
}

// ---------- Muse Spark structured output ----------

export type SparkContentPart =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string };

export type ReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export interface SparkJsonInput {
  input: SparkContentPart[];
  schema: Record<string, unknown>;
  name: string;
  model?: string;
  reasoningEffort?: ReasoningEffort;
  maxOutputTokens?: number;
  instructions?: string;
  strict?: boolean;
}

export function buildSparkJsonBody(req: SparkJsonInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: req.model ?? "muse-spark-1.3",
    input: [{ type: "message", role: "user", content: req.input }],
    text: {
      format: {
        type: "json_schema",
        name: req.name,
        schema: req.schema,
        ...(req.strict === undefined ? {} : { strict: req.strict }),
      },
    },
    reasoning: { effort: req.reasoningEffort ?? "low" },
  };
  if (req.instructions) body.instructions = req.instructions;
  if (req.maxOutputTokens !== undefined) body.max_output_tokens = req.maxOutputTokens;
  return body;
}

interface ResponsesBody {
  status?: string;
  incomplete_details?: { reason?: string } | null;
  error?: { message?: string } | null;
  output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string; refusal?: string }> }>;
}

/** Pulls the output_text from a non-streaming Responses body and parses it as JSON. */
export function extractJsonOutput(body: ResponsesBody): unknown {
  if ((body.status && body.status !== "completed") || (!body.status && body.error)) {
    const why = body.incomplete_details?.reason ?? body.error?.message ?? body.status ?? "error";
    throw new Error(`Muse Spark response not completed: ${why}`);
  }
  let text = "";
  for (const item of body.output ?? []) {
    if (item.type !== "message") continue;
    for (const part of item.content ?? []) {
      if (part.type === "refusal") throw new Error(`Muse Spark refused: ${part.refusal ?? ""}`);
      if (part.type === "output_text" && typeof part.text === "string") text += part.text;
    }
  }
  if (!text) throw new Error("Muse Spark response had no output_text");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Muse Spark output was not valid JSON: ${text.slice(0, 200)}`);
  }
}

/** Runs a Responses call constrained to `schema`. Pass a zod `.parse` as `validate` to get a typed result. */
export async function sparkJson<T = unknown>(
  req: SparkJsonInput,
  opts: ClientOptions & { validate?: (value: unknown) => T } = {},
): Promise<T> {
  const body = JSON.stringify(buildSparkJsonBody(req));
  const res = await metaRequest(
    "/responses",
    {
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      makeBody: () => body,
      // A dropped connection may still have been billed; let the caller decide rather than pay twice.
      retryNetworkErrors: false,
    },
    opts,
  );
  const value = extractJsonOutput((await res.json()) as ResponsesBody);
  return opts.validate ? opts.validate(value) : (value as T);
}

// ---------- Voice transcribe ----------

export interface TranscriptTurn {
  startMs: number;
  endMs: number;
  transcript: string;
}

export interface TranscribeResult {
  transcript: string;
  turns: TranscriptTurn[];
}

export const TRANSCRIBE_REQUEST = {
  model: "muse-voice-transcribe-1.0",
  audioEncoding: "WAV",
  mode: "ENDPOINTING",
} as const;

/** Transcribes mono 16-bit PCM WAV (16 or 24 kHz, at most 10 minutes) into turn-level text. */
export async function transcribe(wav: Uint8Array, opts: ClientOptions = {}): Promise<TranscribeResult> {
  const audio = toBlob(wav, "audio/wav");
  const request = new Blob([JSON.stringify(TRANSCRIBE_REQUEST)], { type: "application/json" });
  const res = await metaRequest(
    "/asr/transcribe",
    {
      headers: { Accept: "application/json" },
      makeBody: () => {
        const form = new FormData();
        form.append("request", request);
        form.append("audio", audio, "audio.wav");
        return form;
      },
      retryNetworkErrors: false,
    },
    opts,
  );
  const json = (await res.json()) as { transcript?: string; turns?: Array<Partial<TranscriptTurn>> };
  return {
    transcript: json.transcript ?? "",
    turns: (json.turns ?? []).map((t) => ({
      startMs: Number(t.startMs ?? 0),
      endMs: Number(t.endMs ?? 0),
      transcript: t.transcript ?? "",
    })),
  };
}
