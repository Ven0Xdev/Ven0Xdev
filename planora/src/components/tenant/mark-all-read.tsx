"use client";

import { useTransition } from "react";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { markAllNotificationsRead } from "@/server/actions/notifications";

export function MarkAllReadButton() {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={isPending}
      onClick={() => startTransition(() => void markAllNotificationsRead())}
    >
      <Check />
      סימון הכל כנקרא
    </Button>
  );
}
