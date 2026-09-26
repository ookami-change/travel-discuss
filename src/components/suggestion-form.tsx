"use client";

import { useState } from "react";
import { PlaceSearch } from "@/components/place-search";
import { useTrip } from "@/components/trip-context";
import { Button, Chip, ErrorText, Field, Input, Textarea, useAsync } from "@/components/ui";
import { SUGGESTION_TYPES } from "@/lib/constants";
import { api } from "@/lib/client";
import { TYPE_LABEL } from "@/lib/labels";
import type { Suggestion } from "@/lib/types";

export function SuggestionForm({ initial, onDone }: { initial?: Suggestion; onDone: () => void }) {
  const { base } = useTrip();
  const { busy, error, run } = useAsync();
  const [f, setF] = useState({
    title: initial?.title ?? "",
    type: initial?.type ?? "sight",
    reason: initial?.reason ?? "",
    links: (initial?.links ?? []).join("\n"),
    address: initial?.address ?? null,
    lng: initial?.lng ?? null,
    lat: initial?.lat ?? null,
    poiId: initial?.poiId ?? null,
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const payload = {
        ...f,
        links: f.links
          .split(/\s+/)
          .map((s) => s.trim())
          .filter(Boolean),
      };
      if (initial) await api("PATCH", `${base}/suggestions/${initial.id}`, payload);
      else await api("POST", `${base}/suggestions`, payload);
      onDone();
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {SUGGESTION_TYPES.map((t) => (
          <Chip key={t} active={f.type === t} onClick={() => setF({ ...f, type: t })}>
            {TYPE_LABEL[t].icon} {TYPE_LABEL[t].label}
          </Chip>
        ))}
      </div>
      <Field label="名称">
        <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required maxLength={100} placeholder="如：洱海骑行" />
      </Field>
      <Field label="位置">
        <PlaceSearch
          query={f.title}
          value={f}
          onAddress={(address) => setF({ ...f, address, lng: null, lat: null, poiId: null })}
          onPick={(h) => setF({ ...f, title: f.title || h.name, address: [h.district, h.address].filter(Boolean).join("") || h.name, lng: h.lng, lat: h.lat, poiId: h.poiId })}
        />
      </Field>
      <Field label="推荐理由">
        <Textarea value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} maxLength={2000} placeholder="为什么想去？需要注意什么？" />
      </Field>
      <Field label="参考链接" hint="每行一个，可贴小红书、大众点评等链接">
        <Textarea value={f.links} onChange={(e) => setF({ ...f, links: e.target.value })} rows={2} placeholder="https://" />
      </Field>
      <ErrorText error={error} />
      <Button className="w-full" busy={busy}>
        {initial ? "保存" : "提交建议"}
      </Button>
    </form>
  );
}
