// Meta's open-weight Muse Spark Open, for the object check, through an OpenAI-compatible host (Fireworks, Baseten,
// Modal, or OpenRouter pinned to one of them). The Meta Model API does not serve it to this account (checked
// 2026-10-29), so a campaign that picks the open-weight engine sends each object's crops here instead.
//
// Env: OPEN_BASE_URL (e.g. https://api.fireworks.ai/inference/v1), OPEN_MODEL (the host's model id), OPEN_API_KEY,
// OPEN_PROVIDER (the host's name, for the receipt) and, on OpenRouter only, OPEN_PROVIDER_ONLY (a provider slug to pin).
import type { SparkContentPart } from "./client";
import type { FetchLike } from "./http";

export interface OpenWeightConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
  /** Who serves it, as shown on the receipt: "Fireworks". */
  provider: string;
  /** OpenRouter's provider routing: send only to this provider, never fall back to another. */
  only?: string;
}

/** The configured host, or null when the open-weight engine is not set up on this deployment. */
export function openWeightConfig(env: Record<string, string | undefined> = process.env): OpenWeightConfig | null {
  const baseUrl = env.OPEN_BASE_URL?.trim().replace(/\/+$/, "");
  const model = env.OPEN_MODEL?.trim();
  const apiKey = env.OPEN_API_KEY?.trim();
  if (!baseUrl || !model || !apiKey) return null;
  const only = env.OPEN_PROVIDER_ONLY?.trim() || undefined;
  return { baseUrl, model, apiKey, provider: env.OPEN_PROVIDER?.trim() || only || new URL(baseUrl).hostname, only };
}

/** The receipt's name for the open-weight model: "muse-spark-open". */
export const openModelName = (cfg: OpenWeightConfig) => cfg.model.split("/").pop()!;

export function buildOpenJsonBody(cfg: OpenWeightConfig, req: { name: string; schema: Record<string, unknown>; input: SparkContentPart[] }) {
  return {
    model: cfg.model,
    messages: [
      {
        role: "user",
        content: req.input.map((p) => (p.type === "input_text" ? { type: "text", text: p.text } : { type: "image_url", image_url: { url: p.image_url } })),
      },
    ],
    response_format: { type: "json_schema", json_schema: { name: req.name, schema: req.schema, strict: true } },
    ...(cfg.only ? { provider: { only: [cfg.only], allow_fallbacks: false } } : {}),
  };
}

interface ChatBody {
  choices?: { message?: { content?: string | null; refusal?: string | null } }[];
  error?: { message?: string } | string;
}

/** Runs one chat completion constrained to `schema` on the open-weight host and parses its JSON. */
export async function openJson<T>(
  cfg: OpenWeightConfig,
  req: { name: string; schema: Record<string, unknown>; input: SparkContentPart[] },
  opts: { fetch?: FetchLike; timeoutMs?: number } = {},
): Promise<T> {
  const res = await (opts.fetch ?? fetch)(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify(buildOpenJsonBody(cfg, req)),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
  });
  const body = (await res.json().catch(() => ({}))) as ChatBody;
  if (!res.ok || body.error) {
    const why = typeof body.error === "string" ? body.error : body.error?.message;
    throw new Error(`${cfg.provider} returned ${res.status}${why ? `: ${why.slice(0, 160)}` : ""}`);
  }
  const msg = body.choices?.[0]?.message;
  if (msg?.refusal) throw new Error(`Muse Spark Open refused: ${msg.refusal}`);
  const text = msg?.content ?? "";
  if (!text) throw new Error("Muse Spark Open returned no content");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Muse Spark Open output was not valid JSON: ${text.slice(0, 200)}`);
  }
}
