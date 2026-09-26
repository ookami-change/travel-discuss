"use client";

import { useMemo, useState } from "react";
import { DraftReview } from "@/components/draft-review";
import { useTrip } from "@/components/trip-context";
import { Button, Card, Chip, ErrorText, Field, Sheet, Textarea, useAsync } from "@/components/ui";
import type { DraftMode, PlanSnapshot } from "@/db/schema";
import { api, useApi } from "@/lib/client";
import { timeAgo } from "@/lib/labels";
import { fromPlan } from "@/lib/plan-diff";
import type { Draft, PlanDay } from "@/lib/types";

type DraftState = { enabled: boolean; latest: Draft | null };

/** Request an AI candidate plan (fresh, or an adjustment of the current one) and review/adopt it. */
export function AiPanel() {
  const { base, nameOf } = useTrip();
  const { data, mutate } = useApi<DraftState>(`${base}/plan/drafts`);
  const { data: plan } = useApi<PlanDay[]>(`${base}/plan`);
  const current = useMemo(() => (plan ? fromPlan(plan) : null), [plan]);
  const [asking, setAsking] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [chosenMode, setMode] = useState<DraftMode | null>(null);
  const [instructions, setInstructions] = useState("");
  const { busy, error, run } = useAsync();

  if (!data?.enabled) return null;
  const d = data.latest;
  const pending = d?.status === "pending";
  const hasPlan = Boolean(plan?.some((day) => day.items.length));
  const mode = chosenMode ?? (hasPlan ? "adjust" : "fresh");

  const request = () =>
    run(async () => {
      await api("POST", `${base}/plan/drafts`, { mode, instructions: instructions || null });
      setAsking(false);
      setInstructions("");
      mutate();
    });
  const save = (snapshot: PlanSnapshot) =>
    run(async () => {
      // Show the edit straight away; the server copy follows.
      mutate({ ...data, latest: { ...d!, snapshot } }, { revalidate: false });
      try {
        await api("PATCH", `${base}/plan/drafts/${d!.id}`, { snapshot });
      } finally {
        mutate();
      }
    });
  const apply = ({ added, removed, changed }: { added: number; removed: number; changed: number }) =>
    run(async () => {
      const what = [added && `新增 ${added} 项`, changed && `修改 ${changed} 项`, removed && `删除 ${removed} 项`].filter(Boolean).join("、");
      if (!confirm(`采纳后当前计划会${what ? `：${what}` : "被替换"}。\n当前计划会先自动保存为一个版本，随时可以恢复。`)) return;
      await api("POST", `${base}/plan/drafts/${d!.id}/apply`);
      setReviewing(false);
      mutate();
    });
  const discard = () =>
    run(async () => {
      if (!confirm("放弃这份方案？")) return;
      await api("POST", `${base}/plan/drafts/${d!.id}/discard`);
      setReviewing(false);
      mutate();
    });

  return (
    <>
      {pending ? (
        <Card className="mb-4 flex items-center gap-3 p-3 text-sm">
          <span className="animate-pulse text-xl">✨</span>
          <span className="flex-1">
            {d?.mode === "adjust" ? "AI 正在按要求调整行程" : "AI 正在根据大家的建议排行程"}，通常需要半分钟到两分钟…
          </span>
        </Card>
      ) : d?.status === "ready" ? (
        <Card className="mb-4 flex items-center gap-3 border-accent bg-accent-soft p-3 text-sm">
          <span className="text-xl">✨</span>
          <span className="flex-1">
            {d.mode === "adjust" ? "AI 调整方案" : "AI 候选方案"}已生成（{nameOf(d.createdBy)} 发起 · {timeAgo(d.createdAt)}），看看改了什么
          </span>
          <Button size="sm" onClick={() => setReviewing(true)}>
            对比查看
          </Button>
        </Card>
      ) : (
        <div className="mb-4 flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setAsking(true)}>
            {hasPlan ? "✨ 让 AI 调整行程" : "✨ AI 帮我排行程"}
          </Button>
          {d?.status === "failed" && <span className="text-xs text-danger">上次生成失败{d?.error ? `：${d.error.slice(0, 60)}` : ""}</span>}
        </div>
      )}

      <Sheet open={asking} onClose={() => setAsking(false)} title="让 AI 帮忙">
        <div className="space-y-4">
          {hasPlan && (
            <div className="flex gap-2">
              <Chip active={mode === "adjust"} onClick={() => setMode("adjust")}>
                在现有行程上调整
              </Chip>
              <Chip active={mode === "fresh"} onClick={() => setMode("fresh")}>
                重新排一版
              </Chip>
            </div>
          )}
          <p className="text-sm text-muted">
            {mode === "adjust" ? (
              <>AI 只改你提到的部分，其余保持原样。生成后会列出新旧对比，可以逐条还原或手动修改，有人点「采纳」才会生效。</>
            ) : (
              <>
                AI 会参考所有建议（优先高票）、讨论和现有行程，生成一份<b>候选方案</b>。不会直接改动计划，需要有人查看对比后点「采纳」。
              </>
            )}
          </p>
          <Field label={mode === "adjust" ? "想怎么调整" : "额外要求（可选）"}>
            <Textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              maxLength={1000}
              placeholder={mode === "adjust" ? "如：第二天下午加个咖啡馆；把博物馆挪到第三天；每天晚饭前留出休息时间" : "如：第二天想轻松一点；有老人，少走路"}
            />
          </Field>
          <ErrorText error={error} />
          <Button className="w-full" busy={busy} disabled={mode === "adjust" && !instructions.trim()} onClick={request}>
            {mode === "adjust" ? "生成调整方案" : "生成候选方案"}
          </Button>
        </div>
      </Sheet>

      <Sheet open={reviewing} onClose={() => setReviewing(false)} title={d?.mode === "adjust" ? "AI 调整方案 · 新旧对比" : "AI 候选方案 · 新旧对比"}>
        {d?.status === "ready" && d.snapshot && current ? (
          <DraftReview draft={{ ...d, snapshot: d.snapshot }} current={current} busy={busy} error={error} onSave={save} onApply={apply} onDiscard={discard} />
        ) : (
          <p className="py-8 text-center text-sm text-muted">这份方案已经被处理了</p>
        )}
      </Sheet>
    </>
  );
}
