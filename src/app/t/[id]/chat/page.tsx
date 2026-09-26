"use client";

import { Thread } from "@/components/thread";
import { useTrip } from "@/components/trip-context";
import { PageHeader } from "@/components/ui";

export default function ChatPage() {
  const { href } = useTrip();
  return (
    <>
      <PageHeader title="讨论区" back={href("/more")} />
      <Thread suggestionId={null} autoScroll />
    </>
  );
}
