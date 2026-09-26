"use client";

import { useState } from "react";
import { SnapshotView } from "@/components/snapshot-view";
import { useTrip } from "@/components/trip-context";
import { Button, Card, Chip, ErrorText, PageHeader, Sheet, useAsync } from "@/components/ui";
import { api, useApi } from "@/lib/client";
import { timeAgo } from "@/lib/labels";
import type { Activity, Version } from "@/lib/types";

export default function HistoryPage() {
  const { base, href, nameOf, trip } = useTrip();
  const [tab, setTab] = useState<"versions" | "activity">("versions");
  const { data: versions, mutate } = useApi<Version[]>(tab === "versions" ? `${base}/plan/versions` : null);
  const { data: activity } = useApi<Activity[]>(tab === "activity" ? `${base}/activity` : null);
  const [preview, setPreview] = useState<Version | null>(null);
  const { busy, error, run } = useAsync();

  const saveNow = () =>
    run(async () => {
      const reason = prompt("给这个版本起个名字", "手动保存");
      if (reason === null) return;
      await api("POST", `${base}/plan/versions`, { reason: reason || "手动保存" });
      mutate();
    });
  const restore = (v: Version) =>
    run(async () => {
      if (!confirm("用这个版本替换当前计划？当前计划会先自动保存。")) return;
      await api("POST", `${base}/plan/versions/${v.id}/restore`);
      setPreview(null);
      mutate();
    });

  return (
    <>
      <PageHeader title="历史" back={href("/plan")} />
      <div className="mb-4 flex gap-2">
        <Chip active={tab === "versions"} onClick={() => setTab("versions")}>
          行程版本
        </Chip>
        <Chip active={tab === "activity"} onClick={() => setTab("activity")}>
          动态
        </Chip>
      </div>

      {tab === "versions" ? (
        <>
          <Button variant="secondary" size="sm" className="mb-3" onClick={saveNow} busy={busy}>
            保存当前版本
          </Button>
          <ErrorText error={error} />
          <Card className="divide-y divide-line">
            {versions?.length === 0 && <p className="p-4 text-sm text-muted">还没有版本。开始编辑行程后会自动保存。</p>}
            {versions?.map((v) => (
              <button key={v.id} onClick={() => setPreview(v)} className="flex w-full items-center gap-3 p-3 text-left hover:bg-bg">
                <span className="flex-1">
                  <span className="block">{v.reason}</span>
                  <span className="block text-xs text-muted">
                    {new Date(v.createdAt).toLocaleString("zh-CN")} · {v.createdBy ? nameOf(v.createdBy) : "系统"} · {v.dayCount} 天 {v.itemCount} 项
                  </span>
                </span>
                <span className="text-muted">›</span>
              </button>
            ))}
          </Card>
        </>
      ) : (
        <ul className="space-y-2">
          {activity?.map((a) => (
            <li key={a.id} className="flex gap-3 text-sm">
              <span className="w-16 shrink-0 text-xs leading-5 text-muted">{timeAgo(a.createdAt)}</span>
              <span>{a.summary}</span>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={!!preview} onClose={() => setPreview(null)} title={preview?.reason ?? ""}>
        {preview && (
          <div className="space-y-4">
            <p className="text-sm text-muted">{new Date(preview.createdAt).toLocaleString("zh-CN")}</p>
            <SnapshotView snapshot={preview.snapshot} startDate={trip.startDate} />
            <ErrorText error={error} />
            <Button className="sticky bottom-0 w-full" busy={busy} onClick={() => restore(preview)}>
              恢复到这个版本
            </Button>
          </div>
        )}
      </Sheet>
    </>
  );
}
