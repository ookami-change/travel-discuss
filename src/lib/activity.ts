import { db, type Tx } from "@/db";
import { activity } from "@/db/schema";

export async function logActivity(tx: Tx | typeof db, tripId: string, memberId: string | null, summary: string) {
  await tx.insert(activity).values({ tripId, memberId, summary: summary.slice(0, 300) });
}
