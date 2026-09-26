"use client";

import { useMemo, useState } from "react";
import { ItemForm, LodgingForm } from "@/components/item-editor";
import { useTrip } from "@/components/trip-context";
import { Button, Chip, ErrorText, Input } from "@/components/ui";
import type { PlanSnapshot } from "@/db/schema";
import { dayDate } from "@/lib/itinerary";
import { TRANSPORT_LABEL, TYPE_LABEL, formatDate, formatMinutes } from "@/lib/labels";
import {
  diffPlan,
  hasChanges,
  moveItem,
  putItem,
  removeDay,
  removeItem,
  restoreDay,
  restoreItem,
  setDay,
  type DayDiff,
  type Row,
} from "@/lib/plan-diff";
import type { Draft, SnapshotItem } from "@/lib/types";

type Editing = { kind: "item"; day: number; index: number | null } | { kind: "lodging"; day: number } | { kind: "title"; day: number };

const ROW_STYLE: Record<Row["kind"], string> = {
  added: "border-l-emerald-500 bg-emerald-500/8",
  changed: "border-l-amber-500 bg-amber-500/8",
  removed: "border-l-danger bg-danger/5",
  same: "border-l-transparent",
};

const BADGE: Record<Exclude<Row["kind"], "same">, { label: string; cls: string }> = {
  added: { label: "新增", cls: "bg-emerald-600 text-white" },
  changed: { label: "修改", cls: "bg-amber-500 text-white" },
  removed: { label: "删除", cls: "bg-danger text-white" },
};

/**
 * Shows an AI draft against the live plan: what gets added, changed or dropped. Each change can
 * be reverted, and any detail edited, before someone adopts the result.
 */
