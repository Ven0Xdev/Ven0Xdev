"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export async function markAllNotificationsRead() {
  const user = await requireUser();
  await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/", "layout");
}

export async function markNotificationRead(notificationId: string) {
  const user = await requireUser();
  await prisma.notification.updateMany({
    where: { id: notificationId, userId: user.id },
    data: { readAt: new Date() },
  });
  revalidatePath("/", "layout");
}
