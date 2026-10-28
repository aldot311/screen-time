import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseVideoStream } from "@meta-sam/parser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ClientOptions,
  type FetchLike,
  MetaApiError,
  samVideo,
  sparkJson,
  toAsyncIterable,
  transcribe,
  uploadFile,
} from "./index";

interface Call {
  url: string;
  init: RequestInit;
}

function mockFetch(responses: Array<() => Response>): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init: init ?? {} });
    const next = responses[calls.length - 1];
    if (!next) throw new Error(`unexpected request #${calls.length}`);
    return next();
  };
  return { fetch, calls };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => () =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const noSleep = { sleep: async () => undefined, random: () => 0.5 };
const opts = (fetch: FetchLike): ClientOptions => ({ fetch, apiKey: "test-key", ...noSleep });

// One frame of SAM 3.1 output, taken from the @meta-sam/parser README.
const FRAME0 =
  "<0f>0<|box;x1=211;y1=228;x2=270;y2=254;w=320;h=334|>" +
  "<|mask;x=0;y=0;data=27,60,~!!!!M!0c[0o91w?q1!pIH4pPRVp2B3'7`e.ioeAf6-k/#Xd8%dX9x(|>\n";

function sse(events: unknown[]): string {
  return events.map((e) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
}

const lane = { item_id: "msg-1", output_index: 0, content_index: 0 };

describe("api key", () => {
  const saved = process.env.META_MODEL_API_KEY;
  beforeEach(() => {
    delete process.env.META_MODEL_API_KEY;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.META_MODEL_API_KEY;
    else process.env.META_MODEL_API_KEY = saved;
  });

  it("fails clearly before any request when the key is missing", async () => {
    const { fetch, calls } = mockFetch([]);
    await expect(uploadFile(Buffer.from("x"), "a.mp4", { fetch })).rejects.toThrow(/META_MODEL_API_KEY is not set/);
    expect(calls).toHaveLength(0);
  });

  it("reads the key lazily from the environment", async () => {
    process.env.META_MODEL_API_KEY = "env-key";
    const { fetch, calls } = mockFetch([json({ id: "file-1" })]);
    await uploadFile(Buffer.from("x"), "a.mp4", { fetch });
    expect(new Headers(calls[0].init.headers).get("authorization")).toBe("Bearer env-key");
  });
});

describe("uploadFile", () => {
  it("posts multipart with purpose=user_data and the file part last", async () => {
    const { fetch, calls } = mockFetch([json({ id: "file-842549258569145", object: "file" })]);
    const id = await uploadFile(Buffer.from("fake mp4"), "clip.mp4", opts(fetch));

    expect(id).toBe("file-842549258569145");
    expect(calls[0].url).toBe("https://api.meta.ai/v1/files");
    expect(calls[0].init.method).toBe("POST");
    const form = calls[0].init.body as FormData;
    expect([...form.keys()]).toEqual(["purpose", "file"]);
    expect(form.get("purpose")).toBe("user_data");
    const file = form.get("file") as File;
    expect(file.name).toBe("clip.mp4");
    expect(file.type).toBe("video/mp4");
    expect(await file.text()).toBe("fake mp4");
  });

  it("reads a path and uses its basename", async () => {
    const dir = await mkdtemp(join(tmpdir(), "meta-upload-"));
    const path = join(dir, "shot.mov");
    await writeFile(path, "movie");
    const { fetch, calls } = mockFetch([json({ id: "file-2" })]);
    await uploadFile(path, undefined, opts(fetch));
    const file = (calls[0].init.body as FormData).get("file") as File;
    expect(file.name).toBe("shot.mov");
    expect(file.type).toBe("video/quicktime");
  });
});

describe("samVideo", () => {
  it("sends a streaming sam-3.1 request with string metadata and returns parser-ready events", async () => {
    const body = sse([
      { type: "response.created", sequence_number: 0, response: { id: "r1" } },
      { type: "response.output_text.delta", ...lane, delta: FRAME0.slice(0, 40), sequence_number: 1 },
      { type: "response.output_text.delta", ...lane, delta: FRAME0.slice(40), sequence_number: 2 },
      { type: "response.output_text.done", ...lane, text: FRAME0, sequence_number: 3 },
      { type: "response.completed", sequence_number: 4, response: { usage: { video_frames_processed: 134 } } },
    ]);
    const { fetch, calls } = mockFetch([() => new Response(body, { headers: { "content-type": "text/event-stream" } })]);

    const result = await samVideo({ fileId: "file-abc123", prompt: "red can", includeConfidence: true }, opts(fetch));

    expect(calls[0].url).toBe("https://api.meta.ai/v1/responses");
    const headers = new Headers(calls[0].init.headers);
    expect(headers.get("accept")).toBe("text/event-stream");
    expect(headers.get("content-type")).toBe("application/json");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      model: "sam-3.1",
      input: [
        {
          type: "message",
          role: "user",
          content: [
            { type: "input_text", text: "red can" },
            { type: "input_video", file_id: "file-abc123" },
          ],
        },
      ],
      metadata: { include_confidence: "true" },
      stream: true,
    });

    expect(result.outputText).toBe(FRAME0);
    expect(result.framesProcessed).toBe(134);

    const parsed = await parseVideoStream(toAsyncIterable(result.events)).finalResult;
    expect(parsed.outcome).toEqual({ status: "completed" });
    expect(parsed.rawOutput).toBe(FRAME0);
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.records.length).toBeGreaterThan(0);
  });

  it("returns null frames when usage is absent and treats zero matches as a normal result", async () => {
    const body = sse([{ type: "response.completed", response: {} }]) + "data: [DONE]\n\n";
    const { fetch } = mockFetch([() => new Response(body)]);
    const result = await samVideo({ fileId: "f", prompt: "x" }, opts(fetch));
    expect(result.outputText).toBe("");
    expect(result.framesProcessed).toBeNull();
  });

  it("raises a terminal stream error that arrives under HTTP 200", async () => {
    const body = sse([{ type: "error", code: "server_error", message: "boom", param: null }]);
    const { fetch } = mockFetch([() => new Response(body)]);
    await expect(samVideo({ fileId: "f", prompt: "x" }, opts(fetch))).rejects.toMatchObject({
      name: "MetaApiError",
      code: "server_error",
    });
  });

  it("rejects a stream that ends without response.completed instead of returning partial frames", async () => {
    const body = sse([{ type: "response.output_text.delta", delta: FRAME0, ...lane }]);
    const { fetch } = mockFetch([() => new Response(body)]);
    await expect(samVideo({ fileId: "f", prompt: "x" }, opts(fetch))).rejects.toThrow(/truncated/);
  });

  it("raises response.incomplete with its reason", async () => {
    const body = sse([{ type: "response.incomplete", response: { incomplete_details: { reason: "max_output_tokens" } } }]);
    const { fetch } = mockFetch([() => new Response(body)]);
    await expect(samVideo({ fileId: "f", prompt: "x" }, opts(fetch))).rejects.toThrow(/max_output_tokens/);
  });
});

