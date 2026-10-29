import { describe, expect, it } from "vitest";
import { buildOpenJsonBody, openJson, openModelName, openWeightConfig } from "./open-weight";

const cfg = { baseUrl: "https://openrouter.ai/api/v1", model: "meta/muse-spark-open", apiKey: "k", provider: "fireworks", only: "fireworks" };
const req = { name: "product_check", schema: { type: "object" }, input: [{ type: "input_text" as const, text: "Is it?" }, { type: "input_image" as const, image_url: "data:image/jpeg;base64,AA" }] };

describe("openWeightConfig", () => {
  it("is null until base URL, model and key are all set", () => {
    expect(openWeightConfig({ OPEN_BASE_URL: "https://x/v1", OPEN_MODEL: "m" })).toBeNull();
    expect(openWeightConfig({})).toBeNull();
  });
  it("trims the URL and names the provider from the pin, then the host", () => {
    expect(openWeightConfig({ OPEN_BASE_URL: "https://api.fireworks.ai/inference/v1/", OPEN_MODEL: "m", OPEN_API_KEY: "k" })).toMatchObject({
      baseUrl: "https://api.fireworks.ai/inference/v1",
      provider: "api.fireworks.ai",
    });
    expect(openWeightConfig({ OPEN_BASE_URL: "https://openrouter.ai/api/v1", OPEN_MODEL: "m", OPEN_API_KEY: "k", OPEN_PROVIDER_ONLY: "fireworks" })?.provider).toBe("fireworks");
    expect(openWeightConfig({ OPEN_BASE_URL: "https://x/v1", OPEN_MODEL: "m", OPEN_API_KEY: "k", OPEN_PROVIDER: "Fireworks" })?.provider).toBe("Fireworks");
  });
  it("names the model without the host's namespace", () => expect(openModelName(cfg)).toBe("muse-spark-open"));
});

describe("buildOpenJsonBody", () => {
  it("sends text and images as chat content with a strict schema and pins the provider", () => {
    const body = buildOpenJsonBody(cfg, req);
    expect(body.messages[0].content).toEqual([
      { type: "text", text: "Is it?" },
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,AA" } },
    ]);
    expect(body.response_format).toEqual({ type: "json_schema", json_schema: { name: "product_check", schema: { type: "object" }, strict: true } });
    expect(body.provider).toEqual({ only: ["fireworks"], allow_fallbacks: false });
    expect(buildOpenJsonBody({ ...cfg, only: undefined }, req)).not.toHaveProperty("provider");
  });
});

describe("openJson", () => {
  const reply = (body: unknown, status = 200) => async () => Response.json(body, { status });
  it("parses the JSON content", async () => {
    await expect(openJson(cfg, req, { fetch: reply({ choices: [{ message: { content: '{"verdict":"match"}' } }] }) })).resolves.toEqual({ verdict: "match" });
  });
  it("throws on an HTTP error, an empty answer, a refusal and broken JSON", async () => {
    await expect(openJson(cfg, req, { fetch: reply({ error: { message: "budget exceeded" } }, 403) })).rejects.toThrow("fireworks returned 403: budget exceeded");
    await expect(openJson(cfg, req, { fetch: reply({ choices: [{ message: { content: null } }] }) })).rejects.toThrow("no content");
    await expect(openJson(cfg, req, { fetch: reply({ choices: [{ message: { content: "", refusal: "no" } }] }) })).rejects.toThrow("refused");
    await expect(openJson(cfg, req, { fetch: reply({ choices: [{ message: { content: "{oops" } }] }) })).rejects.toThrow("not valid JSON");
  });
});
