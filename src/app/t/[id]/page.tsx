"use client";

import Link from "next/link";
import { useState } from "react";
import { NavLinks } from "@/components/nav-links";
import { useTrip } from "@/components/trip-context";
import { Button, Card, Empty, useAsync } from "@/components/ui";
import { api, useApi } from "@/lib/client";
import { dayCount, dayDate, localToday, progress, tripPhase } from "@/lib/itinerary";
import { TRANSPORT_LABEL, TYPE_LABEL, formatDate, formatMinutes } from "@/lib/labels";
import type { PlanDay, PlanItem, Suggestion } from "@/lib/types";

export default function TripHome() {
  const { base, trip } = useTrip();
  const { data: days } = useApi<PlanDay[]>(`${base}/plan`);
  const phase = tripPhase(trip.startDate, trip.endDate);
  const [travelView, setTravelView] = useState<boolean | null>(null);
  const showTravel = travelView ?? phase !== "planning";

  return (
    <div className="pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold">{trip.name}</h1>
          <p className="text-sm text-muted">
            {[trip.destination, trip.startDate && `${formatDate(trip.startDate)}${trip.endDate ? ` – ${formatDate(trip.endDate)}` : ""}`].filter(Boolean).join(" · ")}
          </p>
        </div>
        <button onClick={() => setTravelView(!showTravel)} className="shrink-0 rounded-full border border-line bg-card px-3 py-1 text-xs text-muted">
          {showTravel ? "看筹备情况" : "预览旅途模式"}
        </button>
      </div>
      {!days ? <p className="py-8 text-center text-muted">加载中…</p> : showTravel ? <TravelView days={days} /> : <PlanningView days={days} />}
    </div>
  );
}

function PlanningView({ days }: { days: PlanDay[] }) {
  const { base, href, trip, members } = useTrip();
  const { data: ideas } = useApi<Suggestion[]>(`${base}/suggestions`);
  const itemCount = days.reduce((n, d) => n + d.items.length, 0);
  const daysLeft = trip.startDate ? dayCount(localToday(), trip.startDate) - 1 : null;
  const top = [...(ideas ?? [])].sort((a, b) => b.votes - a.votes).slice(0, 3);

  return (
    <div className="space-y-4">
      {daysLeft != null && daysLeft > 0 && (
        <Card className="p-5 text-center">
          <p className="text-sm text-muted">距离出发还有</p>
          <p className="text-4xl font-bold text-accent">{daysLeft} 天</p>
        </Card>
      )}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="成员" value={members.length} to={href("/members")} />
        <Stat label="建议" value={ideas?.length ?? "…"} to={href("/ideas")} />
        <Stat label="已排行程" value={itemCount} to={href("/plan")} />
      </div>
      {top.length > 0 && (
        <Card className="p-4">
          <p className="mb-2 font-semibold">最多人想去</p>
          <ol className="space-y-2">
            {top.map((s, i) => (
              <li key={s.id}>
                <Link href={href(`/ideas/${s.id}`)} className="flex items-center gap-2">
                  <span className="w-4 text-muted">{i + 1}</span>
                  <span className="flex-1 truncate">
                    {TYPE_LABEL[s.type].icon} {s.title}
                  </span>
                  <span className="text-sm text-accent">♥ {s.votes}</span>
                  {s.inPlan && <span className="text-xs text-muted">已排入</span>}
                </Link>
              </li>
            ))}
          </ol>
        </Card>
      )}
      <Card className="space-y-3 p-4">
        <p className="font-semibold">接下来可以做</p>
        <Next done={members.length > 1} to={href("/members")} text="把邀请链接发到群里，拉朋友进来" />
        <Next done={(ideas?.length ?? 0) > 0} to={href("/ideas")} text="每个人提几条想去的地方，互相点「想去」" />
        <Next done={itemCount > 0} to={href("/plan")} text="把建议排进每天的行程，或者让 AI 先出一份草稿" />
        <Next done={days.some((d) => d.lodging)} to={href("/plan")} text="定好每晚住哪里" />
      </Card>
    </div>
  );
}

function Stat({ label, value, to }: { label: string; value: number | string; to: string }) {
  return (
    <Link href={to}>
      <Card className="p-3 text-center hover:border-accent">
        <p className="text-2xl font-semibold">{value}</p>
        <p className="text-xs text-muted">{label}</p>
      </Card>
    </Link>
  );
}