export function DraftReview({
  draft,
  current,
  busy,
  error,
  onSave,
  onApply,
  onDiscard,
}: {
  draft: Draft & { snapshot: PlanSnapshot };
  current: PlanSnapshot;
  busy: boolean;
  error: unknown;
  onSave: (next: PlanSnapshot) => void;
  onApply: (counts: { added: number; removed: number; changed: number }) => void;
  onDiscard: () => void;
}) {
  const { trip, nameOf } = useTrip();
  const [onlyChanges, setOnlyChanges] = useState(true);
  const [editing, setEditing] = useState<Editing | null>(null);
  const snap = draft.snapshot;
  const diff = useMemo(() => diffPlan(current, snap), [current, snap]);
  const { added, removed, changed } = diff.counts;
  const total = added + removed + changed + diff.days.filter((d) => d.at === null || d.from === null || d.title.changed || d.lodging.changed).length;

  const save = (next: PlanSnapshot) => {
    setEditing(null);
    onSave(next);
  };

  if (editing) {
    const back = (
      <button className="mb-3 text-sm text-accent" onClick={() => setEditing(null)}>
        ‹ 返回方案
      </button>
    );
    const day = snap.days[editing.day];
    if (editing.kind === "item") {
      const item = editing.index === null ? undefined : day.items[editing.index];
      return (
        <div>
          {back}
          <ItemForm
            key={`${editing.day}-${editing.index}`}
            item={item}
            days={snap.days.map((d, i) => ({ value: String(i), label: `第 ${i + 1} 天${d.title ? ` · ${d.title}` : ""}` }))}
            day={String(editing.day)}
            submitLabel={item ? "改好了" : "加进方案"}
            onSubmit={(values, to) => save(putItem(snap, editing.day, editing.index, { ...values, id: item?.id }, Number(to)))}
            onRemove={item ? () => save(removeItem(snap, editing.day, editing.index!)) : undefined}
            removeLabel="从方案中去掉"
          />
        </div>
      );
    }
    if (editing.kind === "lodging") {
      return (
        <div>
          {back}
          <LodgingForm lodging={day.lodging} onSave={(lodging) => save(setDay(snap, editing.day, { lodging }))} />
        </div>
      );
    }
    return (
      <div>
        {back}
        <TitleForm title={day.title} onSave={(title) => save(setDay(snap, editing.day, { title }))} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-xl bg-card p-3 text-sm">
        {draft.instructions && (
          <p className="text-muted">
            {draft.mode === "adjust" ? "调整要求" : "额外要求"}：{draft.instructions}
          </p>
        )}
        {draft.summary && <p>{draft.summary}</p>}
        {draft.editedBy && <p className="text-xs text-muted">✏️ {nameOf(draft.editedBy)} 手动调整过这份方案</p>}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {total === 0 ? (
          <span className="text-muted">和当前计划完全一样</span>
        ) : (
          <>
            {added > 0 && <span className="text-emerald-600">＋{added} 新增</span>}
            {changed > 0 && <span className="text-amber-600">～{changed} 修改</span>}
            {removed > 0 && <span className="text-danger">－{removed} 删除</span>}
          </>
        )}
        <span className="flex-1" />
        <Chip active={onlyChanges} onClick={() => setOnlyChanges(true)}>
          只看改动
        </Chip>
        <Chip active={!onlyChanges} onClick={() => setOnlyChanges(false)}>
          完整方案
        </Chip>
      </div>
      <p className="text-xs text-muted">对比的是当前计划。点任意一项可以直接修改；不想要的改动可以单独还原。</p>

      <ol className="space-y-4">
        {diff.days.map((d) =>
          onlyChanges && !hasChanges(d) ? null : (
            <DayBlock
              key={d.at === null ? `old-${d.from}` : `new-${d.at}`}
              d={d}
              snap={snap}
              current={current}
              startDate={trip.startDate}
              onlyChanges={onlyChanges}
              busy={busy}
              onSave={save}
              onEdit={setEditing}
            />
          ),
        )}
        {onlyChanges && total === 0 && <li className="py-6 text-center text-sm text-muted">没有改动</li>}
      </ol>

      <ErrorText error={error} />
      <div className="sticky bottom-0 flex gap-2 bg-bg pt-2">
        <Button variant="secondary" onClick={onDiscard} disabled={busy}>
          放弃
        </Button>
        <Button className="flex-1" onClick={() => onApply(diff.counts)} busy={busy} disabled={total === 0}>
          采纳这份方案
        </Button>
      </div>
    </div>
  );
}

function DayBlock({
  d,
  snap,
  current,
  startDate,
  onlyChanges,
  busy,
  onSave,
  onEdit,
}: {
  d: DayDiff;
  snap: PlanSnapshot;
  current: PlanSnapshot;
  startDate: string | null;
  onlyChanges: boolean;
  busy: boolean;
  onSave: (next: PlanSnapshot) => void;
  onEdit: (e: Editing) => void;
}) {
  const at = d.at;
  const dropped = at === null;
  const index = at ?? d.from!;
  const date = dayDate(startDate, index);
  const hidden = d.rows.filter((r) => r.kind === "same").length;

  return (
    <li className={`overflow-hidden rounded-2xl border ${dropped ? "border-danger/40" : d.from === null ? "border-emerald-500/50" : "border-line"} bg-card`}>
      <div className="flex items-start gap-2 border-b border-line px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            <span className="font-semibold">{dropped ? `原第 ${index + 1} 天` : `第 ${index + 1} 天`}</span>
            {date && !dropped && <span className="ml-1.5 text-muted">{formatDate(date)}</span>}
            {dropped && <Badge kind="removed" label="整天删除" />}
            {d.from === null && <Badge kind="added" label="新的一天" />}
            {d.from !== null && !dropped && d.from !== at && <span className="ml-1.5 text-xs text-muted">（原第 {d.from + 1} 天）</span>}
          </p>
          {dropped ? (
            <p className="text-sm text-muted line-through">{d.title.before || "（无主题）"}</p>
          ) : (
            <button className="block text-left text-sm" onClick={() => onEdit({ kind: "title", day: at })}>
              {d.title.changed && d.title.before && <span className="mr-1.5 text-muted line-through">{d.title.before}</span>}
              <span className={d.title.changed ? "text-amber-600" : "text-muted"}>{d.title.after || "（无主题）"}</span>
              <span className="ml-1 text-xs text-muted">✎</span>
            </button>
          )}
        </div>
        {dropped ? (
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => onSave(restoreDay(snap, current, d.from!))}>
            保留这一天
          </Button>
        ) : (
          <>
            {d.from !== null && d.title.changed && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => onSave(setDay(snap, at, { title: d.title.before }))}>
                还原主题
              </Button>
            )}
            {d.from === null && snap.days.length > 1 && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => onSave(removeDay(snap, at))}>
                不要这天
              </Button>
            )}
          </>
        )}
      </div>

      <ul>
        {d.rows.map((r, i) =>
          onlyChanges && r.kind === "same" ? null : (
            <RowView key={i} r={r} day={at} snap={snap} current={current} full={!onlyChanges} busy={busy} onSave={onSave} onEdit={onEdit} />
          ),
        )}
        {onlyChanges && hidden > 0 && <li className="px-3 py-2 text-xs text-muted">…另有 {hidden} 项没变</li>}
        {d.rows.length === 0 && <li className="px-3 py-2 text-sm text-muted">（这一天没有安排）</li>}
      </ul>

      {!dropped && (
        <div className="flex items-center gap-2 border-t border-line bg-bg/40 px-3 py-2 text-sm">
          <button className="min-w-0 flex-1 text-left" onClick={() => onEdit({ kind: "lodging", day: at })}>
            🏨 {d.lodging.changed && d.lodging.before && <span className="mr-1.5 text-muted line-through">{d.lodging.before.name}</span>}
            <span className={d.lodging.changed ? "text-amber-600" : ""}>{d.lodging.after?.name ?? <span className="text-muted">未定住宿</span>}</span>
          </button>
          {d.from !== null && d.lodging.changed && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => onSave(setDay(snap, at, { lodging: d.lodging.before }))}>
              还原
            </Button>
          )}
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => onEdit({ kind: "item", day: at, index: null })}>
            ＋ 加一项
          </Button>
        </div>
      )}
    </li>
  );
}

