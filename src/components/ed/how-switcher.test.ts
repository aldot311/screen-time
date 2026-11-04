import { describe, expect, it } from "vitest";
import { initialSwitcher, isRunning, stepForKey, switcherReducer, type SwitcherState } from "./how-switcher";

const reduce = switcherReducer(5);
const visible: SwitcherState = { ...initialSwitcher(), inView: true };

describe("how-it-works step switcher", () => {
  it("waits until the section is on screen", () => {
    const s = initialSwitcher();
    expect(isRunning(s)).toBe(false);
    expect(reduce(s, { type: "advance" }).active).toBe(0);
    expect(isRunning(reduce(s, { type: "view", on: true }))).toBe(true);
  });

  it("advances one step at a time and wraps after the last", () => {
    let s = visible;
    for (let i = 0; i < 4; i++) s = reduce(s, { type: "advance" });
    expect(s.active).toBe(4);
    expect(reduce(s, { type: "advance" }).active).toBe(0);
  });

  it("holds still while hovered or focused, and resumes after", () => {
    const hovered = reduce(visible, { type: "hover", on: true });
    expect(reduce(hovered, { type: "advance" }).active).toBe(0);
    const focused = reduce(visible, { type: "focus", on: true });
    expect(reduce(focused, { type: "advance" }).active).toBe(0);
    const left = reduce(hovered, { type: "hover", on: false });
    expect(reduce(left, { type: "advance" }).active).toBe(1);
  });

  it("stops for good once a step is picked", () => {
    const picked = reduce(visible, { type: "select", index: 2 });
    expect(picked).toMatchObject({ active: 2, auto: false });
    expect(reduce(picked, { type: "advance" }).active).toBe(2);
    expect(isRunning(reduce(picked, { type: "hover", on: false }))).toBe(false);
  });

  it("keeps a picked index inside the list", () => {
    expect(reduce(visible, { type: "select", index: 9 }).active).toBe(4);
    expect(reduce(visible, { type: "select", index: -3 }).active).toBe(0);
  });

  it("moves with arrow keys, Home and End, and ignores other keys", () => {
    expect(stepForKey("ArrowDown", 4, 5)).toBe(0);
    expect(stepForKey("ArrowUp", 0, 5)).toBe(4);
    expect(stepForKey("Home", 3, 5)).toBe(0);
    expect(stepForKey("End", 1, 5)).toBe(4);
    expect(stepForKey("Enter", 1, 5)).toBeNull();
  });
});
