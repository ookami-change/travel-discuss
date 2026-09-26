import { describe, expect, it } from "vitest";
import { hashPin, inviteCode, verifyPin } from "@/lib/crypto";

describe("pin hashing", () => {
  it("verifies the right PIN only", async () => {
    const h = await hashPin("1234");
    expect(await verifyPin("1234", h)).toBe(true);
    expect(await verifyPin("1235", h)).toBe(false);
    expect(await verifyPin("1234", "garbage")).toBe(false);
  });
  it("salts each hash", async () => {
    expect(await hashPin("0000")).not.toBe(await hashPin("0000"));
  });
  it("invite codes are url-safe", () => {
    expect(inviteCode()).toMatch(/^[a-z2-9]{10}$/);
  });
});
