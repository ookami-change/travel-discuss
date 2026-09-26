import { z } from "zod";
import { SUGGESTION_TYPES, TRANSPORT_MODES } from "@/db/schema";

export const nickname = z.string().trim().min(1, "请填写昵称").max(20, "昵称最多 20 个字");
export const pin = z.string().regex(/^\d{4}$/, "PIN 必须是 4 位数字");
export const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式应为 YYYY-MM-DD");
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

export const placeFields = {
  address: optText(200),
  lng: z.number().min(-180).max(180).nullish().transform((v) => v ?? null),
  lat: z.number().min(-90).max(90).nullish().transform((v) => v ?? null),
  poiId: optText(64),
};

export const suggestionType = z.enum(SUGGESTION_TYPES);
export const transport = z
  .object({
    mode: z.enum(TRANSPORT_MODES),
    minutes: z.number().int().min(0).max(60 * 48).nullish(),
    note: optText(200),
  })
  .nullish()
  .transform((v) => v ?? null);

export const lodging = z
  .object({ name: z.string().trim().min(1).max(100), note: optText(500), ...placeFields })
  .nullish()
  .transform((v) => v ?? null);

export const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "时间格式应为 HH:MM")
  .nullish()
  .or(z.literal(""))
  .transform((v) => v || null);

export { optText };

export const itemInput = z.object({
  title: z.string().trim().min(1, "请填写名称").max(100),
  type: suggestionType.default("sight"),
  time,
  notes: optText(2000),
  transport,
  suggestionId: z.string().uuid().nullish().transform((v) => v ?? null),
  ...placeFields,
});

const optId = z.string().uuid().optional().catch(undefined);

/** A whole plan as edited client-side (hand-tuning an AI draft). */
export const planSnapshot = z.object({
  days: z
    .array(
      z.object({
        id: optId,
        title: optText(100),
        lodging,
        items: z.array(itemInput.extend({ id: optId })).max(50),
      }),
    )
    .min(1, "至少要有一天")
    .max(60),
});
