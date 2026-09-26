"use client";

import { useState } from "react";
import { useTrip } from "@/components/trip-context";
import { Button, Card, Empty, ErrorText, Field, Input, PageHeader, Select, useAsync } from "@/components/ui";
import { api, useApi } from "@/lib/client";
import { localToday } from "@/lib/itinerary";
import { yuan } from "@/lib/labels";
import type { Expense } from "@/lib/types";

export default function ExpensesPage() {
  const { base, href, me, members, nameOf } = useTrip();
  const { data, mutate } = useApi<Expense[]>(`${base}/expenses`);
  const [f, setF] = useState({ title: "", amount: "", payerId: me.id, spentOn: localToday() });
  const { busy, error, run } = useAsync();

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const amountCents = Math.round(Number(f.amount) * 100);
      if (!Number.isFinite(amountCents) || amountCents <= 0) throw new Error("请输入正确的金额");
      await api("POST", `${base}/expenses`, { title: f.title, amountCents, payerId: f.payerId, spentOn: f.spentOn || null });
      setF({ ...f, title: "", amount: "" });
      mutate();
    });
  };
  const remove = (x: Expense) =>
    run(async () => {
      if (!confirm(`删除「${x.title}」？`)) return;
      await api("DELETE", `${base}/expenses/${x.id}`);
      mutate();
    });

  const total = (data ?? []).reduce((n, x) => n + x.amountCents, 0);
  const byPayer = members
    .map((m) => ({ m, sum: (data ?? []).filter((x) => x.payerId === m.id).reduce((n, x) => n + x.amountCents, 0) }))
    .filter((r) => r.sum > 0);

  return (
    <>
      <PageHeader title="记账" back={href("/more")} />
      <Card className="mb-4 p-4">
        <form onSubmit={add} className="space-y-3">
          <div className="grid grid-cols-[1fr_7rem] gap-2">
            <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="项目，如：晚饭" required maxLength={100} />
            <Input value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="金额" inputMode="decimal" required />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="谁付的">
              <Select value={f.payerId} onChange={(e) => setF({ ...f, payerId: e.target.value })}>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nickname}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="日期">
              <Input type="date" value={f.spentOn} onChange={(e) => setF({ ...f, spentOn: e.target.value })} />
            </Field>
          </div>
          <ErrorText error={error} />
          <Button className="w-full" busy={busy}>
            记一笔
          </Button>
        </form>
      </Card>

      {data && data.length > 0 && (
        <Card className="mb-4 p-4">
          <p className="text-sm text-muted">合计</p>
          <p className="text-2xl font-semibold">{yuan(total)}</p>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
            {byPayer.map(({ m, sum }) => (
              <li key={m.id}>
                {m.nickname} 付了 {yuan(sum)}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {data?.length === 0 && <Empty icon="💰" title="还没有记录" />}
      <Card className="divide-y divide-line">
        {data?.map((x) => (
          <div key={x.id} className="flex items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate">{x.title}</p>
              <p className="text-xs text-muted">
                {nameOf(x.payerId)} 付 · {x.spentOn ?? new Date(x.createdAt).toLocaleDateString("zh-CN")}
              </p>
            </div>
            <span className="font-medium">{yuan(x.amountCents)}</span>
            {(x.createdBy === me.id || me.isAdmin) && (
              <button onClick={() => remove(x)} className="text-sm text-muted hover:text-danger" aria-label="删除">
                ×
              </button>
            )}
          </div>
        ))}
      </Card>
    </>
  );
}
