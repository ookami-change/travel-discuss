import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { members } from "@/db/schema";
import { MAX_PIN_ATTEMPTS, createMember, recoverMember } from "@/lib/auth";
import { makeTrip } from "./helpers";

describe("members", () => {
  it("rejects duplicate nicknames in one trip", async () => {
    const { trip } = await makeTrip([]);
    await expect(db.transaction((tx) => createMember(tx, trip.id, "小明", "0000"))).rejects.toMatchObject({ status: 409 });
  });

  it("recovers with the right PIN and locks after repeated failures", async () => {
    const { trip, me } = await makeTrip([]);
    expect((await recoverMember(trip.id, "小明", "1234")).id).toBe(me.id);
    await expect(recoverMember(trip.id, "nobody", "1234")).rejects.toMatchObject({ status: 401 });
    for (let i = 1; i < MAX_PIN_ATTEMPTS; i++) {
      await expect(recoverMember(trip.id, "小明", "9999")).rejects.toMatchObject({ status: 401 });
    }
    await expect(recoverMember(trip.id, "小明", "9999")).rejects.toMatchObject({ status: 429 });
    // Even the right PIN is refused while locked.
    await expect(recoverMember(trip.id, "小明", "1234")).rejects.toMatchObject({ status: 429 });
    await db.update(members).set({ lockedUntil: new Date(Date.now() - 1000) }).where(eq(members.id, me.id));
    expect((await recoverMember(trip.id, "小明", "1234")).id).toBe(me.id);
  });

  it("removed members cannot recover", async () => {
    const { trip, me } = await makeTrip([]);
    await db.update(members).set({ removedAt: new Date() }).where(eq(members.id, me.id));
    await expect(recoverMember(trip.id, "小明", "1234")).rejects.toMatchObject({ status: 401 });
  });
});
