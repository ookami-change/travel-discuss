"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card, Chip, ErrorText, Field, Input, useAsync } from "@/components/ui";
import { api, rememberTrip, useApi } from "@/lib/client";
import { formatDate } from "@/lib/labels";

type Invite = {
  trip: { id: string; name: string; destination: string | null; startDate: string | null; endDate: string | null };
  members: string[];
  alreadyMember: boolean;
};

export default function JoinPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const { data, error: loadError } = useApi<Invite>(`/api/invite/${code}`);
  const [mode, setMode] = useState<"join" | "recover">("join");
  const [nickname, setNickname] = useState("");
  const [pin, setPin] = useState("");
  const { busy, error, run } = useAsync();

  useEffect(() => {
    if (data?.alreadyMember) {
      rememberTrip({ id: data.trip.id, name: data.trip.name, inviteCode: code });
      router.replace(`/t/${data.trip.id}`);
    }
  }, [data, code, router]);

  if (loadError) return <p className="p-8 text-center text-muted">{loadError.message}</p>;
  if (!data) return <p className="p-8 text-center text-muted">加载中…</p>;
  const { trip } = data;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      await api("POST", `/api/invite/${code}/${mode}`, { nickname, pin });
      rememberTrip({ id: trip.id, name: trip.name, inviteCode: code });
      router.replace(`/t/${trip.id}`);
    });
  };

  return (
    <main className="mx-auto max-w-md px-4 pt-[max(2.5rem,env(safe-area-inset-top))]">
      <p className="text-sm text-muted">你被邀请加入</p>
      <h1 className="mt-1 text-2xl font-bold">{trip.name}</h1>
      <p className="mt-1 text-muted">
        {[trip.destination, trip.startDate && `${formatDate(trip.startDate)} 出发`].filter(Boolean).join(" · ")}
      </p>
      {data.members.length > 0 && <p className="mt-2 text-sm text-muted">已加入：{data.members.join("、")}</p>}

      <Card className="mt-6 p-4">
        <div className="mb-4 flex gap-2">
          <Chip active={mode === "join"} onClick={() => setMode("join")}>
            第一次加入
          </Chip>
          <Chip active={mode === "recover"} onClick={() => setMode("recover")}>
            我加入过，找回身份
          </Chip>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <Field label="昵称">
            <Input value={nickname} onChange={(e) => setNickname(e.target.value)} required maxLength={20} autoFocus />
          </Field>
          <Field label="4 位 PIN" hint={mode === "join" ? "换设备时用来找回身份，请记住" : "加入时设置的 PIN"}>
            <Input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              required
              placeholder="••••"
            />
          </Field>
          <ErrorText error={error} />
          <Button className="w-full" busy={busy}>
            {mode === "join" ? "加入旅行" : "找回身份"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
