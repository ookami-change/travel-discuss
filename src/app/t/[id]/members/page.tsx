"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useTrip } from "@/components/trip-context";
import { Avatar, Button, Card, ErrorText, Field, Input, PageHeader, useAsync } from "@/components/ui";
import { BASE_PATH, api, forgetTrip, useOrigin } from "@/lib/client";

export default function MembersPage() {
  return (
    <Suspense>
      <Members />
    </Suspense>
  );
}

function Members() {
  const { base, href, me, members, trip } = useTrip();
  const router = useRouter();
  const welcome = useSearchParams().get("welcome") === "1";
  const link = `${useOrigin()}${BASE_PATH}/join/${trip.inviteCode}`;
  const [copied, setCopied] = useState(false);
  const { busy, error, run } = useAsync();

  async function share() {
    const text = `一起规划「${trip.name}」吧！打开链接加入：${link}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: trip.name, text, url: link });
        return;
      } catch {
        /* cancelled — fall through to copy */
      }
    }
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const kick = (id: string, name: string) =>
    run(async () => {
      if (!confirm(`把 ${name} 移出旅行？TA 贡献的内容会保留。如果不想让 TA 用新昵称重新加入，请同时重置邀请链接。`)) return;
      await api("DELETE", `${base}/members/${id}`);
    });
  const reset = () =>
    run(async () => {
      if (!confirm("重置后旧链接立即失效（已加入的成员不受影响）。继续？")) return;
      await api("POST", `${base}/invite`);
    });
  const logout = () =>
    run(async () => {
      if (!confirm("退出后需要用「昵称 + PIN」重新找回身份。继续？")) return;
      await api("POST", `${base}/logout`);
      forgetTrip(trip.id);
      router.replace("/");
    });

  return (
    <>
      <PageHeader title="成员与邀请" back={welcome ? undefined : href("/more")} />
      {welcome && (
        <Card className="mb-4 border-accent bg-accent-soft p-4">
          <p className="font-semibold">🎉 旅行创建好了！</p>
          <p className="mt-1 text-sm">把下面的邀请链接发到群里，朋友点开填个昵称就能加入。</p>
        </Card>
      )}
      <Card className="mb-4 space-y-3 p-4">
        <p className="font-semibold">邀请链接</p>
        <p className="break-all rounded-xl bg-bg p-3 text-sm">{link}</p>
        <div className="flex gap-2">
          <Button className="flex-1" onClick={share}>
            {copied ? "已复制 ✓" : "分享 / 复制链接"}
          </Button>
          {me.isAdmin && (
            <Button variant="secondary" onClick={reset} disabled={busy}>
              重置
            </Button>
          )}
        </div>
        <p className="text-xs text-muted">拿到链接的人都能加入，请只发给同行的朋友。</p>
      </Card>

      <Card className="mb-4 divide-y divide-line">
        {members.map((m) => (
          <div key={m.id} className="flex items-center gap-3 p-3">
            <Avatar name={m.nickname} size={32} />
            <span className="flex-1">
              {m.nickname}
              {m.id === me.id && <span className="ml-1 text-sm text-muted">（我）</span>}
              {m.isAdmin && <span className="ml-2 rounded bg-accent-soft px-1.5 text-xs text-accent">创建者</span>}
            </span>
            {me.isAdmin && m.id !== me.id && (
              <button onClick={() => kick(m.id, m.nickname)} className="text-sm text-muted hover:text-danger" disabled={busy}>
                移出
              </button>
            )}
          </div>
        ))}
      </Card>
      <ErrorText error={error} />

      {me.isAdmin && <TripSettings />}

      {welcome ? (
        <Button className="mt-4 w-full" onClick={() => router.replace(href("/ideas"))}>
          开始提建议 ›
        </Button>
      ) : (
        <button onClick={logout} className="mt-6 block w-full text-center text-sm text-muted">
          在这台设备上退出
        </button>
      )}
    </>
  );
}

function TripSettings() {
  const { base, trip } = useTrip();
  const [f, setF] = useState({ name: trip.name, destination: trip.destination ?? "", startDate: trip.startDate ?? "", endDate: trip.endDate ?? "" });
  const { busy, error, run } = useAsync();
  const [saved, setSaved] = useState(false);
  return (
    <Card className="p-4">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            await api("PATCH", base, { name: f.name, destination: f.destination || null, startDate: f.startDate || null, endDate: f.endDate || null });
            setSaved(true);
          });
        }}
      >
        <p className="font-semibold">旅行设置</p>
        <Field label="名称">
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required maxLength={50} />
        </Field>
        <Field label="目的地">
          <Input value={f.destination} onChange={(e) => setF({ ...f, destination: e.target.value })} maxLength={50} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="出发">
            <Input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} />
          </Field>
          <Field label="返回">
            <Input type="date" value={f.endDate} min={f.startDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} />
          </Field>
        </div>
        <p className="text-xs text-muted">改日期不会自动增删计划里的天数，请到「计划」页调整。</p>
        <ErrorText error={error} />
        <Button className="w-full" variant="secondary" busy={busy}>
          {saved ? "已保存 ✓" : "保存"}
        </Button>
      </form>
    </Card>
  );
}
