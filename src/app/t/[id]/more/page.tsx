"use client";

import Link from "next/link";
import { useTrip } from "@/components/trip-context";
import { Card, PageHeader } from "@/components/ui";

export default function MorePage() {
  const { href } = useTrip();
  const links = [
    { to: "/chat", icon: "💬", label: "讨论区", desc: "不针对某个地点的闲聊和商量" },
    { to: "/expenses", icon: "💰", label: "记账", desc: "记录谁付了什么" },
    { to: "/members", icon: "👥", label: "成员与邀请", desc: "邀请链接、成员管理、旅行设置" },
    { to: "/history", icon: "🕘", label: "历史版本与动态", desc: "谁改了什么，恢复旧版行程" },
    { to: "/print", icon: "🖨️", label: "打印/导出行程单", desc: "用浏览器打印或存为 PDF" },
  ];
  return (
    <>
      <PageHeader title="更多" />
      <Card className="divide-y divide-line">
        {links.map((l) => (
          <Link key={l.to} href={href(l.to)} className="flex items-center gap-3 p-4 hover:bg-bg">
            <span className="text-2xl">{l.icon}</span>
            <span className="flex-1">
              <span className="block font-medium">{l.label}</span>
              <span className="block text-sm text-muted">{l.desc}</span>
            </span>
            <span className="text-muted">›</span>
          </Link>
        ))}
      </Card>
      <Link href="/" className="mt-6 block text-center text-sm text-muted">
        切换到其他旅行
      </Link>
    </>
  );
}
