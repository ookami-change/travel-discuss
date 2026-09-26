import type { SuggestionType, TransportMode } from "@/lib/constants";

export const TYPE_LABEL: Record<SuggestionType, { label: string; icon: string }> = {
  sight: { label: "景点", icon: "🏞️" },
  food: { label: "吃喝", icon: "🍜" },
  lodging: { label: "住宿", icon: "🏨" },
  transport: { label: "交通", icon: "🚉" },
  activity: { label: "活动", icon: "🎟️" },
  other: { label: "其他", icon: "📌" },
};

export const TRANSPORT_LABEL: Record<TransportMode, { label: string; icon: string }> = {
  walk: { label: "步行", icon: "🚶" },
  metro: { label: "地铁", icon: "🚇" },
  bus: { label: "公交", icon: "🚌" },
  taxi: { label: "打车", icon: "🚕" },
  drive: { label: "自驾", icon: "🚗" },
  train: { label: "火车/高铁", icon: "🚄" },
  flight: { label: "飞机", icon: "✈️" },
  boat: { label: "船", icon: "⛴️" },
  other: { label: "其他", icon: "➡️" },
};

export function formatMinutes(m: number | null | undefined) {
  if (!m) return "";
  if (m < 60) return `${m} 分钟`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} 小时 ${m % 60} 分` : `${h} 小时`;
}

const WEEK = "日一二三四五六";
export function formatDate(d: string | null) {
  if (!d) return "";
  const [y, m, day] = d.split("-").map(Number);
  const w = new Date(y, m - 1, day).getDay();
  return `${m}月${day}日 周${WEEK[w]}`;
}

export function timeAgo(iso: string | Date) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "刚刚";
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} 天前`;
  return new Date(iso).toLocaleDateString("zh-CN");
}

export const yuan = (cents: number) => `¥${(cents / 100).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
