import { db } from "@/db";
import { planDays, planItems, trips } from "@/db/schema";
import { createMember } from "@/lib/auth";
import { inviteCode } from "@/lib/crypto";

export async function makeTrip(dayTitles: string[][] = [["A1", "A2"], ["B1"]]) {
  const [trip] = await db.insert(trips).values({ name: "测试", inviteCode: inviteCode() }).returning();
  const me = await db.transaction((tx) => createMember(tx, trip.id, "小明", "1234", true));
  for (const [di, titles] of dayTitles.entries()) {
    const [d] = await db.insert(planDays).values({ tripId: trip.id, position: di + 1, title: `D${di + 1}` }).returning();
    for (const [ii, title] of titles.entries()) {
      await db.insert(planItems).values({ tripId: trip.id, dayId: d.id, position: ii + 1, title });
    }
  }
  return { trip, me };
}
