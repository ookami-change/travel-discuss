import type { PlanSnapshot } from "@/db/schema";
import { dayDate } from "@/lib/itinerary";
import { TRANSPORT_LABEL, TYPE_LABEL, formatDate, formatMinutes } from "@/lib/labels";

/** Read-only rendering of a plan snapshot (AI drafts, saved versions). */
export function SnapshotView({ snapshot, startDate }: { snapshot: PlanSnapshot; startDate: string | null }) {
  return (
    <ol className="space-y-4">
      {snapshot.days.map((d, i) => (
        <li key={i}>
          <p className="font-medium">
            第 {i + 1} 天{dayDate(startDate, i) && <span className="text-muted"> · {formatDate(dayDate(startDate, i))}</span>}
            {d.title && ` · ${d.title}`}
          </p>
          <ul className="mt-1 space-y-1 border-l-2 border-line pl-3 text-sm">
            {d.items.map((it, j) => (
              <li key={j}>
                {it.transport && (
                  <span className="block text-xs text-muted">
                    {TRANSPORT_LABEL[it.transport.mode]?.icon} {TRANSPORT_LABEL[it.transport.mode]?.label} {formatMinutes(it.transport.minutes)}
                  </span>
                )}
                {it.time && <span className="mr-1 text-muted">{it.time}</span>}
                {TYPE_LABEL[it.type]?.icon} {it.title}
                {it.notes && <span className="block text-xs text-muted">{it.notes}</span>}
              </li>
            ))}
            {d.items.length === 0 && <li className="text-muted">（空）</li>}
            {d.lodging && <li className="text-muted">🏨 {d.lodging.name}</li>}
          </ul>
        </li>
      ))}
    </ol>
  );
}
