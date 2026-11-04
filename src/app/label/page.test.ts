import { afterEach, describe, expect, it, vi } from "vitest";

// /label reads and writes files under data/, so it is served only where its API routes are: under `pnpm dev`, or a
// local build with SCREEN_TIME_LOCAL_FILES=1. Production answers 404.
const { default: LabelPage } = await import("./page");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/label", () => {
  it("is not found in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SCREEN_TIME_LOCAL_FILES", "");
    expect(() => LabelPage()).toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/);
  });

  it("renders the tool under pnpm dev, with the saved checklist", () => {
    vi.stubEnv("NODE_ENV", "development");
    const el = LabelPage();
    expect(el.props.checklist["lacroix/lc-1-michael"][0].frames).toEqual([136, 147]);
  });

  it("renders on a local build with SCREEN_TIME_LOCAL_FILES=1", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SCREEN_TIME_LOCAL_FILES", "1");
    expect(() => LabelPage()).not.toThrow();
  });
});
