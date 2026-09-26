import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { aiDrafts, comments, members, suggestions, suggestionVotes, trips } from "@/db/schema";
import { generateDraft, type DraftInput } from "./ai";
import { emit } from "./events";
import { dayCount } from "./itinerary";
import { loadPlan } from "./plan";

export async function draftInput(tripId: string, instructions: string | null): Promise<DraftInput> {
  const [trip] = await db.select().from(trips).where(eq(trips.id, tripId));
  const [{ memberCount }] = await db
    .select({ memberCount: sql<number>`count(*)::int` })
    .from(members)
    .where(and(eq(members.tripId, tripId), sql`${members.removedAt} is null`));
  const sugg = await db
    .select({
      s: suggestions,
      votes: sql<number>`(select count(*)::int from ${suggestionVotes} v where v.suggestion_id = ${suggestions.id})`,
    })
    .from(suggestions)
    .where(eq(suggestions.tripId, tripId));
  const talk = await db
    .select({ suggestionId: comments.suggestionId, body: comments.body })
    .from(comments)
    .where(and(eq(comments.tripId, tripId), sql`${comments.suggestionId} is not null`));
  return {
    trip,
    dayTotal: trip.startDate && trip.endDate ? dayCount(trip.startDate, trip.endDate) : null,
    memberCount,
    suggestions: sugg.map(({ s, votes }) => ({
      id: s.id,
      title: s.title,
      type: s.type,
      address: s.address,
      lng: s.lng,
      lat: s.lat,
      reason: s.reason,
      votes,
      comments: talk.filter((c) => c.suggestionId === s.id).map((c) => c.body.slice(0, 200)),
    })),
    plan: await loadPlan(tripId),
    instructions,
  };
}

/** Fire-and-forget: fills in the pending draft row, then notifies clients. */
export async function runDraft(draftId: string, tripId: string, instructions: string | null) {
  try {
    const { summary, snapshot } = await generateDraft(await draftInput(tripId, instructions));
    await db.update(aiDrafts).set({ status: "ready", summary, snapshot }).where(eq(aiDrafts.id, draftId));
  } catch (e) {
    console.error("AI draft failed", e);
    const error = e instanceof Error ? e.message : String(e);
    await db.update(aiDrafts).set({ status: "failed", error: error.slice(0, 500) }).where(eq(aiDrafts.id, draftId));
  }
  emit(tripId, "plan");
}
