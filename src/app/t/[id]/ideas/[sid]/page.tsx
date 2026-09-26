"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { NavLinks } from "@/components/nav-links";
import { SuggestionForm } from "@/components/suggestion-form";
import { Thread } from "@/components/thread";
import { useTrip } from "@/components/trip-context";
import { Button, Card, ErrorText, Field, PageHeader, Select, Sheet, useAsync } from "@/components/ui";
import { api, useApi } from "@/lib/client";
import { dayDate } from "@/lib/itinerary";
import { TYPE_LABEL, formatDate, timeAgo } from "@/lib/labels";
import type { PlanDay, Suggestion } from "@/lib/types";

export default function IdeaPage() {
  const { sid } = useParams<{ sid: string }>();
  const router = useRouter();
  const { base, href, me, nameOf, trip } = useTrip();
  const { data: s, mutate, error } = useApi<Suggestion>(`${base}/suggestions/${sid}`);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);

  if (error) return <p className="p-8 text-center text-muted">{error.message}</p>;
  if (!s) return <p className="p-8 text-center text-muted">加载中…</p>;
  const mine = s.authorId === me.id || me.isAdmin;

  async function remove() {
    if (!confirm("删除这条建议？评论也会一起删除。")) return;
    await api("DELETE", `${base}/suggestions/${sid}`);
    router.replace(href("/ideas"));
  }

  async function toggleVote() {
    await api(s!.voted ? "DELETE" : "POST", `${base}/suggestions/${sid}/vote`);
    mutate();
  }

  return (
    <>
      <PageHeader title={s.title} back={href("/ideas")} />
      <Card className="space-y-3 p-4">
        <p className="text-sm text-muted">
          {TYPE_LABEL[s.type].icon} {TYPE_LABEL[s.type].label} · {nameOf(s.authorId)} 提议于 {timeAgo(s.createdAt)}
        </p>
        {s.address && <p className="text-sm">📍 {s.address}</p>}
        {s.reason && <p className="whitespace-pre-wrap">{s.reason}</p>}
        {s.links.length > 0 && (
          <ul className="space-y-1">
            {s.links.map((l) => (
              <li key={l} className="truncate text-sm">
                <a href={l} target="_blank" rel="noreferrer noopener" className="text-accent underline">
                  {l}
                </a>
              </li>
            ))}
          </ul>
        )}
        {(s.address || s.lng != null) && <NavLinks target={s} city={trip.destination} compact />}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant={s.voted ? "primary" : "secondary"} size="sm" onClick={toggleVote}>
            {s.voted ? "♥ 想去" : "♡ 想去"} · {s.votes}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
            {s.inPlan ? "✓ 已排入，再加一次" : "＋ 加入行程"}
          </Button>
          {mine && (
            <>
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                编辑
              </Button>
              <Button variant="ghost" size="sm" className="text-danger" onClick={remove}>
                删除
              </Button>
            </>
          )}
        </div>
      </Card>

      <h2 className="mb-3 mt-6 font-semibold">讨论 · {s.commentCount}</h2>
      <Thread suggestionId={s.id} />

      <Sheet open={editing} onClose={() => setEditing(false)} title="编辑建议">
        <SuggestionForm
          initial={s}
          onDone={() => {
            setEditing(false);
            mutate();
          }}
        />
      </Sheet>
      <Sheet open={adding} onClose={() => setAdding(false)} title="加入行程">
        <AddToPlan suggestion={s} startDate={trip.startDate} onDone={() => (setAdding(false), mutate())} />
      </Sheet>
    </>
  );
}

function AddToPlan({ suggestion: s, startDate, onDone }: { suggestion: Suggestion; startDate: string | null; onDone: () => void }) {
  const { base } = useTrip();
  const { data: plan } = useApi<PlanDay[]>(`${base}/plan`);
  const [dayId, setDayId] = useState("");
  const { busy, error, run } = useAsync();
  const chosen = dayId || plan?.[0]?.id || "";

  const submit = () =>
    run(async () => {
      if (s.type === "lodging") {
        await api("PATCH", `${base}/plan/days/${chosen}`, { lodging: { name: s.title, address: s.address, lng: s.lng, lat: s.lat, poiId: s.poiId } });
      } else {
        await api("POST", `${base}/plan/items`, {
          dayId: chosen,
          title: s.title,
          type: s.type,
          address: s.address,
          lng: s.lng,
          lat: s.lat,
          poiId: s.poiId,
          suggestionId: s.id,
        });
      }
      onDone();
    });

  if (!plan) return <p className="text-muted">加载中…</p>;
  return (
    <div className="space-y-4">
      <Field label={s.type === "lodging" ? "设为哪一晚的住宿" : "加到哪一天（排在当天最后）"}>
        <Select value={chosen} onChange={(e) => setDayId(e.target.value)}>
          {plan.map((d, i) => (
            <option key={d.id} value={d.id}>
              第 {i + 1} 天{dayDate(startDate, i) ? ` · ${formatDate(dayDate(startDate, i))}` : ""}
              {d.title ? ` · ${d.title}` : ""}
            </option>
          ))}
        </Select>
      </Field>
      <ErrorText error={error} />
      <Button className="w-full" busy={busy} onClick={submit} disabled={!chosen}>
        确定
      </Button>
    </div>
  );
}
