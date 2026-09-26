"use client";

import { useEffect, useState } from "react";
import { useTrip } from "@/components/trip-context";
import { Button, ErrorText, Field, Input, Select, useAsync } from "@/components/ui";
import { api } from "@/lib/client";
import { timeAgo } from "@/lib/labels";
import type { MediaItem, PlanDay } from "@/lib/types";

export function AttachSelect({ days, value, onChange }: { days: PlanDay[]; value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">整个旅行（不指定地点）</option>
      {days.map((d, i) => (
        <optgroup key={d.id} label={`第 ${i + 1} 天${d.title ? ` · ${d.title}` : ""}`}>
          <option value={`day:${d.id}`}>第 {i + 1} 天（不指定地点）</option>
          {d.items.map((it) => (
            <option key={it.id} value={`item:${it.id}`}>
              {it.title}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}

export const attachValue = (m: { itemId: string | null; dayId: string | null }) => (m.itemId ? `item:${m.itemId}` : m.dayId ? `day:${m.dayId}` : "");
export const parseAttach = (v: string) => ({
  itemId: v.startsWith("item:") ? v.slice(5) : null,
  dayId: v.startsWith("day:") ? v.slice(4) : null,
});

export function MediaViewer({ list, index, days, onIndex, onClose, onChanged }: {
  list: MediaItem[];
  index: number;
  days: PlanDay[];
  onIndex: (i: number) => void;
  onClose: () => void;
  onChanged: () => void;
}) {
  const m = list[index];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
      if (e.key === "ArrowRight" && index < list.length - 1) onIndex(index + 1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [index, list.length, onClose, onIndex]);

  if (!m) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white" role="dialog" aria-modal>
      <div className="flex items-center justify-between p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <span className="text-sm opacity-80">
          {index + 1} / {list.length}
        </span>
        <button onClick={onClose} className="h-10 w-10 text-2xl" aria-label="关闭">
          ×
        </button>
      </div>
      {/* Keyed so per-file state (edit form, broken preview) resets when paging. */}
      <Slide key={m.id} m={m} days={days} onChanged={onChanged} onClose={onClose}>
        {index > 0 && (
          <button onClick={() => onIndex(index - 1)} className="absolute left-0 top-1/2 h-16 w-12 -translate-y-1/2 text-3xl opacity-70" aria-label="上一张">
            ‹
          </button>
        )}
        {index < list.length - 1 && (
          <button onClick={() => onIndex(index + 1)} className="absolute right-0 top-1/2 h-16 w-12 -translate-y-1/2 text-3xl opacity-70" aria-label="下一张">
            ›
          </button>
        )}
      </Slide>
    </div>
  );
}

function Slide({ m, days, onChanged, onClose, children }: { m: MediaItem; days: PlanDay[]; onChanged: () => void; onClose: () => void; children: React.ReactNode }) {
  const { base, me } = useTrip();
  const [broken, setBroken] = useState(false);
  const [editing, setEditing] = useState(false);
  const [caption, setCaption] = useState(m.caption ?? "");
  const [attach, setAttach] = useState(attachValue(m));
  const { busy, error, run } = useAsync();
  const mine = m.uploaderId === me.id || me.isAdmin;
  const place = days.flatMap((d) => d.items).find((i) => i.id === m.itemId)?.title;

  const save = () =>
    run(async () => {
      await api("PATCH", `${base}/media/${m.id}`, { caption, ...parseAttach(attach) });
      setEditing(false);
      onChanged();
    });
  const remove = () =>
    run(async () => {
      if (!confirm("删除后无法恢复，确定删除？")) return;
      await api("DELETE", `${base}/media/${m.id}`);
      onChanged();
      onClose();
    });

  return (
    <>
      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        {broken ? (
          <div className="p-8 text-center">
            <p>这个文件在当前浏览器里无法预览</p>
            <a href={m.downloadUrl} className="mt-3 inline-block rounded-xl bg-white/15 px-4 py-2">
              下载查看
            </a>
          </div>
        ) : m.kind === "photo" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={m.url} alt={m.caption ?? ""} className="max-h-full max-w-full object-contain" onError={() => setBroken(true)} />
        ) : (
          <video src={m.url} controls playsInline className="max-h-full max-w-full" poster={m.thumbUrl ?? undefined} onError={() => setBroken(true)} />
        )}
        {children}
      </div>
      <div className="space-y-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-sm">
        {editing ? (
          <div className="space-y-3 rounded-2xl bg-bg p-3 text-fg">
            <Field label="说明">
              <Input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={500} />
            </Field>
            <Field label="归属">
              <AttachSelect days={days} value={attach} onChange={setAttach} />
            </Field>
            <ErrorText error={error} />
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setEditing(false)}>
                取消
              </Button>
              <Button className="flex-1" busy={busy} onClick={save}>
                保存
              </Button>
            </div>
          </div>
        ) : (
          <>
            {m.caption && <p>{m.caption}</p>}
            <p className="opacity-70">
              {m.uploader} · {timeAgo(m.createdAt)}
              {place && ` · 📍 ${place}`}
            </p>
            <div className="flex gap-4 opacity-90">
              <a href={m.downloadUrl}>下载原图</a>
              {mine && <button onClick={() => setEditing(true)}>编辑</button>}
              {mine && (
                <button onClick={remove} className="text-red-300">
                  删除
                </button>
              )}
            </div>
            <ErrorText error={error} />
          </>
        )}
      </div>
    </>
  );
}
