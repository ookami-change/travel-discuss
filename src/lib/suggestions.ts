import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { comments, suggestions, suggestionVotes } from "@/db/schema";
import { optText, placeFields, suggestionType } from "@/lib/validation";

export const suggestionInput = z.object({
  title: z.string().trim().min(1, "请填写名称").max(100),
  type: suggestionType,
  reason: optText(2000),
  links: z.array(z.string().trim().url("链接格式不对").max(500)).max(10).default([]),
  ...placeFields,
});

export async function listSuggestions(tripId: string, meId: string) {
  return db
    .select({
      s: suggestions,
      votes: sql<number>`(select count(*)::int from ${suggestionVotes} v where v.suggestion_id = ${suggestions.id})`,
      voted: sql<boolean>`exists(select 1 from ${suggestionVotes} v where v.suggestion_id = ${suggestions.id} and v.member_id = ${meId})`,
      commentCount: sql<number>`(select count(*)::int from ${comments} c where c.suggestion_id = ${suggestions.id})`,
      inPlan: sql<boolean>`exists(select 1 from plan_items p where p.suggestion_id = ${suggestions.id})`,
    })
    .from(suggestions)
    .where(eq(suggestions.tripId, tripId))
    .orderBy(desc(suggestions.createdAt))
    .then((rows) => rows.map(({ s, ...rest }) => ({ ...s, ...rest })));
}
