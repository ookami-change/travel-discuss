import { z } from "zod";
import { SUGGESTION_TYPES, TRANSPORT_MODES, type PlanSnapshot } from "@/db/schema";
import type { Plan } from "./plan";

/**
 * Plan-drafting via any OpenAI-compatible chat API. DeepSeek and 通义千问 (DashScope
 * compatible mode) both work; pick with AI_BASE_URL / AI_MODEL.
 */
export function aiConfigured() {
  return Boolean(process.env.AI_API_KEY);
}

export type DraftInput = {
  trip: { name: string; destination: string | null; startDate: string | null; endDate: string | null };
  dayTotal: number | null;
  memberCount: number;
  suggestions: {
    id: string;
    title: string;
    type: string;
    address: string | null;
    lng: number | null;
    lat: number | null;
    reason: string | null;
    votes: number;
    comments: string[];
  }[];
  plan: Plan;
  instructions: string | null;
};

const aiItem = z.object({
  id: z.string().nullish(),
  suggestionId: z.string().nullish(),
  title: z.string().min(1).max(100),
  type: z.enum(SUGGESTION_TYPES).catch("other"),
  address: z.string().max(200).nullish(),
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullish()
    .catch(null),
  notes: z.string().max(500).nullish(),
  transport: z
    .object({
      mode: z.enum(TRANSPORT_MODES).catch("other"),
      minutes: z.number().int().min(0).max(2880).nullish().catch(null),
      note: z.string().max(200).nullish(),
    })
    .nullish()
    .catch(null),
});

export const aiDraftSchema = z.object({
  summary: z.string().max(2000).nullish(),
  days: z
    .array(
      z.object({
        title: z.string().max(100).nullish(),
        lodging: z.object({ name: z.string().min(1).max(100), address: z.string().max(200).nullish() }).nullish().catch(null),
        items: z.array(aiItem).max(30),
      }),
    )
    .min(1)
    .max(60),
});

export function buildPrompt(input: DraftInput) {
  const { trip } = input;
  const plan = input.plan.map((d, i) => ({
    day: i + 1,
    title: d.title,
    lodging: d.lodging?.name ?? null,
    items: d.items.map((it) => ({ id: it.id, title: it.title, time: it.time, notes: it.notes, done: Boolean(it.completedAt) })),
  }));
  const system = `你是一名细致的旅行规划师。你会根据一群朋友的讨论，把他们的建议整理成一份按天排列、顺路可行的行程。
只输出一个 JSON 对象，不要输出任何其他文字。格式：
{
  "summary": "用 2-4 句话说明安排思路，以及哪些建议没有排进去、为什么",
  "days": [
    {
      "title": "当天主题，如「老城区漫步」",
      "lodging": { "name": "住宿名称", "address": "地址" } 或 null,
      "items": [
        {
          "id": "若沿用现有行程中的某一项，填它的 id，否则 null",
          "suggestionId": "若来自某条建议，填建议 id，否则 null",
          "title": "地点或活动名称",
          "type": ${JSON.stringify(SUGGESTION_TYPES)} 之一,
          "address": "地址或 null",
          "time": "HH:MM 或 null",
          "notes": "简短备注或 null",
          "transport": { "mode": ${JSON.stringify(TRANSPORT_MODES)} 之一, "minutes": 预计分钟数, "note": "说明" } 或 null（表示从当天上一项到这里怎么走；当天第一项通常为 null）
        }
      ]
    }
  ]
}
规则：
- 票数高的建议优先安排；同一天的地点尽量在同一片区域，按顺路排列。
- 住宿类建议放进 lodging，不要作为 items。
- 已完成（done=true）的现有行程项必须原样保留，并带上它的 id。
- 不要编造建议中没有的具体店名；可以用「午餐（附近觅食）」这类通用项补全。${
    input.dayTotal ? `\n- 行程必须恰好 ${input.dayTotal} 天。` : ""
  }`;

  const user = JSON.stringify(
    {
      旅行: { 名称: trip.name, 目的地: trip.destination, 开始: trip.startDate, 结束: trip.endDate, 人数: input.memberCount },
      建议: input.suggestions.map((s) => ({
        id: s.id,
        title: s.title,
        type: s.type,
        address: s.address,
        reason: s.reason,
        票数: s.votes,
        讨论: s.comments.slice(0, 5),
      })),
      现有行程: plan,
      额外要求: input.instructions,
    },
    null,
    1,
  );
  return { system, user };
}

/** Maps the model's JSON onto a snapshot, trusting only ids and coordinates we already know. */
export function draftToSnapshot(raw: z.infer<typeof aiDraftSchema>, input: DraftInput): PlanSnapshot {
  const suggestions = new Map(input.suggestions.map((s) => [s.id, s]));
  const existing = new Map(input.plan.flatMap((d) => d.items).map((i) => [i.id, i]));
  const used = new Set<string>();
  return {
    days: raw.days.map((d, di) => ({
      id: input.plan[di]?.id,
      title: d.title ?? null,
      lodging: d.lodging ? { name: d.lodging.name, address: d.lodging.address ?? null } : null,
      items: d.items.map((it) => {
        const prev = it.id && !used.has(it.id) ? existing.get(it.id) : undefined;
        if (prev) used.add(prev.id);
        const sug = it.suggestionId ? suggestions.get(it.suggestionId) : undefined;
        const src = prev ?? sug;
        return {
          id: prev?.id,
          title: it.title,
          type: it.type,
          address: it.address ?? src?.address ?? null,
          lng: src?.lng ?? null,
          lat: src?.lat ?? null,
          poiId: prev?.poiId ?? null,
          time: it.time ?? null,
          notes: it.notes ?? null,
          transport: it.transport ? { mode: it.transport.mode, minutes: it.transport.minutes ?? null, note: it.transport.note ?? null } : null,
          suggestionId: prev?.suggestionId ?? (sug ? sug.id : null),
        };
      }),
    })),
  };
}

export async function generateDraft(input: DraftInput) {
  const base = (process.env.AI_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "");
  const { system, user } = buildPrompt(input);
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.AI_API_KEY}` },
    body: JSON.stringify({
      model: process.env.AI_MODEL || "deepseek-chat",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      temperature: 0.4,
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) throw new Error(`AI 接口返回 ${res.status}：${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content ?? "";
  const json = JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, ""));
  const parsed = aiDraftSchema.parse(json);
  return { summary: parsed.summary ?? null, snapshot: draftToSnapshot(parsed, input) };
}
