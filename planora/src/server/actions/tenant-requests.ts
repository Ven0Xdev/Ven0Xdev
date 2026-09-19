"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireTenantApartment } from "@/lib/auth/tenant";
import { routeChangeRequest } from "@/lib/rules/routing";
import { notifyRole, recordActivity } from "@/server/services/activity";
import type { ActionResult } from "./changes";

const CHANGE_CATEGORIES = [
  "ELECTRICAL",
  "WALL",
  "KITCHEN",
  "PLUMBING",
  "HVAC",
  "LIGHTING",
  "OTHER",
] as const;

const SUPPLIER_CATEGORIES = [
  "KITCHEN",
  "FLOORING",
  "SANITARY",
  "DOORS",
  "LIGHTING",
  "HVAC",
  "WINDOWS",
  "OUTDOOR",
  "FURNITURE",
  "APPLIANCES",
  "OTHER",
] as const;

const changeRequestSchema = z.object({
  category: z.enum(CHANGE_CATEGORIES),
  title: z.string().min(3).max(120),
  description: z.string().min(5).max(2000),
});

/**
 * בקשת שינוי של דייר.
 *
 * הבקשה אינה מאושרת ואינה מתומחרת אוטומטית — היא מנותבת לגורם המקצועי
 * לפי הקטגוריה, והמערכת מציינת מראש אם צפוי להידרש אישור יועץ.
 */
export async function submitChangeRequest(input: {
  category: (typeof CHANGE_CATEGORIES)[number];
  title: string;
  description: string;
}): Promise<ActionResult> {
  const parsed = changeRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "יש למלא כותרת ותיאור לבקשה." };
  }

  const { user, apartment } = await requireTenantApartment();

  const full = await prisma.apartment.findUniqueOrThrow({
    where: { id: apartment.id },
    include: { project: { select: { organizationId: true } } },
  });

  const routing = routeChangeRequest(parsed.data.category);
  const count = await prisma.changeRequest.count({ where: { apartmentId: apartment.id } });

  const request = await prisma.changeRequest.create({
    data: {
      apartmentId: apartment.id,
      tenantId: user.id,
      code: `TR-${apartment.number}${String(count + 1).padStart(2, "0")}`,
      category: parsed.data.category,
      title: parsed.data.title.trim(),
      description: parsed.data.description.trim(),
      status: "SUBMITTED",
      routedToRole: routing.role,
      consultantKind: routing.consultantKind,
      submittedAt: new Date(),
    },
  });

  await recordActivity({
    organizationId: full.project.organizationId,
    projectId: apartment.projectId,
    apartmentId: apartment.id,
    userId: user.id,
    kind: "NOTE_ADDED",
    message: `התקבלה בקשת שינוי מהדייר (${request.code}): ${request.title}`,
    metadata: { changeRequestId: request.id },
  });

  await notifyRole({
    organizationId: full.project.organizationId,
    roles: ["TENANT_CHANGE_MANAGER"],
    apartmentId: apartment.id,
    kind: "REVIEW_REQUIRED",
    title: `בקשת שינוי חדשה — דירה ${apartment.number}`,
    body: request.title,
    href: `/projects/${apartment.projectId}/apartments/${apartment.id}?tab=requests`,
  });

  revalidatePath("/tenant", "layout");
  return { ok: true, message: `${routing.explanation} מספר הבקשה: ${request.code}` };
}

const exceptionSchema = z.object({
  category: z.enum(SUPPLIER_CATEGORIES),
  title: z.string().min(3).max(120),
  description: z.string().min(5).max(2000),
  referenceUrl: z.string().url().optional().or(z.literal("")),
});

/**
 * בקשה לאפשרות שאינה בקטלוג.
 *
 * הבקשה אינה מוסיפה מוצר למערכת. היא נפתחת כפנייה שמנהלת שינויי הדיירים
 * מטפלת בה מול הספק.
 */
export async function submitExceptionRequest(input: {
  category: (typeof SUPPLIER_CATEGORIES)[number];
  title: string;
  description: string;
  referenceUrl?: string;
}): Promise<ActionResult> {
  const parsed = exceptionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "יש למלא כותרת ותיאור לבקשה." };
  }

  const { user, apartment } = await requireTenantApartment();

  const full = await prisma.apartment.findUniqueOrThrow({
    where: { id: apartment.id },
    include: { project: { select: { organizationId: true } } },
  });

  const count = await prisma.exceptionRequest.count({ where: { apartmentId: apartment.id } });

  const request = await prisma.exceptionRequest.create({
    data: {
      apartmentId: apartment.id,
      tenantId: user.id,
      code: `EX-${apartment.number}${String(count + 1).padStart(2, "0")}`,
      category: parsed.data.category,
      title: parsed.data.title.trim(),
      description: parsed.data.description.trim(),
      referenceUrl: parsed.data.referenceUrl || null,
      status: "SUBMITTED",
    },
  });

  await recordActivity({
    organizationId: full.project.organizationId,
    projectId: apartment.projectId,
    apartmentId: apartment.id,
    userId: user.id,
    kind: "NOTE_ADDED",
    message: `התקבלה בקשה לאפשרות חריגה (${request.code}): ${request.title}`,
    metadata: { exceptionRequestId: request.id },
  });

  await notifyRole({
    organizationId: full.project.organizationId,
    roles: ["TENANT_CHANGE_MANAGER"],
    apartmentId: apartment.id,
    kind: "REVIEW_REQUIRED",
    title: `בקשה לאפשרות חריגה — דירה ${apartment.number}`,
    body: request.title,
    href: `/projects/${apartment.projectId}/apartments/${apartment.id}?tab=requests`,
  });

  revalidatePath("/tenant", "layout");
  return {
    ok: true,
    message: `הבקשה נקלטה (${request.code}). מנהלת שינויי הדיירים תבדוק אותה מול הספק.`,
  };
}
