// The homepage "How it works" step switcher, as plain state: which step shows, and whether it still moves on by itself.
// It advances only while nobody has picked a step, the section is on screen, and no pointer or focus is inside it. Any
// pick stops it for good, so a step never changes under someone reading it.

export interface SwitcherState {
  active: number;
  /** True until the visitor picks a step. */
  auto: boolean;
  hover: boolean;
  focus: boolean;
  inView: boolean;
}

export type SwitcherAction =
  | { type: "select"; index: number }
  | { type: "advance" }
  | { type: "hover" | "focus" | "view"; on: boolean };

export const ADVANCE_MS = 5000;

export function initialSwitcher(): SwitcherState {
  return { active: 0, auto: true, hover: false, focus: false, inView: false };
}

/** True while the step timer should run. */
export function isRunning(s: SwitcherState): boolean {
  return s.auto && s.inView && !s.hover && !s.focus;
}

export function switcherReducer(count: number) {
  return (s: SwitcherState, a: SwitcherAction): SwitcherState => {
    switch (a.type) {
      case "select": {
        const index = clamp(a.index, count);
        return s.active === index && !s.auto ? s : { ...s, active: index, auto: false };
      }
      case "advance":
        return isRunning(s) ? { ...s, active: (s.active + 1) % count } : s;
      case "hover":
        return s.hover === a.on ? s : { ...s, hover: a.on };
      case "focus":
        return s.focus === a.on ? s : { ...s, focus: a.on };
      case "view":
        return s.inView === a.on ? s : { ...s, inView: a.on };
    }
  };
}

/** The step a key moves to in the list (arrows wrap, Home and End jump), or null for any other key. */
export function stepForKey(key: string, current: number, count: number): number | null {
  switch (key) {
    case "ArrowDown":
    case "ArrowRight":
      return (current + 1) % count;
    case "ArrowUp":
    case "ArrowLeft":
      return (current - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

const clamp = (i: number, count: number) => Math.min(Math.max(Math.trunc(i), 0), count - 1);
