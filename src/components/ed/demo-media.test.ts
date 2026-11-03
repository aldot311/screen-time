import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { demoMedia, demoMediaFrom } from "./demo-media";

describe("demoMediaFrom", () => {
  it("shows nothing until the video exists, even with a poster in place", () => {
    expect(demoMediaFrom({ video: false, poster: true, captions: true }, "/hero.jpg")).toBeNull();
  });

  it("embeds the video with its own poster and captions when they exist", () => {
    expect(demoMediaFrom({ video: true, poster: true, captions: true }, "/hero.jpg")).toEqual({
      src: "/demo.mp4",
      poster: "/demo-poster.jpg",
      captions: "/demo.vtt",
    });
  });

  it("falls back to the hero's still as the poster and leaves captions out", () => {
    expect(demoMediaFrom({ video: true, poster: false, captions: false }, "/hero.jpg")).toEqual({ src: "/demo.mp4", poster: "/hero.jpg", captions: undefined });
  });
});

describe("demoMedia", () => {
  it("looks for the video in this project's public folder", () => {
    expect(demoMedia() !== null).toBe(existsSync("public/demo.mp4"));
  });
});
