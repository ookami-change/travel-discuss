"use client";

import { useState } from "react";
import { SnapshotView } from "@/components/snapshot-view";
import { useTrip } from "@/components/trip-context";
import { Button, Card, ErrorText, Field, Sheet, Textarea, useAsync } from "@/components/ui";
import { api, useApi } from "@/lib/client";
import { timeAgo } from "@/lib/labels";
import type { Draft } from "@/lib/types";

/** Request an AI candidate plan and review/adopt it. Adopting never happens implicitly. */
export function AiPanel() {
  const { base, trip, nameOf } = useTrip();
  const { data, mutate } = useApi<{ enabled: boolean; latest: Draft | null }>(`${base}/plan/drafts`);
  const [asking, setAsking] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [instructions, setInstructions] = useState("");
  const { busy, error, run } = useAsync();

  if (!data?.enabled) return null;
  const d = data.latest;
  const pending = d?.status === "pending";

  const request = () =>
    run(async () => {
      await api("POST", `${base}/plan/drafts`, { instructions: instructions || null });
      setAsking(false);
      mutate();
    });
  const apply = () =>
    run(async () => {
      if (!confirm("用 AI 方案替换当前计划？当前计划会先自动保存为一个版本，随时可以恢复。")) return;
      await api("POST", `${base}/plan/drafts/${d!.id}/apply`);
      setReviewing(false);
      mutate();
    });
  const discard = () =>
    run(async () => {
      await api("POST", `${base}/plan/drafts/${d!.id}/discard`);
      setReviewing(false);
      mutate();
    });

  return (
    <>
      {pending ? (
        <Card className="mb-4 flex items-center gap-3 p-3 text-sm">
          <span className="animate-pulse text-xl">✨</span>
          <span className="flex-1">AI 正在根据大家的建议排行程，通常需要半分钟到两分钟…</span>
        </Card>
      ) : d?.status === "ready" ? (
        <Card className="mb-4 flex items-center gap-3 border-accent bg-accent-soft p-3 text-sm">
          <span className="text-xl">✨</span>
          <span className="flex-1">
            AI 候选方案已生成（{nameOf(d.createdBy)} 发起 · {timeAgo(d.createdAt)}）
          </span>
          <Button size="sm" onClick={() => setReviewing(true)}>
            查看
          </Button>
        </Card>
      ) : (
        <div className="mb-4 flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setAsking(true)}>
            ✨ AI 帮我排行程
          </Button>
          {d?.status === "failed" && <span className="text-xs text-danger">上次生成失败{d?.error ? `：${d.error.slice(0, 60)}` : ""}</span>}
        </div>
      )}

      <Sheet open={asking} onClose={() => setAsking(false)} title="AI 帮我排行程">
        <div className="space-y-4">
          <p className="text-sm text-muted">
            AI 会参考所有建议（优先高票）、讨论和现有行程，生成一份<b>候选方案</b>。不会直接改动计划，需要有人查看后点「采纳」。
          </p>
          <Field label="额外要求（可选）">
            <Textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} maxLength={1000} placeholder="如：第二天想轻松一点；有老人，少走路" />
          </Field>
          <ErrorText error={error} />
          <Button className="w-full" busy={busy} onClick={request}>
            生成候选方案
          </Button>
        </div>
      </Sheet>

      <Sheet open={reviewing} onClose={() => setReviewing(false)} title="AI 候选方案">
        {d?.snapshot && (
          <div className="space-y-4">
            {d.summary && <p className="rounded-xl bg-card p-3 text-sm">{d.summary}</p>}
            <SnapshotView snapshot={d.snapshot} startDate={trip.startDate} />
            <ErrorText error={error} />
            <div className="sticky bottom-0 flex gap-2 bg-bg pt-2">
              <Button variant="secondary" onClick={discard} disabled={busy}>
                放弃
              </Button>
              <Button className="flex-1" onClick={apply} busy={busy}>
                采纳（替换当前计划）
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </>
  );
}
