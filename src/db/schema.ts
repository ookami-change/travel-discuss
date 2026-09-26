import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { SUGGESTION_TYPES, TRANSPORT_MODES, type SuggestionType, type TransportMode } from "../lib/constants";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const trips = pgTable("trips", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  destination: text("destination"),
  // YYYY-MM-DD, interpreted in the travellers' local time
  startDate: text("start_date"),
  endDate: text("end_date"),
  inviteCode: text("invite_code").notNull().unique(),
  createdAt: createdAt(),
});

export const members = pgTable(
  "members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
    nickname: text("nickname").notNull(),
    pinHash: text("pin_hash").notNull(),
    isAdmin: boolean("is_admin").notNull().default(false),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("members_trip_nickname").on(t.tripId, t.nickname)],
);

export const sessions = pgTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  memberId: uuid("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
});

/** A geographic place. Coordinates are GCJ-02 as returned by 高德. */
export type Place = {
  name: string;
  address?: string | null;
  lng?: number | null;
  lat?: number | null;
  poiId?: string | null;
};

export { SUGGESTION_TYPES, TRANSPORT_MODES, type SuggestionType, type TransportMode };

export const suggestions = pgTable(
  "suggestions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").notNull().references(() => members.id),
    title: text("title").notNull(),
    type: text("type").$type<SuggestionType>().notNull().default("sight"),
    address: text("address"),
    lng: doublePrecision("lng"),
    lat: doublePrecision("lat"),
    poiId: text("poi_id"),
    reason: text("reason"),
    links: jsonb("links").$type<string[]>().notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [index("suggestions_trip").on(t.tripId)],
);

export const suggestionVotes = pgTable(
  "suggestion_votes",
  {
    suggestionId: uuid("suggestion_id").notNull().references(() => suggestions.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.suggestionId, t.memberId] })],
);

/** suggestionId null = trip-wide discussion thread. */
export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
    suggestionId: uuid("suggestion_id").references(() => suggestions.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").notNull().references(() => members.id),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("comments_trip_suggestion").on(t.tripId, t.suggestionId)],
);

export type Lodging = Place & { note?: string | null };
export type Transport = { mode: TransportMode; minutes?: number | null; note?: string | null };

export const planDays = pgTable(
  "plan_days",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
    position: doublePrecision("position").notNull(),
    title: text("title"),
    /** Where the group sleeps at the end of this day. */
    lodging: jsonb("lodging").$type<Lodging | null>(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("plan_days_trip").on(t.tripId)],
);

export const planItems = pgTable(
  "plan_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
    dayId: uuid("day_id").notNull().references(() => planDays.id, { onDelete: "cascade" }),
    position: doublePrecision("position").notNull(),
    title: text("title").notNull(),
    type: text("type").$type<SuggestionType>().notNull().default("sight"),
    address: text("address"),
    lng: doublePrecision("lng"),
    lat: doublePrecision("lat"),
    poiId: text("poi_id"),
    /** Optional reference time, "HH:MM". */
    time: text("time"),
    notes: text("notes"),
    /** How to get here from the previous item of the day. */
    transport: jsonb("transport").$type<Transport | null>(),
    suggestionId: uuid("suggestion_id").references(() => suggestions.id, { onDelete: "set null" }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedBy: uuid("completed_by").references(() => members.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid("updated_by").references(() => members.id),
  },
  (t) => [index("plan_items_day").on(t.dayId), index("plan_items_trip").on(t.tripId)],
);

export type PlanSnapshot = {
  days: {
    /** Present when the day already exists; lets restores keep ids stable. */
    id?: string;
    title: string | null;
    lodging: Lodging | null;
    items: {
      id?: string;
      title: string;
      type: SuggestionType;
      address: string | null;
      lng: number | null;
      lat: number | null;
      poiId: string | null;
      time: string | null;
      notes: string | null;
      transport: Transport | null;
      suggestionId: string | null;
    }[];
  }[];
};

export const planVersions = pgTable(
  "plan_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").references(() => members.id),
    reason: text("reason").notNull(),
    snapshot: jsonb("snapshot").$type<PlanSnapshot>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("plan_versions_trip").on(t.tripId, t.createdAt)],
);

export type DraftMode = "fresh" | "adjust";

export const aiDrafts = pgTable("ai_drafts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tripId: uuid("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  createdBy: uuid("created_by").notNull().references(() => members.id),
  status: text("status").$type<"pending" | "ready" | "failed" | "applied" | "discarded">().notNull(),
  /** fresh = rebuild from all suggestions; adjust = minimal changes to the current plan. */
  mode: text("mode").$type<DraftMode>().notNull().default("fresh"),
  instructions: text("instructions"),
  snapshot: jsonb("snapshot").$type<PlanSnapshot>(),
  summary: text("summary"),
  error: text("error"),
  /** Set when someone hand-edits the draft before adopting it. */
  editedBy: uuid("edited_by").references(() => members.id),
  createdAt: createdAt(),
});

export const activity = pgTable(
  "activity",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    tripId: uuid("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").references(() => members.id),
    summary: text("summary").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("activity_trip").on(t.tripId, t.createdAt)],
);

export const media = pgTable(
  "media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
    uploaderId: uuid("uploader_id").notNull().references(() => members.id),
    /** Attach to an item, or a day, or neither (whole trip). */
    itemId: uuid("item_id").references(() => planItems.id, { onDelete: "set null" }),
    dayId: uuid("day_id").references(() => planDays.id, { onDelete: "set null" }),
    kind: text("kind").$type<"photo" | "video">().notNull(),
    objectKey: text("object_key").notNull(),
    thumbKey: text("thumb_key"),
    mime: text("mime").notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    caption: text("caption"),
    status: text("status").$type<"uploading" | "ready">().notNull().default("uploading"),
    createdAt: createdAt(),
  },
  (t) => [index("media_trip").on(t.tripId, t.createdAt)],
);

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    amountCents: integer("amount_cents").notNull(),
    payerId: uuid("payer_id").notNull().references(() => members.id),
    createdBy: uuid("created_by").notNull().references(() => members.id),
    spentOn: text("spent_on"),
    createdAt: createdAt(),
  },
  (t) => [index("expenses_trip").on(t.tripId)],
);
