"use client";

import { useEffect, useRef, useState } from "react";
import { useTrip } from "@/components/trip-context";
import { Avatar, Button, ErrorText, Textarea, useAsync } from "@/components/ui";
import { api, useApi } from "@/lib/client";
import { timeAgo } from "@/lib/labels";
import type { Comment } from "@/lib/types";

/** Comment thread for a suggestion, or the trip-wide discussion when suggestionId is null. */
export function Thread({ suggestionId, autoScroll }: { suggestionId: string | null; autoScroll?: boolean }) {
  const { base, me, nameOf } = useTrip();
  const url = `${base}/comments${suggestionId ? `?suggestionId=${suggestionId}` : ""}`;
  const { data, mutate } = useApi<Comment[]>(url);
  const [text, setText] = useState("");
  const { busy, error, run } = useAsync();
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll) end.current?.scrollIntoView({ block: "end" });
  }, [data?.length, autoScroll]);

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    run(async () => {
      await api("POST", `${base}/comments`, { body: text, suggestionId });
      setText("");
      mutate();
    });
  };

  const remove = async (c: Comment) => {
    if (!confirm("删除这条评论？")) return;
    await api("DELETE", `${base}/comments/${c.id}`);
    mutate();
  };

  return (
    <div>
      <ul className="space-y-3">
        {data?.length === 0 && <li className="py-4 text-center text-sm text-muted">还没有人说话</li>}
        {data?.map((c) => (
          <li key={c.id} className="flex gap-2">
            <Avatar name={nameOf(c.authorId)} />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted">
                <span className="font-medium text-fg">{nameOf(c.authorId)}</span> · {timeAgo(c.createdAt)}
                {(c.authorId === me.id || me.isAdmin) && (
                  <button onClick={() => remove(c)} className="ml-2 text-muted hover:text-danger">
                    删除
                  </button>
                )}
              </p>
              <p className="mt-0.5 whitespace-pre-wrap break-words">{c.body}</p>
            </div>
          </li>
        ))}
      </ul>
      <div ref={end} />
      <form onSubmit={send} className="mt-4 flex items-end gap-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={1}
          maxLength={2000}
          placeholder="说点什么…"
          className="min-h-11 flex-1 resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(e);
          }}
        />
        <Button busy={busy} disabled={!text.trim()}>
          发送
        </Button>
      </form>
      <ErrorText error={error} />
    </div>
  );
}
