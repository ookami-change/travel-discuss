import { z } from "zod";
import { SUGGESTION_TYPES, TRANSPORT_MODES, type DraftMode, type Lodging, type PlanSnapshot, type SuggestionType } from "@/db/schema";
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
    type: SuggestionType;
    address: string | null;
    lng: number | null;
    lat: number | null;
    reason: string | null;
    votes: number;
    comments: string[];
  }[];
  plan: Plan;
  mode: DraftMode;
  instructions: string | null;
};

const aiItem = z.object({
  id: z.string().nullish(),
  suggestionId: z.string().nullish(),
  // Omitted fields on an existing item mean "unchanged" (adjust mode sends just the id).
  title: z.string().min(1).max(100).optional().catch(undefined),
  type: z.enum(SUGGESTION_TYPES).optional().catch("other"),
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
        id: z.string().nullish(),
        title: z.string().max(100).nullish(),
        lodging: z.object({ name: z.string().min(1).max(100), address: z.string().max(200).nullish() }).nullish().catch(null),
        items: z.array(aiItem).max(30),
      }),
    )
    .min(1)
    .max(60),
});

const ITEM_FORMAT = `{
          "id": "若沿用现有行程中的某一项，填它的 id，否则 null",
          "suggestionId": "若来自某条建议，填建议 id，否则 null",
          "title": "地点或活动名称",
          "type": ${JSON.stringify(SUGGESTION_TYPES)} 之一,
          "address": "地址或 null",
          "time": "HH:MM 或 null",
          "notes": "简短备注或 null",
          "transport": { "mode": ${JSON.stringify(TRANSPORT_MODES)} 之一, "minutes": 预计分钟数, "note": "说明" } 或 null（表示从当天上一项到这里怎么走；当天第一项通常为 null）
        }`;

export function buildPrompt(input: DraftInput) {
  const { trip } = input;
  const adjust = input.mode === "adjust";
  const plan = input.plan.map((d, i) => ({
    id: d.id,
    day: i + 1,
    title: d.title,
    lodging: d.lodging ? { name: d.lodging.name, address: d.lodging.address ?? null } : null,
    items: d.items.map((it) => ({
      id: it.id,
      title: it.title,
      ...(adjust && { type: it.type, address: it.address, transport: it.transport, suggestionId: it.suggestionId }),
      time: it.time,
      notes: it.notes,
      done: Boolean(it.completedAt),
    })),
  }));
  const intro = adjust
    ? `你是一名细致的旅行规划师。一群朋友已经排好了一份行程，现在希望你按他们的要求做调整。
只改和要求相关的部分，其余内容保持原样——不要顺手重排、改写或润色没被要求改动的项。`
    : "你是一名细致的旅行规划师。你会根据一群朋友的讨论，把他们的建议整理成一份按天排列、顺路可行的行程。";
  const rules = adjust
    ? `规则：
- 输出调整后的完整行程（所有天、所有项，按新顺序排列）。
- 没有改动的现有项只写 {"id": "..."}，省略其他字段；改动了的现有项写 id 和改动后的字段（未改的字段可以省略）；新增项 id 为 null 并写全字段。
- 没有改动的天只写 {"id": "...", "items": [...]}，省略 title 和 lodging。
- 删除某项就是不在输出中列出它。已完成（done=true）的项不能删除。
- summary 里逐条说明改了什么、为什么。
- 可以参考大家的建议来补充内容，但不要编造建议中没有的具体店名。`
    : `规则：
- 票数高的建议优先安排；同一天的地点尽量在同一片区域，按顺路排列。
- 住宿类建议放进 lodging，不要作为 items。
- 已完成（done=true）的现有行程项必须原样保留，并带上它的 id。
- 不要编造建议中没有的具体店名；可以用「午餐（附近觅食）」这类通用项补全。${input.dayTotal ? `\n- 行程必须恰好 ${input.dayTotal} 天。` : ""}`;

  const system = `${intro}
只输出一个 JSON 对象，不要输出任何其他文字。格式：
{
  "summary": "${adjust ? "用 2-5 句话说明做了哪些调整" : "用 2-4 句话说明安排思路，以及哪些建议没有排进去、为什么"}",
  "days": [
    {
      "id": "沿用现有的某一天时填它的 id，新增的天填 null",
      "title": "当天主题，如「老城区漫步」",
      "lodging": { "name": "住宿名称", "address": "地址" } 或 null,
      "items": [
        ${ITEM_FORMAT}
      ]
    }
  ]
}
${rules}`;

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
      [adjust ? "调整要求" : "额外要求"]: input.instructions,
    },
    null,
    1,
  );
  return { system, user };
}

