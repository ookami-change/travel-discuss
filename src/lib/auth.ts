import { and, eq, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { db, type Tx } from "@/db";
import { members, sessions, trips } from "@/db/schema";
import { hashPin, randomToken, sha256, verifyPin } from "./crypto";
import { HttpError, forbidden, notFound, unauthorized } from "./http";

export const MAX_PIN_ATTEMPTS = 5;
export const PIN_LOCK_MINUTES = 15;

// One cookie per trip, so a device can be a member of several trips at once.
const cookieName = (tripId: string) => `td_${tripId.replaceAll("-", "")}`;

export type Member = typeof members.$inferSelect;

export async function startSession(tx: Tx, member: Pick<Member, "id" | "tripId">) {
  const token = randomToken();
  await tx.insert(sessions).values({ tokenHash: sha256(token), memberId: member.id });
  const jar = await cookies();
  jar.set(cookieName(member.tripId), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function endSession(tripId: string) {
  const jar = await cookies();
  const token = jar.get(cookieName(tripId))?.value;
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
  jar.delete(cookieName(tripId));
}

export async function currentMember(tripId: string): Promise<Member | null> {
  const jar = await cookies();
  const token = jar.get(cookieName(tripId))?.value;
  if (!token) return null;
  const [row] = await db
    .select({ member: members })
    .from(sessions)
    .innerJoin(members, eq(sessions.memberId, members.id))
    .where(and(eq(sessions.tokenHash, sha256(token)), eq(members.tripId, tripId), isNull(members.removedAt)));
  return row?.member ?? null;
}

export async function requireMember(tripId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(tripId)) throw notFound("找不到这次旅行");
  const m = await currentMember(tripId);
  if (!m) throw unauthorized();
  return m;
}

export async function requireAdmin(tripId: string) {
  const m = await requireMember(tripId);
  if (!m.isAdmin) throw forbidden("只有创建者可以这样做");
  return m;
}

export async function tripByInvite(code: string) {
  const [trip] = await db.select().from(trips).where(eq(trips.inviteCode, code));
  if (!trip) throw notFound("邀请链接无效或已被重置");
  return trip;
}

export async function createMember(tx: Tx, tripId: string, nickname: string, pin: string, isAdmin = false) {
  const existing = await tx.select().from(members).where(and(eq(members.tripId, tripId), eq(members.nickname, nickname)));
  if (existing[0]) {
    throw new HttpError(409, existing[0].removedAt ? "这个昵称已被移出旅行" : "这个昵称已经有人用了。如果是你，请选择「找回身份」");
  }
  const [m] = await tx.insert(members).values({ tripId, nickname, pinHash: await hashPin(pin), isAdmin }).returning();
  return m;
}

/** Verifies nickname + PIN with per-member lockout after repeated failures. */
export async function recoverMember(tripId: string, nickname: string, pin: string) {
  const [m] = await db
    .select()
    .from(members)
    .where(and(eq(members.tripId, tripId), eq(members.nickname, nickname), isNull(members.removedAt)));
  // Same message for unknown nickname and wrong PIN so nicknames can't be probed cheaply.
  const wrong = new HttpError(401, "昵称或 PIN 不正确");
  if (!m) throw wrong;
  if (m.lockedUntil && m.lockedUntil > new Date()) {
    const mins = Math.ceil((m.lockedUntil.getTime() - Date.now()) / 60000);
    throw new HttpError(429, `错误次数太多，请 ${mins} 分钟后再试`);
  }
  if (!(await verifyPin(pin, m.pinHash))) {
    const failed = m.failedAttempts + 1;
    const lock = failed >= MAX_PIN_ATTEMPTS;
    await db
      .update(members)
      .set({
        failedAttempts: lock ? 0 : failed,
        lockedUntil: lock ? new Date(Date.now() + PIN_LOCK_MINUTES * 60000) : null,
      })
      .where(eq(members.id, m.id));
    if (lock) throw new HttpError(429, `错误次数太多，请 ${PIN_LOCK_MINUTES} 分钟后再试`);
    throw wrong;
  }
  await db.update(members).set({ failedAttempts: 0, lockedUntil: null }).where(eq(members.id, m.id));
  return m;
}
