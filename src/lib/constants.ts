// Shared with client code — keep free of server imports.
export const SUGGESTION_TYPES = ["sight", "food", "lodging", "transport", "activity", "other"] as const;
export type SuggestionType = (typeof SUGGESTION_TYPES)[number];

export const TRANSPORT_MODES = ["walk", "metro", "bus", "taxi", "drive", "train", "flight", "boat", "other"] as const;
export type TransportMode = (typeof TRANSPORT_MODES)[number];
