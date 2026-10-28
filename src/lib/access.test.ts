import { describe, expect, it } from "vitest";
import { accessToken, decideAccess, sameString } from "./access";

describe("decideAccess", () => {
  it("fails closed without a password outside development", async () => {
    expect(await decideAccess(undefined, { NODE_ENV: "production" })).toBe("disabled");
    expect(await decideAccess("anything", { NODE_ENV: "production" })).toBe("disabled");
    expect(await decideAccess(undefined, { NODE_ENV: "development" })).toBe("allow");
  });

  it("allows only the cookie made from the configured password", async () => {
    const env = { NODE_ENV: "production", SCREEN_TIME_PASSWORD: "demo-pass-long" };
    expect(await decideAccess(undefined, env)).toBe("locked");
    expect(await decideAccess(await accessToken("wrong"), env)).toBe("locked");
    expect(await decideAccess("demo-pass-long", env)).toBe("locked"); // the raw password is not the cookie
    expect(await decideAccess(await accessToken("demo-pass-long"), env)).toBe("allow");
  });

  it("treats a password under 12 characters as unset, so writes stay off", async () => {
    expect(await decideAccess(await accessToken("short"), { NODE_ENV: "production", SCREEN_TIME_PASSWORD: "short" })).toBe("disabled");
  });

  it("compares strings exactly", () => {
    expect(sameString("abc", "abc")).toBe(true);
    expect(sameString("abc", "abd")).toBe(false);
    expect(sameString("abc", "abcd")).toBe(false);
  });
});
