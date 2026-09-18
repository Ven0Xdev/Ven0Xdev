"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { CircleCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { releaseForExecution } from "@/server/actions/review";

export function ReleaseForExecutionButton({
  apartmentId,
  disabled,
}: {
  apartmentId: string;
  disabled?: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant="success"
      disabled={isPending || disabled}
      onClick={() =>
        startTransition(async () => {
          const result = await releaseForExecution(apartmentId);
          if (result.ok) toast.success(result.message);
          else toast.error(result.message);
        })
      }
    >
      <CircleCheck />
      אשר לביצוע
    </Button>
  );
}
