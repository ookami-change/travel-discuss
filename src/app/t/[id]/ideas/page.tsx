"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SuggestionForm } from "@/components/suggestion-form";
import { useTrip } from "@/components/trip-context";
import { Button, Card, Chip, Empty, PageHeader, Sheet } from "@/components/ui";
import { SUGGESTION_TYPES, type SuggestionType } from "@/lib/constants";
import { api, useApi } from "@/lib/client";
import { TYPE_LABEL } from "@/lib/labels";
import type { Suggestion } from "@/lib/types";

export default function IdeasPage() {
  const { base, href, nameOf } = useTrip();
  const { data, mutate } = useApi<Suggestion[]>(`${base}/suggestions`);
  const [type, setType] = useState<SuggestionType | null>(null);
  const [sort, setSort] = useState<"votes" | "new">("votes");
  const [adding, setAdding] = useState(false);

  const list = useMemo(() => {
    const l = (data ?? []).filter((s) => !type || s.type === type);
    return sort === "votes" ? [...l].sort((a, b) => b.votes - a.votes) : l;
  }, [data, type, sort]);

  async function toggleVote(s: Suggestion) {
    mutate((cur) => cur?.map((x) => (x.id === s.id ? { ...x, voted: !s.voted, votes: x.votes + (s.voted ? -1 : 1) } : x)), { revalidate: false });
    await api(s.voted ? "DELETE" : "POST", `${base}/suggestions/${s.id}/vote`).catch(() => {});
    mutate();
  }

  return (
    <>
      <PageHeader
        title="大家的建议"
        action={
          <Button size="sm" onClick={() => setAdding(true)}>
            ＋ 提建议
          </Button>
        }
      />
      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1">
        <Chip active={sort === "votes"} onClick={() => setSort("votes")}>
          最多想去
        </Chip>
        <Chip active={sort === "new"} onClick={() => setSort("new")}>
          最新
        </Chip>
        <span className="mx-1 w-px shrink-0 bg-line" />
        <Chip active={!type} onClick={() => setType(null)}>
          全部
        </Chip>
        {SUGGESTION_TYPES.map((t) => (
          <Chip key={t} active={type === t} onClick={() => setType(type === t ? null : t)}>
            {TYPE_LABEL[t].icon} {TYPE_LABEL[t].label}
          </Chip>
        ))}
      </div>

      {data && list.length === 0 && (
        <Empty icon="💡" title="还没有建议">
          想去哪、想吃什么、住哪里，都可以提出来，大家投票。
        </Empty>
      )}
      <div className="space-y-3">
        {list.map((s) => (
          <Card key={s.id} className="flex gap-3 p-3">
            <button
              onClick={() => toggleVote(s)}
              className={`flex w-12 shrink-0 flex-col items-center justify-center rounded-xl border text-sm ${s.voted ? "border-accent bg-accent-soft text-accent" : "border-line text-muted"}`}
              aria-label={s.voted ? "取消想去" : "想去"}
            >
              <span className="text-lg leading-none">{s.voted ? "♥" : "♡"}</span>
              {s.votes}
            </button>
            <Link href={href(`/ideas/${s.id}`)} className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span>{TYPE_LABEL[s.type].icon}</span>
                <span className="truncate font-medium">{s.title}</span>
                {s.inPlan && <span className="shrink-0 rounded bg-accent-soft px-1.5 text-xs text-accent">已排入</span>}
              </div>
              {s.reason && <p className="mt-0.5 line-clamp-2 text-sm text-muted">{s.reason}</p>}
              <p className="mt-1 text-xs text-muted">
                {nameOf(s.authorId)} 提议{s.commentCount > 0 && ` · 💬 ${s.commentCount}`}
                {s.address && ` · ${s.address}`}
              </p>
            </Link>
          </Card>
        ))}
      </div>

      <Sheet open={adding} onClose={() => setAdding(false)} title="提一个建议">
        <SuggestionForm
          onDone={() => {
            setAdding(false);
            mutate();
          }}
        />
      </Sheet>
    </>
  );
}