describe("sparkJson", () => {
  const schema = {
    type: "object",
    properties: { verdict: { type: "string" } },
    required: ["verdict"],
    additionalProperties: false,
  };

  it("builds a Responses request with text.format json_schema and parses the output", async () => {
    const { fetch, calls } = mockFetch([
      json({
        status: "completed",
        output: [
          { type: "reasoning", summary: [] },
          { type: "message", role: "assistant", content: [{ type: "output_text", text: '{"verdict":"match"}' }] },
        ],
      }),
    ]);

    const out = await sparkJson<{ verdict: string }>(
      {
        input: [
          { type: "input_text", text: "Is this the brand?" },
          { type: "input_image", image_url: "data:image/jpeg;base64,AAAA" },
        ],
        schema,
        name: "verify_track",
        maxOutputTokens: 2000,
      },
      opts(fetch),
    );

    expect(out).toEqual({ verdict: "match" });
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      model: "muse-spark-1.3",
      input: [
        {
          type: "message",
          role: "user",
          content: [
            { type: "input_text", text: "Is this the brand?" },
            { type: "input_image", image_url: "data:image/jpeg;base64,AAAA" },
          ],
        },
      ],
      text: { format: { type: "json_schema", name: "verify_track", schema } },
      reasoning: { effort: "low" },
      max_output_tokens: 2000,
    });
  });

  it("runs the validator and rejects incomplete responses", async () => {
    const ok = mockFetch([
      json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: '{"verdict":1}' }] }] }),
    ]);
    const validate = vi.fn(() => {
      throw new Error("bad shape");
    });
    await expect(sparkJson({ input: [], schema, name: "n" }, { ...opts(ok.fetch), validate })).rejects.toThrow("bad shape");
    expect(validate).toHaveBeenCalledWith({ verdict: 1 });

    const cut = mockFetch([json({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: [] })]);
    await expect(sparkJson({ input: [], schema, name: "n" }, opts(cut.fetch))).rejects.toThrow(/max_output_tokens/);
  });
});

