"use client";

import { useState } from "react";
import { PlaceSearch } from "@/components/place-search";
import { useTrip } from "@/components/trip-context";
import { Button, Chip, ErrorText, Field, Input, Select, Textarea, useAsync } from "@/components/ui";
import { api, useApi } from "@/lib/client";
import { SUGGESTION_TYPES, TRANSPORT_MODES, type TransportMode } from "@/lib/constants";
import { TRANSPORT_LABEL, TYPE_LABEL } from "@/lib/labels";
import type { Lodging, PlanDay, PlanItem, Suggestion } from "@/lib/types";

type Props = { days: PlanDay[]; dayId: string; item?: PlanItem; onDone: () => void };

export function ItemEditor({ days, dayId, item, onDone }: Props) {
  const { base } = useTrip();
  const { busy, error, run } = useAsync();
  const { data: suggestions } = useApi<Suggestion[]>(item ? null : `${base}/suggestions`);
  const [f, setF] = useState({
    dayId,
    title: item?.title ?? "",
    type: item?.type ?? "sight",
    address: item?.address ?? null,
    lng: item?.lng ?? null,
    lat: item?.lat ?? null,
    poiId: item?.poiId ?? null,
    time: item?.time ?? "",
    notes: item?.notes ?? "",
    suggestionId: item?.suggestionId ?? null,
    mode: (item?.transport?.mode ?? "") as TransportMode | "",
    minutes: item?.transport?.minutes?.toString() ?? "",
    tnote: item?.transport?.note ?? "",
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((cur) => ({ ...cur, [k]: v }));

  const unplanned = (suggestions ?? []).filter((s) => !s.inPlan && s.type !== "lodging").sort((a, b) => b.votes - a.votes);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const { mode, minutes, tnote, ...rest } = f;
      const payload = {
        ...rest,
        transport: mode ? { mode, minutes: minutes ? Number(minutes) : null, note: tnote || null } : null,
      };
      if (item) await api("PATCH", `${base}/plan/items/${item.id}`, payload);
      else await api("POST", `${base}/plan/items`, payload);
      onDone();
    });
  };

  const remove = () =>
    run(async () => {
      if (!confirm(`从行程中移除「${item!.title}」？`)) return;
      await api("DELETE", `${base}/plan/items/${item!.id}`);
      onDone();
    });

  return (
    <form onSubmit={submit} className="space-y-4">
      {!item && unplanned.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium">从建议中选</p>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {unplanned.map((s) => (
              <Chip
                key={s.id}
                active={f.suggestionId === s.id}
                onClick={() =>
                  setF((cur) => ({ ...cur, suggestionId: s.id, title: s.title, type: s.type, address: s.address, lng: s.lng, lat: s.lat, poiId: s.poiId }))
                }
              >
                {TYPE_LABEL[s.type].icon} {s.title} · {s.votes}♥
              </Chip>
            ))}
          </div>
        </div>
      )}
      <Field label="名称">
        <Input value={f.title} onChange={(e) => set("title", e.target.value)} required maxLength={100} />
      </Field>
      <div className="flex flex-wrap gap-2">
        {SUGGESTION_TYPES.filter((t) => t !== "lodging").map((t) => (
          <Chip key={t} active={f.type === t} onClick={() => set("type", t)}>
            {TYPE_LABEL[t].icon} {TYPE_LABEL[t].label}
          </Chip>
        ))}
      </div>
      <Field label="位置">
        <PlaceSearch
          query={f.title}
          value={f}
          onAddress={(address) => setF((c) => ({ ...c, address, lng: null, lat: null, poiId: null }))}
          onPick={(h) =>
            setF((c) => ({ ...c, title: c.title || h.name, address: [h.district, h.address].filter(Boolean).join("") || h.name, lng: h.lng, lat: h.lat, poiId: h.poiId }))
          }
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="参考时间">
          <Input type="time" value={f.time} onChange={(e) => set("time", e.target.value)} />
        </Field>
        <Field label="哪一天">
          <Select value={f.dayId} onChange={(e) => set("dayId", e.target.value)}>
            {days.map((d, i) => (
              <option key={d.id} value={d.id}>
                第 {i + 1} 天{d.title ? ` · ${d.title}` : ""}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="备注" hint="门票、预约号、营业时间等">
        <Textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} maxLength={2000} rows={2} />
      </Field>
      <fieldset className="space-y-2 rounded-xl border border-line p-3">
        <legend className="px-1 text-sm font-medium">从上一站怎么过来</legend>
        <div className="flex flex-wrap gap-2">
          <Chip active={!f.mode} onClick={() => set("mode", "")}>
            不填
          </Chip>
          {TRANSPORT_MODES.map((m) => (
            <Chip key={m} active={f.mode === m} onClick={() => set("mode", m)}>
              {TRANSPORT_LABEL[m].icon} {TRANSPORT_LABEL[m].label}
            </Chip>
          ))}
        </div>
        {f.mode && (
          <div className="grid grid-cols-[6rem_1fr] gap-2">
            <Input value={f.minutes} onChange={(e) => set("minutes", e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="分钟" />
            <Input value={f.tnote} onChange={(e) => set("tnote", e.target.value)} maxLength={200} placeholder="如：地铁 2 号线，D 口出" />
          </div>
        )}
      </fieldset>
      <ErrorText error={error} />
      <div className="flex gap-2">
        {item && (
          <Button type="button" variant="danger" onClick={remove} disabled={busy}>
            移除
          </Button>
        )}
        <Button className="flex-1" busy={busy}>
          {item ? "保存" : "加入行程"}
        </Button>
      </div>
    </form>
  );
}

export function LodgingEditor({ day, onDone }: { day: PlanDay; onDone: () => void }) {
  const { base } = useTrip();
  const { busy, error, run } = useAsync();
  const [f, setF] = useState<Lodging>(day.lodging ?? { name: "", address: null, lng: null, lat: null, poiId: null, note: null });

  const save = (lodging: Lodging | null) =>
    run(async () => {
      await api("PATCH", `${base}/plan/days/${day.id}`, { lodging });
      onDone();
    });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save(f);
      }}
      className="space-y-4"
    >
      <Field label="住宿名称">
        <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required maxLength={100} />
      </Field>
      <Field label="位置">
        <PlaceSearch
          query={f.name}
          value={{ address: f.address ?? null, lng: f.lng ?? null, lat: f.lat ?? null, poiId: f.poiId ?? null }}
          onAddress={(address) => setF({ ...f, address, lng: null, lat: null, poiId: null })}
          onPick={(h) => setF({ ...f, name: f.name || h.name, address: [h.district, h.address].filter(Boolean).join("") || h.name, lng: h.lng, lat: h.lat, poiId: h.poiId })}
        />
      </Field>
      <Field label="备注" hint="订单号、入住/退房时间、前台电话等">
        <Textarea value={f.note ?? ""} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={500} rows={2} />
      </Field>
      <ErrorText error={error} />
      <div className="flex gap-2">
        {day.lodging && (
          <Button type="button" variant="danger" onClick={() => save(null)} disabled={busy}>
            清除
          </Button>
        )}
        <Button className="flex-1" busy={busy}>
          保存
        </Button>
      </div>
    </form>
  );
}
