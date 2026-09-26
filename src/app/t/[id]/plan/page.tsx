"use client";

import Link from "next/link";
import { useState } from "react";
import { AiPanel } from "@/components/ai-panel";
import { ItemEditor, LodgingEditor } from "@/components/item-editor";
import { useTrip } from "@/components/trip-context";
import { Button, Card, Empty, Input, PageHeader, Sheet, useAsync } from "@/components/ui";
import { api, useApi } from "@/lib/client";
import { dayDate, todayIndex } from "@/lib/itinerary";
import { TRANSPORT_LABEL, TYPE_LABEL, formatDate, formatMinutes } from "@/lib/labels";
import type { PlanDay, PlanItem } from "@/lib/types";

type Editing = { kind: "item"; dayId: string; item?: PlanItem } | { kind: "lodging"; day: PlanDay } | { kind: "day"; day: PlanDay; index: number };

export default function PlanPage() {
  const { base, href, trip } = useTrip();
  const { data: days, mutate } = useApi<PlanDay[]>(`${base}/plan`);
  const [editing, setEditing] = useState<Editing | null>(null);
  const { busy, run } = useAsync();
  const done = () => {
    setEditing(null);
    mutate();
  };
  const call = (method: string, path: string, body?: unknown) => run(() => api(method, `${base}${path}`, body).then(() => mutate()));

  const today = days ? todayIndex(trip.startDate, days.length) : null;

  return (
    <>
      <PageHeader
        title="行程计划"
        action={
          <Link href={href("/history")} className="text-sm text-accent">
            历史版本
          </Link>
        }
      />
      <AiPanel />
      {!days ? (
        <p className="py-8 text-center text-muted">加载中…</p>
      ) : (
        <div className="space-y-4">
          {days.map((day, di) => (
            <Card key={day.id} className={`overflow-hidden ${today === di ? "border-accent" : ""}`}>
              <div className="flex items-center gap-2 border-b border-line px-4 py-3">
                <button className="min-w-0 flex-1 text-left" onClick={() => setEditing({ kind: "day", day, index: di })}>
                  <span className="font-semibold">第 {di + 1} 天</span>
                  {dayDate(trip.startDate, di) && <span className="ml-2 text-sm text-muted">{formatDate(dayDate(trip.startDate, di))}</span>}
                  {today === di && <span className="ml-2 rounded bg-accent px-1.5 text-xs text-accent-fg">今天</span>}
                  <span className="block truncate text-sm text-muted">{day.title || "点击添加当天主题"}</span>
                </button>
              </div>

              {day.items.length === 0 && <p className="px-4 py-4 text-sm text-muted">这一天还没有安排</p>}
              <ol>
                {day.items.map((item, ii) => (
                  <li key={item.id} className="border-b border-line last:border-b-0">
                    {ii > 0 && item.transport && (
                      <p className="bg-bg/60 px-4 py-1 pl-12 text-xs text-muted">
                        {TRANSPORT_LABEL[item.transport.mode].icon} {TRANSPORT_LABEL[item.transport.mode].label} {formatMinutes(item.transport.minutes)}
                        {item.transport.note && ` · ${item.transport.note}`}
                      </p>
                    )}
                    <div className="flex items-start gap-2 px-3 py-2.5">
                      <button
                        onClick={() => call("POST", `/plan/items/${item.id}/complete`, { done: !item.completedAt })}
                        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs ${item.completedAt ? "border-accent bg-accent text-accent-fg" : "border-line"}`}
                        aria-label={item.completedAt ? "撤销打卡" : "打卡完成"}
                      >
                        {item.completedAt ? "✓" : ""}
                      </button>
                      <button className="min-w-0 flex-1 text-left" onClick={() => setEditing({ kind: "item", dayId: day.id, item })}>
                        <span className={item.completedAt ? "text-muted line-through" : ""}>
                          {item.time && <span className="mr-1.5 text-sm text-muted">{item.time}</span>}
                          {TYPE_LABEL[item.type].icon} {item.title}
                        </span>
                        {item.address && <span className="block truncate text-xs text-muted">📍 {item.address}</span>}
                        {item.notes && <span className="block line-clamp-2 text-xs text-muted">{item.notes}</span>}
                      </button>
                      <div className="flex shrink-0 flex-col">
                        <button disabled={busy || ii === 0} onClick={() => call("POST", `/plan/items/${item.id}/move`, { direction: "up" })} className="px-2 text-muted disabled:opacity-20" aria-label="上移">
                          ▲
                        </button>
                        <button
                          disabled={busy || ii === day.items.length - 1}
                          onClick={() => call("POST", `/plan/items/${item.id}/move`, { direction: "down" })}
                          className="px-2 text-muted disabled:opacity-20"
                          aria-label="下移"
                        >
                          ▼
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>

              <div className="space-y-2 border-t border-line bg-bg/40 px-4 py-3">
                <button className="block w-full text-left text-sm" onClick={() => setEditing({ kind: "lodging", day })}>
                  {day.lodging ? (
                    <>
                      🏨 <span className="font-medium">{day.lodging.name}</span>
                      {day.lodging.address && <span className="block truncate text-xs text-muted">{day.lodging.address}</span>}
                    </>
                  ) : (
                    <span className="text-muted">🏨 设置今晚住宿</span>
                  )}
                </button>
                <Button variant="ghost" size="sm" className="-ml-3" onClick={() => setEditing({ kind: "item", dayId: day.id })}>
                  ＋ 添加地点/活动
                </Button>
              </div>
            </Card>
          ))}
          {days.length === 0 && <Empty icon="🗓️" title="还没有行程" />}
          <Button variant="secondary" className="w-full" busy={busy} onClick={() => call("POST", "/plan/days", {})}>
            ＋ 再加一天
          </Button>
          <p className="text-center text-xs text-muted">每次编辑前，系统每 30 分钟自动保存一个版本，改错了可以在「历史版本」中恢复。</p>
        </div>
      )}

      <Sheet open={editing?.kind === "item"} onClose={() => setEditing(null)} title={editing?.kind === "item" && editing.item ? "编辑行程项" : "添加到行程"}>
        {editing?.kind === "item" && days && <ItemEditor key={editing.item?.id ?? editing.dayId} days={days} dayId={editing.dayId} item={editing.item} onDone={done} />}
      </Sheet>
      <Sheet open={editing?.kind === "lodging"} onClose={() => setEditing(null)} title="住宿">
        {editing?.kind === "lodging" && <LodgingEditor key={editing.day.id} day={editing.day} onDone={done} />}
      </Sheet>
      <Sheet open={editing?.kind === "day"} onClose={() => setEditing(null)} title={editing?.kind === "day" ? `第 ${editing.index + 1} 天` : ""}>
        {editing?.kind === "day" && days && <DayEditor key={editing.day.id} day={editing.day} index={editing.index} total={days.length} onDone={done} />}
      </Sheet>
    </>
  );
}

function DayEditor({ day, index, total, onDone }: { day: PlanDay; index: number; total: number; onDone: () => void }) {
  const { base } = useTrip();
  const [title, setTitle] = useState(day.title ?? "");
  const { busy, run } = useAsync();
  const act = (method: string, path: string, body?: unknown) => run(() => api(method, `${base}/plan/days/${day.id}${path}`, body).then(onDone));

  return (
    <div className="space-y-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          act("PATCH", "", { title });
        }}
      >
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="当天主题，如：古城漫步" maxLength={100} className="flex-1" />
        <Button busy={busy}>保存</Button>
      </form>
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" disabled={busy || index === 0} onClick={() => act("POST", "/move", { direction: "up" })}>
          ▲ 提前一天
        </Button>
        <Button variant="secondary" className="flex-1" disabled={busy || index === total - 1} onClick={() => act("POST", "/move", { direction: "down" })}>
          ▼ 推后一天
        </Button>
      </div>
      <Button
        variant="danger"
        className="w-full"
        disabled={busy}
        onClick={() => confirm(`删除第 ${index + 1} 天及其中 ${day.items.length} 个行程项？可以在历史版本中恢复。`) && act("DELETE", "")}
      >
        删除这一天
      </Button>
    </div>
  );
}