function Next({ done, to, text }: { done: boolean; to: string; text: string }) {
  return (
    <Link href={to} className="flex items-center gap-2 text-sm">
      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs ${done ? "border-accent bg-accent text-accent-fg" : "border-line"}`}>
        {done && "✓"}
      </span>
      <span className={done ? "text-muted line-through" : ""}>{text}</span>
    </Link>
  );
}

function TravelView({ days }: { days: PlanDay[] }) {
  const { base, href, trip, nameOf } = useTrip();
  const { busy, error, run } = useAsync();
  const p = progress(days);
  const complete = (item: PlanItem, done: boolean) => run(() => api("POST", `${base}/plan/items/${item.id}/complete`, { done }));

  if (p.total === 0) {
    return (
      <Empty icon="🗓️" title="还没有行程">
        <Link href={href("/plan")} className="text-accent">
          去排行程 ›
        </Link>
      </Empty>
    );
  }

  const cur = p.current;
  const dayIndex = cur?.dayIndex ?? days.length - 1;
  const day = days[dayIndex];
  const date = dayDate(trip.startDate, dayIndex);
  const lastDone = days
    .flatMap((d) => d.items)
    .filter((i) => i.completedAt)
    .sort((a, b) => b.completedAt!.localeCompare(a.completedAt!))[0];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">
          第 {dayIndex + 1} 天{date && ` · ${formatDate(date)}`}
          {date === localToday() && <span className="ml-1.5 rounded bg-accent px-1.5 text-xs text-accent-fg">今天</span>}
        </span>
        <span className="text-muted">
          已完成 {p.done}/{p.total}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-line">
        <div className="h-full bg-accent transition-all" style={{ width: `${(p.done / p.total) * 100}%` }} />
      </div>

      {cur ? (
        <Card className="space-y-3 border-accent p-4">
          <p className="text-xs font-medium tracking-wide text-accent">当前 / 下一站</p>
          {cur.item.transport && (
            <p className="text-sm text-muted">
              {TRANSPORT_LABEL[cur.item.transport.mode].icon} {TRANSPORT_LABEL[cur.item.transport.mode].label} {formatMinutes(cur.item.transport.minutes)}
              {cur.item.transport.note && ` · ${cur.item.transport.note}`}
            </p>
          )}
          <div>
            <p className="text-2xl font-bold">
              {TYPE_LABEL[cur.item.type].icon} {cur.item.title}
            </p>
            {cur.item.time && <p className="text-sm text-muted">参考时间 {cur.item.time}</p>}
            {cur.item.address && <p className="mt-1 text-sm">📍 {cur.item.address}</p>}
            {cur.item.notes && <p className="mt-2 whitespace-pre-wrap rounded-xl bg-bg p-3 text-sm">{cur.item.notes}</p>}
          </div>
          <NavLinks target={cur.item} city={trip.destination} />
          <div className="flex gap-2">
            <Link href={href(`/media?itemId=${cur.item.id}&upload=1`)} className="flex-1">
              <Button variant="secondary" className="w-full">
                📷 传照片
              </Button>
            </Link>
            <Button className="flex-[2]" busy={busy} onClick={() => complete(cur.item, true)}>
              ✓ 完成，去下一站
            </Button>
          </div>
          {error != null && <p className="text-sm text-danger">{(error as Error).message}</p>}
        </Card>
      ) : (
        <Card className="p-6 text-center">
          <p className="text-3xl">🎉</p>
          <p className="mt-2 font-semibold">全部行程都完成啦</p>
          <Link href={href("/media")} className="mt-2 inline-block text-sm text-accent">
            去相册看看大家的照片 ›
          </Link>
        </Card>
      )}

      {lastDone && (
        <p className="text-center text-xs text-muted">
          上一站「{lastDone.title}」由 {nameOf(lastDone.completedBy)} 打卡 ·{" "}
          <button className="text-accent" disabled={busy} onClick={() => complete(lastDone, false)}>
            撤销
          </button>
        </p>
      )}

      {p.next && (
        <Card className="p-4">
          <p className="mb-1 text-xs text-muted">再下一站{p.next.dayIndex !== dayIndex && `（第 ${p.next.dayIndex + 1} 天）`}</p>
          <p className="font-medium">
            {TYPE_LABEL[p.next.item.type].icon} {p.next.item.title}
            {p.next.item.time && <span className="ml-2 text-sm text-muted">{p.next.item.time}</span>}
          </p>
          {p.next.item.transport && (
            <p className="text-xs text-muted">
              {TRANSPORT_LABEL[p.next.item.transport.mode].label} {formatMinutes(p.next.item.transport.minutes)}
            </p>
          )}
        </Card>
      )}

      {day?.lodging && (
        <Card className="space-y-2 p-4">
          <p className="text-xs text-muted">今晚住</p>
          <p className="font-medium">🏨 {day.lodging.name}</p>
          {day.lodging.address && <p className="text-sm text-muted">{day.lodging.address}</p>}
          {day.lodging.note && <p className="whitespace-pre-wrap text-sm">{day.lodging.note}</p>}
          <NavLinks target={{ title: day.lodging.name, ...day.lodging }} city={trip.destination} compact />
        </Card>
      )}

      {day && (
        <Card className="p-4">
          <p className="mb-2 font-semibold">第 {dayIndex + 1} 天全部安排</p>
          <ol className="space-y-1.5 text-sm">
            {day.items.map((it) => (
              <li key={it.id} className={`flex gap-2 ${it.completedAt ? "text-muted line-through" : ""} ${it.id === cur?.item.id ? "font-semibold text-accent" : ""}`}>
                <span className="w-11 shrink-0 text-muted">{it.time ?? ""}</span>
                <span>
                  {TYPE_LABEL[it.type].icon} {it.title}
                </span>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  );
}
