"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useRef, useState } from "react";
import { AttachSelect, MediaViewer, parseAttach } from "@/components/media-viewer";
import { useTrip } from "@/components/trip-context";
import { Button, Chip, Empty, Field, PageHeader, Sheet } from "@/components/ui";
import { useApi } from "@/lib/client";
import { progress } from "@/lib/itinerary";
import { uploadMedia } from "@/lib/upload";
import type { MediaItem, PlanDay } from "@/lib/types";

export default function MediaPage() {
  return (
    <Suspense>
      <Album />
    </Suspense>
  );
}

type Group = { key: string; title: string; subtitle?: string; items: MediaItem[] };

function Album() {
  const { base } = useTrip();
  const params = useSearchParams();
  const router = useRouter();
  const { data: media, mutate } = useApi<MediaItem[]>(`${base}/media`);
  const { data: days } = useApi<PlanDay[]>(`${base}/plan`);
  const [dayFilter, setDayFilter] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ list: MediaItem[]; index: number } | null>(null);
  const uploadOpen = params.get("upload") === "1";

  const groups = useMemo(() => {
    if (!media || !days) return [];
    const out: Group[] = [];
    days.forEach((d, di) => {
      if (dayFilter && dayFilter !== d.id) return;
      for (const it of d.items) {
        const items = media.filter((m) => m.itemId === it.id);
        if (items.length) out.push({ key: it.id, title: it.title, subtitle: `第 ${di + 1} 天`, items });
      }
      const loose = media.filter((m) => !m.itemId && m.dayId === d.id);
      if (loose.length) out.push({ key: d.id, title: `第 ${di + 1} 天`, subtitle: d.title ?? undefined, items: loose });
    });
    if (!dayFilter) {
      const known = new Set(out.flatMap((g) => g.items.map((m) => m.id)));
      const rest = media.filter((m) => !known.has(m.id));
      if (rest.length) out.push({ key: "trip", title: "整个旅行", items: rest });
    }
    return out;
  }, [media, days, dayFilter]);

  const closeUpload = () => router.replace("?", { scroll: false });

  return (
    <>
      <PageHeader
        title="相册"
        action={
          <Button size="sm" onClick={() => router.replace(`?upload=1`, { scroll: false })}>
            ＋ 上传
          </Button>
        }
      />
      {days && days.length > 1 && (
        <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
          <Chip active={!dayFilter} onClick={() => setDayFilter(null)}>
            全部
          </Chip>
          {days.map((d, i) => (
            <Chip key={d.id} active={dayFilter === d.id} onClick={() => setDayFilter(d.id)}>
              第 {i + 1} 天
            </Chip>
          ))}
        </div>
      )}
      {media && groups.length === 0 && (
        <Empty icon="📷" title="还没有照片">
          旅途中或回来后，把照片和视频传到对应的地点吧。
        </Empty>
      )}
      <div className="space-y-6">
        {groups.map((g) => (
          <section key={g.key}>
            <h2 className="mb-2 font-semibold">
              {g.title}
              {g.subtitle && <span className="ml-2 text-sm font-normal text-muted">{g.subtitle}</span>}
            </h2>
            <div className="grid grid-cols-3 gap-1 sm:grid-cols-4">
              {g.items.map((m, i) => (
                <button key={m.id} onClick={() => setViewing({ list: g.items, index: i })} className="relative aspect-square overflow-hidden rounded-lg bg-line">
                  {m.thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.thumbUrl} alt={m.caption ?? ""} loading="lazy" className="h-full w-full object-cover" />
                  ) : m.kind === "photo" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.url} alt={m.caption ?? ""} loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full items-center justify-center text-3xl">🎬</span>
                  )}
                  {m.kind === "video" && <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-xs text-white">▶</span>}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      <Sheet open={uploadOpen} onClose={closeUpload} title="上传照片/视频">
        {days && <Uploader days={days} initialItem={params.get("itemId")} onDone={() => mutate()} />}
      </Sheet>
      {viewing && days && (
        <MediaViewer
          list={viewing.list}
          index={viewing.index}
          days={days}
          onIndex={(index) => setViewing({ ...viewing, index })}
          onClose={() => setViewing(null)}
          onChanged={() => mutate()}
        />
      )}
    </>
  );
}

type Job = { name: string; progress: number; error?: string; done?: boolean };

function Uploader({ days, initialItem, onDone }: { days: PlanDay[]; initialItem: string | null; onDone: () => void }) {
  const { base } = useTrip();
  // Default to the explicitly requested stop, else wherever the group currently is.
  const current = progress(days).current?.item.id;
  const [attach, setAttach] = useState(initialItem ? `item:${initialItem}` : current ? `item:${current}` : "");
  const [jobs, setJobs] = useState<Job[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const running = jobs.some((j) => !j.done && !j.error);

  async function start(files: FileList) {
    const list = Array.from(files);
    const offset = jobs.length;
    setJobs((j) => [...j, ...list.map((f) => ({ name: f.name, progress: 0 }))]);
    const update = (i: number, patch: Partial<Job>) => setJobs((j) => j.map((x, k) => (k === offset + i ? { ...x, ...patch } : x)));
    // Two at a time: fast enough on wifi without starving a phone's uplink.
    let next = 0;
    const worker = async () => {
      while (next < list.length) {
        const i = next++;
        try {
          await uploadMedia(base, list[i], parseAttach(attach), (p) => update(i, { progress: p }));
          update(i, { progress: 1, done: true });
          onDone();
        } catch (e) {
          update(i, { error: (e as Error).message });
        }
      }
    };
    await Promise.all([worker(), worker()]);
  }

  return (
    <div className="space-y-4">
      <Field label="放到哪里">
        <AttachSelect days={days} value={attach} onChange={setAttach} />
      </Field>
      <input
        ref={input}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) start(e.target.files);
          e.target.value = "";
        }}
      />
      <Button className="w-full" onClick={() => input.current?.click()}>
        选择照片/视频
      </Button>
      <p className="text-xs text-muted">照片单张不超过 20MB，视频单个不超过 200MB。原图保存，可随时下载。</p>
      {jobs.length > 0 && (
        <ul className="space-y-2">
          {jobs.map((j, i) => (
            <li key={i} className="text-sm">
              <div className="flex justify-between gap-2">
                <span className="truncate">{j.name}</span>
                <span className={j.error ? "text-danger" : "text-muted"}>{j.error ?? (j.done ? "✓" : `${Math.round(j.progress * 100)}%`)}</span>
              </div>
              {!j.error && (
                <div className="mt-1 h-1 overflow-hidden rounded bg-line">
                  <div className="h-full bg-accent" style={{ width: `${j.progress * 100}%` }} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {running && <p className="text-xs text-warn">上传中请不要关闭页面</p>}
    </div>
  );
}