/**
 * Maps the model's JSON onto a snapshot, trusting only ids and coordinates we already know.
 * Fields the model leaves out of an existing day/item keep their current values.
 */
export function draftToSnapshot(raw: z.infer<typeof aiDraftSchema>, input: DraftInput): PlanSnapshot {
  const suggestions = new Map(input.suggestions.map((s) => [s.id, s]));
  const existingDays = new Map(input.plan.map((d) => [d.id, d]));
  const existing = new Map(input.plan.flatMap((d) => d.items).map((i) => [i.id, i]));
  const usedDays = new Set<string>();
  const used = new Set<string>();

  const days: PlanSnapshot["days"] = raw.days.map((d, di) => {
    // Older prompts had no day ids, so fall back to position.
    const byId = d.id && !usedDays.has(d.id) ? existingDays.get(d.id) : undefined;
    const byIndex = !d.id && input.plan[di] && !usedDays.has(input.plan[di].id) ? input.plan[di] : undefined;
    const prevDay = byId ?? byIndex;
    if (prevDay) usedDays.add(prevDay.id);

    let lodging: Lodging | null;
    if (d.lodging === undefined) lodging = prevDay?.lodging ?? null;
    else if (d.lodging && prevDay?.lodging?.name === d.lodging.name) lodging = prevDay.lodging;
    else lodging = d.lodging ? { name: d.lodging.name, address: d.lodging.address ?? null } : null;

    const items = d.items.flatMap((it) => {
      const prev = it.id && !used.has(it.id) ? existing.get(it.id) : undefined;
      if (prev) used.add(prev.id);
      const sug = it.suggestionId ? suggestions.get(it.suggestionId) : undefined;
      const title = it.title ?? prev?.title;
      if (!title) return [];
      // A new address from the model invalidates the old coordinates.
      const moved = prev && it.address !== undefined && it.address !== prev.address;
      const place = moved ? sug : (prev ?? sug);
      return [
        {
          id: prev?.id,
          title,
          type: it.type ?? prev?.type ?? sug?.type ?? "other",
          address: it.address !== undefined ? (it.address ?? place?.address ?? null) : (place?.address ?? null),
          lng: place?.lng ?? null,
          lat: place?.lat ?? null,
          poiId: moved ? null : (prev?.poiId ?? null),
          time: it.time !== undefined ? it.time : (prev?.time ?? null),
          notes: it.notes !== undefined ? it.notes : (prev?.notes ?? null),
          transport:
            it.transport !== undefined
              ? it.transport && { mode: it.transport.mode, minutes: it.transport.minutes ?? null, note: it.transport.note ?? null }
              : (prev?.transport ?? null),
          suggestionId: prev?.suggestionId ?? (sug ? sug.id : null),
        },
      ];
    });
    return {
      id: prevDay?.id,
      title: d.title !== undefined ? d.title : (prevDay?.title ?? null),
      lodging,
      items,
    };
  });

  // Checked-off stops are history; never let the model drop them.
  for (const [di, day] of input.plan.entries()) {
    for (const it of day.items) {
      if (!it.completedAt || used.has(it.id)) continue;
      const target = days.find((d) => d.id === day.id) ?? days[Math.min(di, days.length - 1)];
      target.items.push({
        id: it.id,
        title: it.title,
        type: it.type,
        address: it.address,
        lng: it.lng,
        lat: it.lat,
        poiId: it.poiId,
        time: it.time,
        notes: it.notes,
        transport: it.transport ?? null,
        suggestionId: it.suggestionId,
      });
    }
  }
  return { days };
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
