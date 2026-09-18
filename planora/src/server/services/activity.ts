import type { ActivityKind, NotificationKind, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * יומן פעילות. כל פעולה משמעותית במערכת נרשמת כאן ואינה נמחקת.
 */
export async function recordActivity(
  input: {
    organizationId: string;
    projectId?: string | null;
    apartmentId?: string | null;
    userId?: string | null;
    kind: ActivityKind;
    message: string;
    metadata?: Prisma.InputJsonValue;
    /** מועד הפעולה. ברירת המחדל היא עכשיו. */
    occurredAt?: Date;
  },
  client: Prisma.TransactionClient | typeof prisma = prisma,
) {
  return client.activityLog.create({
    data: {
      organizationId: input.organizationId,
      projectId: input.projectId ?? null,
      apartmentId: input.apartmentId ?? null,
      userId: input.userId ?? null,
      kind: input.kind,
      message: input.message,
      metadata: input.metadata,
      ...(input.occurredAt ? { createdAt: input.occurredAt } : {}),
    },
  });
}

export async function notify(
  input: {
    organizationId: string;
    userId: string;
    apartmentId?: string | null;
    kind: NotificationKind;
    title: string;
    body?: string;
    href?: string;
  },
  client: Prisma.TransactionClient | typeof prisma = prisma,
) {
  return client.notification.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId,
      apartmentId: input.apartmentId ?? null,
      kind: input.kind,
      title: input.title,
      body: input.body,
      href: input.href,
    },
  });
}

/** התראה לכל בעלי תפקיד מסוים בארגון */
export async function notifyRole(input: {
  organizationId: string;
  roles: Array<"TENANT_CHANGE_MANAGER" | "PROJECT_MANAGER" | "PRICING_MANAGER">;
  apartmentId?: string | null;
  kind: NotificationKind;
  title: string;
  body?: string;
  href?: string;
}) {
  const members = await prisma.organizationMember.findMany({
    where: { organizationId: input.organizationId, role: { in: input.roles }, isActive: true },
    select: { userId: true },
  });

  if (members.length === 0) return;

  await prisma.notification.createMany({
    data: members.map((member) => ({
      organizationId: input.organizationId,
      userId: member.userId,
      apartmentId: input.apartmentId ?? null,
      kind: input.kind,
      title: input.title,
      body: input.body,
      href: input.href,
    })),
  });
}
