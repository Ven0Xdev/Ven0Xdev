/**
 * גישת דייר.
 *
 * כלל ברזל: דייר רואה אך ורק את הדירה שמשויכת אליו. הבדיקה נעשית בשאילתה
 * עצמה — הדירה נטענת עם תנאי `tenantUserId`, כך שדירה של דייר אחר פשוט
 * אינה קיימת מבחינת השאילתה.
 */

import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { getCurrentUser, type SessionUser } from "./session";

export interface TenantApartmentAccess {
  user: SessionUser;
  apartment: {
    id: string;
    number: string;
    projectId: string;
    apartmentTypeId: string | null;
    rooms: number | null;
  };
}

/**
 * מאמת שהמשתמש הוא הדייר של הדירה.
 * ללא apartmentId — מוחזרת הדירה היחידה שמשויכת אליו.
 */
export async function requireTenantApartment(
  apartmentId?: string,
): Promise<TenantApartmentAccess> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const apartment = await prisma.apartment.findFirst({
    where: {
      tenantUserId: user.id,
      ...(apartmentId ? { id: apartmentId } : {}),
    },
    select: {
      id: true,
      number: true,
      projectId: true,
      apartmentTypeId: true,
      apartmentType: { select: { rooms: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  if (!apartment) notFound();

  return {
    user,
    apartment: {
      id: apartment.id,
      number: apartment.number,
      projectId: apartment.projectId,
      apartmentTypeId: apartment.apartmentTypeId,
      rooms: apartment.apartmentType?.rooms ?? null,
    },
  };
}

/** האם למשתמש הנוכחי יש בכלל דירה בפורטל הדיירים */
export async function getTenantApartmentId(userId: string): Promise<string | null> {
  const apartment = await prisma.apartment.findFirst({
    where: { tenantUserId: userId },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  return apartment?.id ?? null;
}
