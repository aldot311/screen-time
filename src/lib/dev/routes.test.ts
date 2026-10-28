import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Point the dev routes at a scratch data dir; everything else in files.ts stays real.
const root = vi.hoisted(() => ({ dir: "" }));
vi.mock("@/lib/dev/files", async (orig) => {
  const real = await orig<typeof import("@/lib/dev/files")>();
  return {
    ...real,
    devOnly: () => null,
    get VIDEOS_DIR() {
      return root.dir;
    },
  };
});

const { GET: getVideo } = await import("@/app/api/dev/video/route");
const { GET: listVideos } = await import("@/app/api/dev/videos/route");

const req = (id: string, range?: string) =>
  new Request(`http://localhost/api/dev/video?id=${id}`, range ? { headers: { range } } : undefined);

let base = "";
beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), "dev-routes-"));
  root.dir = join(base, "videos");
  await mkdir(join(root.dir, "stock"), { recursive: true });
  await writeFile(join(root.dir, "stock", "a.mp4"), Buffer.from("0123456789"));
  await writeFile(join(root.dir, "empty.mp4"), Buffer.alloc(0));
});
afterAll(() => rm(base, { recursive: true, force: true }));

describe("GET /api/dev/video", () => {
  it("serves the whole file without a range", async () => {
    const res = await getVideo(req("stock/a"));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("0123456789");
  });

  it("serves a suffix range", async () => {
    const res = await getVideo(req("stock/a", "bytes=-3"));
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 7-9/10");
    expect(await res.text()).toBe("789");
  });

  it("returns 416 for a range past the end", async () => {
    const res = await getVideo(req("stock/a", "bytes=10-"));
    expect(res.status).toBe(416);
    expect(res.headers.get("Content-Range")).toBe("bytes */10");
  });

  it("serves an empty file", async () => {
    const res = await getVideo(req("empty"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Length")).toBe("0");
    expect(await res.text()).toBe("");
  });

  it("returns 404 for a missing clip", async () => {
    expect((await getVideo(req("stock/nope"))).status).toBe(404);
  });

  it("rejects an unsafe id", async () => {
    expect((await getVideo(req("..%2Fetc"))).status).toBe(400);
  });
});

describe("GET /api/dev/videos", () => {
  it("lists clips", async () => {
    expect(await (await listVideos()).json()).toEqual(["empty", "stock/a"]);
  });

  it("returns [] when the videos folder does not exist", async () => {
    const saved = root.dir;
    root.dir = join(base, "missing");
    try {
      const res = await listVideos();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
    } finally {
      root.dir = saved;
    }
  });
});
