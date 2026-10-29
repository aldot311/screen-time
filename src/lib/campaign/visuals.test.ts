import { describe, expect, it } from "vitest";
import { largestPerObject } from "./visuals";

const det = (objectId: number, frame: number, areaFraction: number) => ({
  frame,
  objectId,
  areaFraction,
  box: { x1: 0, y1: 0, x2: 1, y2: 1 },
  centroid: { x: 0.5, y: 0.5 },
  verdict: "match" as const,
});

describe("largestPerObject", () => {
  it("keeps each object's largest detection, in objectId order", () => {
    const out = largestPerObject([det(1, 0, 0.1), det(0, 3, 0.2), det(1, 5, 0.4), det(0, 9, 0.05)]);
    expect([...out.keys()]).toEqual([0, 1]);
    expect(out.get(0)?.frame).toBe(3);
    expect(out.get(1)?.frame).toBe(5);
  });

  it("is empty when nothing was tracked", () => {
    expect(largestPerObject([]).size).toBe(0);
  });
});
