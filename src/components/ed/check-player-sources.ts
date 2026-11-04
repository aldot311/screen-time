// The labelled LaCroix Reels and the runs they were scored on, bundled at build time (static JSON imports, no file
// access at request time), built into the check player's per-frame arrays by check-player-data.ts. Every measured clip in
// data/labels/lacroix is listed here; the test checks that none is left out.
import { checkReel, type CheckReel, type LabelFile, type RunReport } from "./check-player-data";
import l0 from "../../../data/labels/lacroix/lc-1-george.json";
import r0 from "../../../data/runs/lacroix-can/lacroix/lc-1-george/report.json";
import l1 from "../../../data/labels/lacroix/lc-1-michael.json";
import r1 from "../../../data/runs/lacroix-can/lacroix/lc-1-michael/report.json";
import l2 from "../../../data/labels/lacroix/lc-10-aldo.json";
import r2 from "../../../data/runs/lacroix-can/lacroix/lc-10-aldo/report.json";
import l3 from "../../../data/labels/lacroix/lc-11-jon.json";
import r3 from "../../../data/runs/lacroix-can/lacroix/lc-11-jon/report.json";
import l4 from "../../../data/labels/lacroix/lc-12-aldo.json";
import r4 from "../../../data/runs/lacroix-can/lacroix/lc-12-aldo/report.json";
import l5 from "../../../data/labels/lacroix/lc-2-jamal.json";
import r5 from "../../../data/runs/lacroix-can/lacroix/lc-2-jamal/report.json";
import l6 from "../../../data/labels/lacroix/lc-4-lana.json";
import r6 from "../../../data/runs/lacroix-can/lacroix/lc-4-lana/report.json";
import l7 from "../../../data/labels/lacroix/lc-6-michael.json";
import r7 from "../../../data/runs/lacroix-can/lacroix/lc-6-michael/report.json";
import l8 from "../../../data/labels/lacroix/lc-7a-ash.json";
import r8 from "../../../data/runs/lacroix-can/lacroix/lc-7a-ash/report.json";
import l9 from "../../../data/labels/lacroix/lc-7b-ash.json";
import r9 from "../../../data/runs/lacroix-can/lacroix/lc-7b-ash/report.json";
import l10 from "../../../data/labels/lacroix/lc-8-peter.json";
import r10 from "../../../data/runs/lacroix-can/lacroix/lc-8-peter/report.json";

const PAIRS: [unknown, unknown][] = [
  [l0, r0],
  [l1, r1],
  [l2, r2],
  [l3, r3],
  [l4, r4],
  [l5, r5],
  [l6, r6],
  [l7, r7],
  [l8, r8],
  [l9, r9],
  [l10, r10],
];

/** Every labelled LaCroix Reel, frame by frame, labels against the scored run. Built once per server instance. */
export const CHECK_REELS: CheckReel[] = PAIRS.map(([l, r]) => checkReel(l as LabelFile, r as RunReport));
