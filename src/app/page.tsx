"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, ErrorText, Field, Input, useAsync } from "@/components/ui";
import { api, rememberTrip, useKnownTrips } from "@/lib/client";

export default function Home() {
  const known = useKnownTrips();
  const trips = known ?? [];
  const [wantsCreate, setCreating] = useState(false);
  const creating = wantsCreate || known?.length === 0;

  return (
    <main className="mx-auto max-w-lg px-4 pb-16 pt-[max(2rem,env(safe-area-inset-top))]">
      <h1 className="text-2xl font-bold">一起去旅行 🧳</h1>
      <p className="mt-1 text-muted">和朋友一起定路线、看行程、存照片。</p>

      {trips.length > 0 && (
        <section className="mt-8 space-y-2">
          <h2 className="text-sm font-medium text-muted">我的旅行</h2>
          {trips.map((t) => (
            <Link key={t.id} href={`/t/${t.id}`} className="block">
              <Card className="flex items-center justify-between p-4 hover:border-accent">
                <span className="font-medium">{t.name}</span>
                <span className="text-muted">›</span>
              </Card>
            </Link>
          ))}
        </section>
      )}

      <section className="mt-8">
        {creating ? (
          <CreateTrip />
        ) : (
          <Button variant="secondary" className="w-full" onClick={() => setCreating(true)}>
            ＋ 发起新旅行
          </Button>
        )}
      </section>
      <p className="mt-6 text-center text-xs text-muted">想加入朋友的旅行？请打开对方发给你的邀请链接。</p>
    </main>
  );
}

function CreateTrip() {
  const router = useRouter();
  const { busy, error, run } = useAsync();
  const [f, setF] = useState({ name: "", destination: "", startDate: "", endDate: "", nickname: "", pin: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const { id } = await api<{ id: string }>("POST", "/api/trips", {
        ...f,
        destination: f.destination || null,
        startDate: f.startDate || null,
        endDate: f.endDate || null,
      });
      rememberTrip({ id, name: f.name });
      router.push(`/t/${id}/members?welcome=1`);
    });
  };

  return (
    <Card className="p-4">
      <form onSubmit={submit} className="space-y-4">
        <h2 className="text-lg font-semibold">发起新旅行</h2>
        <Field label="旅行名称">
          <Input value={f.name} onChange={set("name")} placeholder="如：国庆云南七日游" required maxLength={50} />
        </Field>
        <Field label="目的地" hint="用于搜索地点时优先匹配这个城市">
          <Input value={f.destination} onChange={set("destination")} placeholder="如：大理" maxLength={50} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="出发日期">
            <Input type="date" value={f.startDate} onChange={set("startDate")} />
          </Field>
          <Field label="返回日期">
            <Input type="date" value={f.endDate} min={f.startDate} onChange={set("endDate")} />
          </Field>
        </div>
        <hr className="border-line" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="你的昵称">
            <Input value={f.nickname} onChange={set("nickname")} required maxLength={20} />
          </Field>
          <Field label="4 位 PIN">
            <Input value={f.pin} onChange={set("pin")} inputMode="numeric" pattern="\d{4}" maxLength={4} required placeholder="••••" />
          </Field>
        </div>
        <p className="text-xs text-muted">换手机或清除浏览器数据后，用「昵称 + PIN」找回身份。请记住它。</p>
        <ErrorText error={error} />
        <Button className="w-full" busy={busy}>
          创建并获取邀请链接
        </Button>
      </form>
    </Card>
  );
}