function RowView({
  r,
  day,
  snap,
  current,
  full,
  busy,
  onSave,
  onEdit,
}: {
  r: Row;
  day: number | null;
  snap: PlanSnapshot;
  current: PlanSnapshot;
  full: boolean;
  busy: boolean;
  onSave: (next: PlanSnapshot) => void;
  onEdit: (e: Editing) => void;
}) {
  const shown = r.kind === "removed" ? r.before : r.item;
  const at = r.kind === "removed" ? null : r.at;
  const count = day === null ? 0 : snap.days[day].items.length;

  let action: React.ReactNode = null;
  if (r.kind === "removed") {
    action = (
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => onSave(restoreItem(snap, current, r.fromDay, r.fromIndex))}>
        保留
      </Button>
    );
  } else if (r.kind === "added") {
    action = (
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => onSave(removeItem(snap, day!, r.at))}>
        不要
      </Button>
    );
  } else if (r.kind === "changed") {
    // Revert fields, and send it back to its old day if the draft moved it.
    const home = r.movedFrom === null ? day! : snap.days.findIndex((x) => x.id && x.id === current.days[r.movedFrom!].id);
    action = (
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => onSave(putItem(snap, day!, r.at, structuredClone(r.before), home < 0 ? day! : home))}>
        还原
      </Button>
    );
  }

  return (
    <li className={`flex items-start gap-1 border-b border-l-4 border-b-line px-2 py-2 last:border-b-0 ${ROW_STYLE[r.kind]}`}>
      <button
        className="min-w-0 flex-1 px-1 text-left text-sm"
        disabled={r.kind === "removed"}
        onClick={() => at !== null && day !== null && onEdit({ kind: "item", day, index: at })}
      >
        <ItemLine item={shown} struck={r.kind === "removed"} />
        {r.kind !== "same" && (
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
            <Badge kind={r.kind} />
            {r.kind === "changed" && r.movedFrom !== null && <span className="text-amber-700 dark:text-amber-400">从第 {r.movedFrom + 1} 天移来</span>}
          </span>
        )}
        {r.kind === "changed" &&
          r.changes.map((c) => (
            <span key={c.label} className="mt-0.5 block text-xs">
              <span className="text-muted">{c.label}：</span>
              {c.before && <span className="text-muted line-through">{c.before}</span>}
              {c.before && " → "}
              <span className="text-amber-700 dark:text-amber-400">{c.after || "（清空）"}</span>
            </span>
          ))}
      </button>
      {action}
      {full && at !== null && day !== null && (
        <span className="flex shrink-0 flex-col">
          <button disabled={busy || at === 0} onClick={() => onSave(moveItem(snap, day, at, -1))} className="px-1.5 text-xs text-muted disabled:opacity-20" aria-label="上移">
            ▲
          </button>
          <button disabled={busy || at === count - 1} onClick={() => onSave(moveItem(snap, day, at, 1))} className="px-1.5 text-xs text-muted disabled:opacity-20" aria-label="下移">
            ▼
          </button>
        </span>
      )}
    </li>
  );
}

function ItemLine({ item, struck }: { item: SnapshotItem; struck?: boolean }) {
  return (
    <>
      {item.transport && (
        <span className="block text-xs text-muted">
          {TRANSPORT_LABEL[item.transport.mode]?.icon} {TRANSPORT_LABEL[item.transport.mode]?.label} {formatMinutes(item.transport.minutes)}
        </span>
      )}
      <span className={struck ? "text-muted line-through" : ""}>
        {item.time && <span className="mr-1 text-muted">{item.time}</span>}
        {TYPE_LABEL[item.type]?.icon} {item.title}
      </span>
      {item.notes && <span className="block line-clamp-2 text-xs text-muted">{item.notes}</span>}
    </>
  );
}

function Badge({ kind, label }: { kind: Exclude<Row["kind"], "same">; label?: string }) {
  return <span className={`ml-1.5 inline-block rounded px-1.5 text-[11px] leading-5 first:ml-0 ${BADGE[kind].cls}`}>{label ?? BADGE[kind].label}</span>;
}

function TitleForm({ title, onSave }: { title: string | null; onSave: (title: string | null) => void }) {
  const [v, setV] = useState(title ?? "");
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(v.trim() || null);
      }}
    >
      <Input value={v} onChange={(e) => setV(e.target.value)} placeholder="当天主题，如：古城漫步" maxLength={100} className="flex-1" autoFocus />
      <Button>好了</Button>
    </form>
  );
}