describe("transcribe", () => {
  it("sends a JSON request part and an audio part, and maps turns", async () => {
    const { fetch, calls } = mockFetch([
      json({
        sessionId: "s1",
        transcript: "hello there. try this drink",
        audioDurationMs: 9000,
        turns: [
          { turnId: 0, startMs: 1520, endMs: 3100, transcript: "hello there." },
          { turnId: 1, startMs: 5900, endMs: 8000, transcript: "try this drink" },
        ],
      }),
    ]);
    const out = await transcribe(Buffer.from("RIFF....WAVE"), opts(fetch));

    expect(calls[0].url).toBe("https://api.meta.ai/v1/asr/transcribe");
    expect(new Headers(calls[0].init.headers).get("accept")).toBe("application/json");
    const form = calls[0].init.body as FormData;
    expect([...form.keys()]).toEqual(["request", "audio"]);
    const request = form.get("request") as File;
    expect(request.type).toBe("application/json");
    expect(JSON.parse(await request.text())).toEqual({
      model: "muse-voice-transcribe-1.0",
      audioEncoding: "WAV",
      mode: "ENDPOINTING",
    });
    const audio = form.get("audio") as File;
    expect(audio.type).toBe("audio/wav");
    expect(audio.name).toBe("audio.wav");

    expect(out).toEqual({
      transcript: "hello there. try this drink",
      turns: [
        { startMs: 1520, endMs: 3100, transcript: "hello there." },
        { startMs: 5900, endMs: 8000, transcript: "try this drink" },
      ],
    });
  });
});

