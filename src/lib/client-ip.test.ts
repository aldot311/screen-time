import { describe, expect, it } from "vitest";
import { clientIp, clientKey } from "./client-ip";

describe("clientIp", () => {
  it("prefers the addresses Vercel's edge sets over x-forwarded-for", () => {
    const h = (o: Record<string, string>) => new Headers(o);
    expect(clientIp(h({ "x-vercel-forwarded-for": "1.1.1.1, 9.9.9.9", "x-real-ip": "2.2.2.2", "x-forwarded-for": "3.3.3.3" }))).toBe("1.1.1.1");
    expect(clientIp(h({ "x-real-ip": " 2.2.2.2 ", "x-forwarded-for": "3.3.3.3" }))).toBe("2.2.2.2");
    expect(clientIp(h({ "x-forwarded-for": "3.3.3.3, 4.4.4.4" }))).toBe("3.3.3.3");
    expect(clientIp(h({}))).toBe("unknown");
  });
});

describe("clientKey", () => {
  it("keeps IPv4 addresses whole, including ones written as IPv6", () => {
    expect(clientKey("1.2.3.4")).toBe("1.2.3.4");
    expect(clientKey("::ffff:1.2.3.4")).toBe("1.2.3.4");
  });

  it("counts every address and spelling of one IPv6 /64 as one visitor", () => {
    const key = "2001:db8:0:1::/64";
    expect(clientKey("2001:db8:0:1::1")).toBe(key);
    expect(clientKey("2001:0DB8:0000:0001:aaaa:bbbb:cccc:dddd")).toBe(key);
    expect(clientKey("2001:db8:0:1:ffff::")).toBe(key);
    expect(clientKey("2001:db8::")).toBe("2001:db8:0:0::/64");
    expect(clientKey("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(clientKey("fe80::1%eth0")).toBe("fe80:0:0:0::/64");
    expect(clientKey("2001:db8:0:2::1")).not.toBe(key);
  });
});
