import type { Lodging, PlanSnapshot, SuggestionType, Transport } from "@/db/schema";

// JSON shapes returned by the API (dates arrive as ISO strings).

export type MemberLite = { id: string; nickname: string; isAdmin: boolean };

export type TripInfo = {
  trip: {
    id: string;
    name: string;
    destination: string | null;
    startDate: string | null;
    endDate: string | null;
    inviteCode: string;
  };
  me: MemberLite;
  members: MemberLite[];
};

export type Suggestion = {
  id: string;
  authorId: string;
  title: string;
  type: SuggestionType;
  address: string | null;
  lng: number | null;
  lat: number | null;
  poiId: string | null;
  reason: string | null;
  links: string[];
  createdAt: string;
  votes: number;
  voted: boolean;
  commentCount: number;
  inPlan: boolean;
};

export type Comment = { id: string; authorId: string; body: string; createdAt: string; suggestionId: string | null };

export type PlanItem = {
  id: string;
  dayId: string;
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
  completedAt: string | null;
  completedBy: string | null;
  updatedAt: string;
  updatedBy: string | null;
};

export type PlanDay = { id: string; title: string | null; lodging: Lodging | null; items: PlanItem[] };

export type Version = {
  id: string;
  reason: string;
  createdBy: string | null;
  createdAt: string;
  dayCount: number;
  itemCount: number;
  snapshot: PlanSnapshot;
};

export type SnapshotItem = PlanSnapshot["days"][number]["items"][number];

export type Draft = {
  id: string;
  status: "pending" | "ready" | "failed" | "applied" | "discarded";
  mode: "fresh" | "adjust";
  editedBy: string | null;
  instructions: string | null;
  snapshot: PlanSnapshot | null;
  summary: string | null;
  error: string | null;
  createdBy: string;
  createdAt: string;
};

export type MediaItem = {
  id: string;
  kind: "photo" | "video";
  mime: string;
  size: number;
  caption: string | null;
  itemId: string | null;
  dayId: string | null;
  uploaderId: string;
  uploader: string;
  createdAt: string;
  url: string;
  thumbUrl: string | null;
  downloadUrl: string;
};

export type Expense = {
  id: string;
  title: string;
  amountCents: number;
  payerId: string;
  createdBy: string;
  spentOn: string | null;
  createdAt: string;
};

export type Activity = { id: number; memberId: string | null; summary: string; createdAt: string };

export type PlaceHit = { name: string; address: string | null; lng: number | null; lat: number | null; poiId: string | null; district: string | null };

export type { Lodging, Transport, SuggestionType };
