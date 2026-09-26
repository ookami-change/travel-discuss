"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { TripProvider } from "@/components/trip-context";
import { Button } from "@/components/ui";
import { forgetTrip, offlineSnapshotTime, rememberTrip, useApi, useLiveUpdates } from "@/lib/client";
import type { TripInfo } from "@/lib/types";

const TABS = [
  { href: "", label: "行程", icon: "🧭" },
  { href: "/ideas", label: "建议", icon: "💡" },
  { href: "/plan", label: "计划", icon: "🗓️" },
  { href: "/media", label: "相册", icon: "📷" },
  { href: "/more", label: "更多", icon: "⋯" },
];

export default function TripLayout({ children }: { children: ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const url = `/api/trips/${id}`;
  const { data, error } = useApi<TripInfo>(url);
  useLiveUpdates(id);

  const status = (error as { status?: number } | undefined)?.status;
  useEffect(() => {
    if (data) rememberTrip({ id, name: data.trip.name, inviteCode: data.trip.inviteCode });
    else if (status === 401 || status === 404) forgetTrip(id);
  }, [data, id, status]);

  if (error && !data) {
    return (
      <main className="mx-auto max-w-md p-8 text-center">
        <p className="text-4xl">🔒</p>
        <p className="mt-3 font-medium">{error.message}</p>
        <p className="mt-2 text-sm text-muted">如果你之前加入过，请重新打开邀请链接，选择「找回身份」。</p>
        <Link href="/">
          <Button variant="secondary" className="mt-6">
            回到首页
          </Button>
        </Link>
      </main>
    );
  }
  if (!data) return <p className="p-8 text-center text-muted">加载中…</p>;

  const base = `/t/${id}`;
  const active = (href: string) => (href === "" ? pathname === base : pathname.startsWith(base + href));
  const offline = offlineSnapshotTime(url);
  const fullBleed = pathname.endsWith("/print");

  return (
    <TripProvider value={data}>
      {offline && (
        <div className="no-print sticky top-0 z-30 bg-warn-soft px-4 py-1.5 text-center text-xs text-warn">
          离线快照 · 更新于 {new Date(offline).toLocaleString("zh-CN")} · 联网后自动刷新
        </div>
      )}
      <main className={fullBleed ? "" : "mx-auto max-w-2xl px-4 pb-[calc(5rem+env(safe-area-inset-bottom))]"}>{children}</main>
      {!fullBleed && (
        <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
          <div className="mx-auto flex max-w-2xl">
            {TABS.map((t) => (
              <Link
                key={t.href}
                href={base + t.href}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${active(t.href) ? "text-accent" : "text-muted"}`}
              >
                <span className="text-lg leading-none">{t.icon}</span>
                {t.label}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </TripProvider>
  );
}
