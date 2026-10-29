// The follow-up agent's loop against a scripted Muse Spark: tool calls, their results fed back, and the guardrails.
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CostGuard } from "@/lib/meta/cost-guard";
import type { Campaign, VideoEntry } from "@/lib/campaign/types";
import type { TermResult, VideoReport } from "@/lib/types";
import { runAgent, type AgentWorld } from "./campaign-agent";

const campaign = { id: "c", name: "Fall", brand: "Alani Nu", fee: 300, creators: [] } as unknown as Campaign;
const term = (pass: boolean): TermResult => ({ term: { text: "Say the brand name at least once", rule: { kind: "mentioned", minTimes: 1 } }, pass, evidence: [], detail: pass ? "Mentioned 1 time." : "Mentioned 0 times (needs 1 time)." });
const report = (pass: boolean) =>
  ({
    info: { durationSec: 12, frameCount: 180, width: 1, height: 1 },
    metrics: { secondsOnScreen: 8, segments: [], mentions: [], longestRunSec: 8, firstSeenSec: 0 },
    tracks: [{ objectId: 0, verdict: "match", visibility: "clear", reason: "teal can" }],
    terms: [term(pass)],
  }) as unknown as VideoReport;
const video = (id: string, over: Partial<VideoEntry> = {}): VideoEntry =>
  ({ id, campaignId: "c", creator: "@maya", title: `${id}.mp4`, videoUrl: "", status: "done", step: null, createdAt: `2026-10-2${id.length}T00:00:00Z`, updatedAt: "", report: report(false), ...over }) as VideoEntry;

type Item = Record<string, unknown>;
const call = (name: string, args: object, id = name): Item => ({ type: "function_call", name, arguments: JSON.stringify(args), call_id: id });
const say = (text: string): Item => ({ type: "message", content: [{ type: "output_text", text }] });

/** A fake /responses that plays `turns` in order and records every request body. */
function script(turns: Item[][]) {
  const bodies: { input: Item[]; tool_choice: string; tools: { name: string }[] }[] = [];
  const fetch = async (_url: string, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    const output = turns[bodies.length - 1] ?? [say("done")];
    return Response.json({ status: "completed", output });
  };
  return { fetch, bodies };
}

async function guard() {
  const dir = await mkdtemp(join(tmpdir(), "st-agent-"));
  return new CostGuard({ maxUsdPerRun: 1, maxUsdTotal: 1, ledgerPath: join(dir, "ledger.json") });
}

const world = (over: Partial<AgentWorld> = {}): AgentWorld => ({
  campaign,
  video: video("v1"),
  history: async () => [video("v1")],
  analyze: async () => {
    throw new Error("not expected");
  },
  ...over,
});

describe("runAgent", () => {
  it("calls tools, feeds their results back, and keeps the draft, the call and the queued re-cut without sending anything", async () => {
    const { fetch, bodies } = script([
      [call("get_report", {}), call("get_creator_history", {})],
      [
        call("draft_creator_note", { message: "Hi Maya! Could you say Alani Nu once? Our check heard it 0 times." }),
        call("recommend_payout", { decision: "hold", reason: "The brand name was never said." }),
        call("request_recut", { reason: "Missing the spoken brand name." }),
      ],
      [say("Maya's video missed the spoken brand name. A note and a re-cut request are waiting for your approval.")],
    ]);
    const g = await guard();
    const steps: number[] = [];
    const run = await runAgent(world(), { guard: g, client: { apiKey: "k", fetch }, onStep: (r) => void steps.push(r.steps.length) });

    expect(run.status).toBe("done");
    expect(run.steps.map((s) => s.tool)).toEqual(["get_report", "get_creator_history", "draft_creator_note", "recommend_payout", "request_recut", "answer"]);
    expect(run.note).toContain("say Alani Nu once");
    expect(run.recommendation).toEqual({ decision: "hold", reason: "The brand name was never said." });
    expect(run.recut).toEqual({ reason: "Missing the spoken brand name." });
    expect(run.summary).toMatch(/waiting for your approval/);
    // Three Muse Spark turns, each reserved through the guard.
    expect(run.usd).toBeCloseTo(0.06, 10);
    expect(await g.totalSpentUsd()).toBeCloseTo(0.06, 10);
    // Each turn sends the earlier calls and their outputs back; tool_choice is always "auto" (the only one supported).
    expect(bodies[1].input.filter((i) => i.type === "function_call_output")).toHaveLength(2);
    expect(JSON.parse(String(bodies[1].input.find((i) => i.type === "function_call_output" && i.call_id === "get_report")?.output)).verdict).toBe("short");
    expect(bodies.every((b) => b.tool_choice === "auto")).toBe(true);
    expect(steps.length).toBeGreaterThanOrEqual(6);
  });

  it("re-checks one waiting re-cut at most, and refuses videos that are not waiting", async () => {
    const recut = video("recut2", { status: "uploaded", report: undefined, createdAt: "2026-10-29T00:00:00Z" });
    let analyzed = 0;
    const { fetch, bodies } = script([
      [call("analyze_video", { videoId: "v1" }, "a")],
      [call("analyze_video", { videoId: "recut2" }, "b")],
      [call("analyze_video", { videoId: "recut2" }, "c")],
      [say("The re-cut met every term.")],
    ]);
    const run = await runAgent(
      world({
        history: async () => [video("v1"), recut],
        analyze: async (id) => {
          analyzed++;
          return video(id, { report: report(true) });
        },
      }),
      { guard: await guard(), client: { apiKey: "k", fetch } },
    );
    const outputs = bodies.slice(1).map((b) => JSON.parse(String(b.input.filter((i) => i.type === "function_call_output").at(-1)?.output)));
    expect(outputs[0].error).toMatch(/not waiting/);
    expect(outputs[1].verdict).toBe("delivered");
    expect(outputs[2].error).toMatch(/Only one video/);
    expect(analyzed).toBe(1);
    expect(run.status).toBe("done");
  });

  it("answers unknown tools and unreadable arguments with an error, and stops at the turn cap", async () => {
    const turns = Array.from({ length: 12 }, (_, i) => [{ type: "function_call", name: i % 2 ? "send_email" : "draft_creator_note", arguments: "{oops", call_id: `x${i}` }]);
    const { fetch, bodies } = script(turns);
    const run = await runAgent(world(), { guard: await guard(), client: { apiKey: "k", fetch } });
    expect(bodies).toHaveLength(8);
    expect(run.steps.find((s) => s.tool === "send_email")?.result).toMatch(/No tool named send_email/);
    expect(run.steps.find((s) => s.tool === "draft_creator_note")?.result).toMatch(/empty/);
    expect(run.note).toBeUndefined();
    expect(run.summary).toMatch(/Stopped after 8 turns/);
  });

  it("fails cleanly when the budget refuses a turn", async () => {
    const { fetch } = script([[say("hi")]]);
    const dir = await mkdtemp(join(tmpdir(), "st-agent-"));
    const broke = new CostGuard({ maxUsdPerRun: 0.01, maxUsdTotal: 1, ledgerPath: join(dir, "ledger.json") });
    const run = await runAgent(world(), { guard: broke, client: { apiKey: "k", fetch } });
    expect(run.status).toBe("failed");
    expect(run.error).toBeTruthy();
  });
});
