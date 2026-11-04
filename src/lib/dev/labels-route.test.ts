import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Point the labels route at a scratch folder; everything else in files.ts stays real.
const root = vi.hoisted(() => ({ dir: "" }));
vi.mock("@/lib/dev/files", async (orig) => {
  const real = await orig<typeof import("@/lib/dev/files")>();
  return {
    ...real,
    devOnly: () => null,
    get LABELS_DIR() {
      return root.dir;
    },
  };
});

const { GET, POST } = await import("@/app/api/dev/labels/route");

const post = (body: unknown) => POST(new Request("http://localhost/api/dev/labels", { method: "POST", body: JSON.stringify(body) }));
const saved = async (id: string) => JSON.parse(await readFile(join(root.dir, `${id}.json`), "utf8"));
const target = { name: "lacroix-can", prompt: "can", product: "a pink can", ranges: [[0, 2]] };

beforeAll(async () => {
  root.dir = await mkdtemp(join(tmpdir(), "dev-labels-"));
});
afterAll(() => rm(root.dir, { recursive: true, force: true }));

describe("POST /api/dev/labels", () => {
  it("keeps a file without the spoken terms valid, and adds none", async () => {
    const res = await post({ id: "lacroix/old", method: "m", checkedBy: "", targets: [target] });
    expect(res.status).toBe(200);
    const doc = await saved("lacroix/old");
    expect(doc).not.toHaveProperty("saidBrand");
    expect(doc).not.toHaveProperty("disclosure");
  });

  it("saves the spoken terms a person set", async () => {
    const res = await post({ id: "lacroix/new", checkedBy: "Aldo Tile, 2026-11-04, frame by frame in /label", saidBrand: true, saidBrandAtSec: 4.27, disclosure: "implied", targets: [target] });
    expect(res.status).toBe(200);
    expect(await saved("lacroix/new")).toMatchObject({ saidBrand: true, saidBrandAtSec: 4.27, disclosure: "implied" });
    const back = await GET(new Request("http://localhost/api/dev/labels?id=lacroix/new"));
    expect(await back.json()).toMatchObject({ disclosure: "implied" });
  });

  it("refuses a disclosure it does not know or a negative time", async () => {
    expect((await post({ id: "lacroix/x", disclosure: "maybe", targets: [target] })).status).toBe(400);
    expect((await post({ id: "lacroix/x", saidBrand: true, saidBrandAtSec: -1, targets: [target] })).status).toBe(400);
  });
});
