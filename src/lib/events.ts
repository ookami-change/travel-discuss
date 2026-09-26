import { EventEmitter } from "node:events";

/**
 * Change notifications for live updates. Each scope names the API path segment
 * that changed (e.g. "plan" → clients refetch /api/trips/:id/plan*).
 *
 * In-process only: this assumes a single app server, which is the deployment target.
 */
export type Scope = "trip" | "members" | "suggestions" | "comments" | "plan" | "media" | "expenses" | "activity";

const g = globalThis as unknown as { tripEvents?: EventEmitter };
const bus = (g.tripEvents ??= new EventEmitter().setMaxListeners(0));

export function emit(tripId: string, ...scopes: Scope[]) {
  bus.emit(tripId, [...new Set<Scope>([...scopes, "activity"])]);
}

export function subscribe(tripId: string, fn: (scopes: Scope[]) => void) {
  bus.on(tripId, fn);
  return () => void bus.off(tripId, fn);
}
