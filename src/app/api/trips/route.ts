import { z } from "zod";
import { db } from "@/db";
import { planDays, trips } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { createMember, startSession } from "@/lib/auth";
import { inviteCode } from "@/lib/crypto";
import { badRequest, body, ok, route } from "@/lib/http";
import { dayCount } from "@/lib/itinerary";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { date, nickname, optText, pin } from "@/lib/validation";

const schema = z.object({
  name: z.string().trim().min(1, "请填写旅行名称").max(50),
  destination: optText(50),
  startDate: date.nullish(),
  endDate: date.nullish(),
  nickname,
  pin,
});

export const POST = route(async (req) => {
  rateLimit(`create:${clientIp(req)}`, 10, 60 * 60 * 1000);
  const input = await body(req, schema);
  const { startDate, endDate } = input;
  if (endDate && !startDate) throw badRequest("填了结束日期就要填开始日期");
  const days = startDate ? (endDate ? dayCount(startDate, endDate) : 1) : 1;
  if (days < 1 || days > 60) throw badRequest("行程天数需要在 1–60 天之间");

  const trip = await db.transaction(async (tx) => {
    const [trip] = await tx
      .insert(trips)
      .values({ name: input.name, destination: input.destination, startDate, endDate, inviteCode: inviteCode() })
      .returning();
    const admin = await createMember(tx, trip.id, input.nickname, input.pin, true);
    await tx.insert(planDays).values(Array.from({ length: days }, (_, i) => ({ tripId: trip.id, position: i + 1 })));
    await logActivity(tx, trip.id, admin.id, `${admin.nickname} 创建了旅行「${trip.name}」`);
    await startSession(tx, admin);
    return trip;
  });
  return ok({ id: trip.id });
});