describe("retries and errors", () => {
  const errorBody = (status: number, code: string, type = "invalid_request_error") =>
    json({ error: { message: `${code} happened`, type, param: null, code } }, status);

  it.each([400, 401, 402, 403, 404, 413])("never retries %i and surfaces the error envelope", async (status) => {
    const { fetch, calls } = mockFetch([errorBody(status, "nope"), json({ id: "file-x" })]);
    const err = await uploadFile(Buffer.from("x"), "a.mp4", opts(fetch)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MetaApiError);
    expect(err).toMatchObject({ status, code: "nope", type: "invalid_request_error" });
    expect(calls).toHaveLength(1);
  });

  it("handles a 404 with an empty body", async () => {
    const { fetch } = mockFetch([() => new Response("", { status: 404 })]);
    await expect(uploadFile(Buffer.from("x"), "a.mp4", opts(fetch))).rejects.toMatchObject({ status: 404, code: null });
  });

  it.each([429, 500, 503, 504])("retries %i then succeeds, rebuilding the body each time", async (status) => {
    const { fetch, calls } = mockFetch([errorBody(status, "busy", "server_error"), json({ id: "file-ok" })]);
    expect(await uploadFile(Buffer.from("x"), "a.mp4", opts(fetch))).toBe("file-ok");
    expect(calls).toHaveLength(2);
    expect(calls[0].init.body).not.toBe(calls[1].init.body);
    expect((calls[1].init.body as FormData).get("purpose")).toBe("user_data");
  });

  it("honors Retry-After as a floor on the backoff delay", async () => {
    const sleeps: number[] = [];
    const { fetch } = mockFetch([
      json({ error: { message: "slow down", type: "rate_limit_error", code: "rate_limit_exceeded" } }, 429, { "retry-after": "7" }),
      json({ error: { message: "overloaded", type: "server_error", code: "service_overloaded" } }, 503),
      json({ id: "file-ok" }),
    ]);
    await uploadFile(Buffer.from("x"), "a.mp4", {
      fetch,
      apiKey: "k",
      random: () => 0.5,
      baseDelayMs: 1000,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    // attempt 0: max(7000, 1000*0.5); attempt 1: 2000*0.5 jitter
    expect(sleeps).toEqual([7000, 1000]);
  });

  it("gives up after maxRetries and throws the last error", async () => {
    const busy = errorBody(503, "backend_unavailable", "server_error");
    const { fetch, calls } = mockFetch([busy, busy, busy]);
    await expect(uploadFile(Buffer.from("x"), "a.mp4", { ...opts(fetch), maxRetries: 2 })).rejects.toMatchObject({
      status: 503,
      code: "backend_unavailable",
    });
    expect(calls).toHaveLength(3);
  });

  it("retries network failures", async () => {
    const { fetch, calls } = mockFetch([
      () => {
        throw new TypeError("fetch failed");
      },
      json({ id: "file-ok" }),
    ]);
    expect(await uploadFile(Buffer.from("x"), "a.mp4", opts(fetch))).toBe("file-ok");
    expect(calls).toHaveLength(2);
  });

  it("does not retry a SAM call after a network failure, so a video is never billed twice", async () => {
    const { fetch, calls } = mockFetch([
      () => {
        throw new TypeError("fetch failed");
      },
    ]);
    await expect(samVideo({ fileId: "file-1", prompt: "can" }, opts(fetch))).rejects.toThrow("fetch failed");
    expect(calls).toHaveLength(1);
  });
});

describe("review regressions", () => {
  it("raises a SAM refusal even when response.completed follows it", async () => {
    const body = sse([
      { type: "response.refusal.delta", delta: "I can't help", ...lane },
      { type: "response.refusal.done", refusal: "I can't help with that", ...lane },
      { type: "response.completed", response: {} },
    ]);
    const { fetch } = mockFetch([() => new Response(body)]);
    const err = await samVideo({ fileId: "f", prompt: "x" }, opts(fetch)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MetaApiError);
    expect((err as Error).message).toMatch(/refused: I can't help with that/);
  });

  it("raises the stream truncated error, not a SyntaxError, on a cut-off final SSE event", async () => {
    const body = sse([{ type: "response.output_text.delta", delta: FRAME0, ...lane }]) + 'data: {"type":"response.compl';
    const { fetch } = mockFetch([() => new Response(body)]);
    const err = await samVideo({ fileId: "f", prompt: "x" }, opts(fetch)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MetaApiError);
    expect((err as Error).message).toMatch(/truncated/);
  });

  it("surfaces body.error when a Spark body has no status", async () => {
    const { fetch } = mockFetch([json({ error: { message: "model overloaded" }, output: [] })]);
    await expect(
      sparkJson({ input: [], schema: { type: "object" }, name: "n" }, opts(fetch)),
    ).rejects.toThrow(/model overloaded/);
  });

  it("throws instead of sleeping when Retry-After is longer than the hard ceiling", async () => {
    const sleeps: number[] = [];
    const { fetch, calls } = mockFetch([
      json({ error: { message: "come back tomorrow", type: "rate_limit_error", code: "rate_limit_exceeded" } }, 429, {
        "retry-after": "86400",
      }),
      json({ id: "file-ok" }),
    ]);
    const err = await uploadFile(Buffer.from("x"), "a.mp4", {
      ...opts(fetch),
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    }).catch((e: unknown) => e);
    expect(err).toMatchObject({ name: "MetaApiError", status: 429, code: "rate_limit_exceeded" });
    expect(sleeps).toEqual([]);
    expect(calls).toHaveLength(1);
  });
});
