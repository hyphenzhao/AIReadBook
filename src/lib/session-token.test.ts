import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import { SESSION_SECONDS, shouldRenew, signSessionToken, verifySessionToken } from "./session-token";

const SECRET = "test-secret-at-least-16-chars";
const NOW = 1_800_000_000_000;

describe("session token", () => {
  it("round-trips a signed token", async () => {
    const { token, expires } = await signSessionToken(42, SECRET, NOW);
    expect(expires).toBe(NOW / 1000 + SESSION_SECONDS);
    expect(await verifySessionToken(token, SECRET, NOW)).toEqual({ userId: 42, expires });
  });

  it("matches the Node HMAC encoding, so both runtimes agree", async () => {
    const { token } = await signSessionToken(7, SECRET, NOW);
    const [id, exp, sig] = token.split(".");
    expect(sig).toBe(createHmac("sha256", SECRET).update(`${id}.${exp}`).digest("base64url"));
  });

  it("rejects a token signed with another secret", async () => {
    const { token } = await signSessionToken(42, "some-other-secret-value", NOW);
    expect(await verifySessionToken(token, SECRET, NOW)).toBeNull();
  });

  it("rejects a tampered user id", async () => {
    const { token } = await signSessionToken(42, SECRET, NOW);
    const forged = token.replace(/^42\./, "1.");
    expect(await verifySessionToken(forged, SECRET, NOW)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const { token } = await signSessionToken(42, SECRET, NOW);
    expect(await verifySessionToken(token, SECRET, NOW + (SESSION_SECONDS + 1) * 1000)).toBeNull();
  });

  it.each([undefined, "", "a.b", "1.2.3.4", "x.9999999999.sig", "1.9999999999.!!!"])(
    "rejects malformed token %j",
    async (token) => {
      expect(await verifySessionToken(token, SECRET, NOW)).toBeNull();
    },
  );

  it("renews only in the second half of the session's life", async () => {
    const { expires } = await signSessionToken(1, SECRET, NOW);
    const claims = { userId: 1, expires };
    expect(shouldRenew(claims, NOW)).toBe(false);
    expect(shouldRenew(claims, NOW + (SESSION_SECONDS / 2 + 60) * 1000)).toBe(true);
  });
});
