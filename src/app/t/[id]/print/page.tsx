"use client";

import Link from "next/link";
import { useTrip } from "@/components/trip-context";
import { Button } from "@/components/ui";
import { useApi } from "@/lib/client";
import { dayDate } from "@/lib/itinerary";
import { TRANSPORT_LABEL, formatDate, formatMinutes } from "@/lib/labels";
import type { PlanDay } from "@/lib/types";

export default function PrintPage() {
  const { base, href, trip, members } = useTrip();
  const { data: days } = useApi<PlanDay[]>(`${base}/plan`);

  return (
    <div className="mx-auto max-w-3xl bg-white p-6 text-black print:p-0">
      <div className="no-print mb-6 flex gap-2">
        <Link href={href("/more")}>
          <Button variant="secondary">‹ 返回</Button>
        </Link>
        <Button onClick={() => window.print()}>打印 / 存为 PDF</Button>
      </div>
      <h1 className="text-2xl font-bold">{trip.name}</h1>
      <p className="mt-1 text-sm text-gray-600">
        {[trip.destination, trip.startDate && `${formatDate(trip.startDate)}${trip.endDate ? ` – ${formatDate(trip.endDate)}` : ""}`, `${members.length} 人：${members.map((m) => m.nickname).join("、")}`]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {days?.map((d, i) => (
        <section key={d.id} className="mt-6 break-inside-avoid">
          <h2 className="border-b-2 border-black pb-1 text-lg font-semibold">
            第 {i + 1} 天{dayDate(trip.startDate, i) && ` · ${formatDate(dayDate(trip.startDate, i))}`}
            {d.title && ` · ${d.title}`}
          </h2>
          <table className="mt-2 w-full text-sm">
            <tbody>
              {d.items.map((it) => (
                <tr key={it.id} className="border-b border-gray-200 align-top">
                  <td className="w-14 py-1.5 text-gray-600">{it.time}</td>
                  <td className="py-1.5">
                    {it.transport && (
                      <div className="text-xs text-gray-500">
                        ↓ {TRANSPORT_LABEL[it.transport.mode].label} {formatMinutes(it.transport.minutes)} {it.transport.note}
                      </div>
                    )}
                    <div className="font-medium">{it.title}</div>
                    {it.address && <div className="text-xs text-gray-600">{it.address}</div>}
                    {it.notes && <div className="whitespace-pre-wrap text-xs text-gray-600">{it.notes}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {d.lodging && (
            <p className="mt-2 text-sm">
              🏨 住宿：<b>{d.lodging.name}</b>
              {d.lodging.address && ` · ${d.lodging.address}`}
              {d.lodging.note && <span className="block whitespace-pre-wrap text-xs text-gray-600">{d.lodging.note}</span>}
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
