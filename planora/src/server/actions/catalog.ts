"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireProjectAccess } from "@/lib/auth/session";
import { recordActivity } from "@/server/services/activity";
import type { ActionResult } from "./changes";

const availabilitySchema = z.object({
  projectId: z.string().min(1),
  productId: z.string().min(1),
  available: z.boolean(),
  includedInStandard: z.boolean(),
  upgradePrice: z.number().min(0).max(1000000),
  requiresApproval: z.boolean(),
  requiresConsultant: z.boolean(),
});

/**
 * קביעת זמינות מוצר בפרויקט.
 *
 * זו נקודת השליטה של הקבלן: מוצר שאינו זמין כאן לא יוצג לאף דייר בפרויקט,
 * גם אם הוא קיים בקטלוג של הספק.
 */
export async function setProductAvailability(input: {
  projectId: string;
  productId: string;
  available: boolean;
  includedInStandard: boolean;
  upgradePrice: number;
  requiresApproval: boolean;
  requiresConsultant: boolean;
}): Promise<ActionResult> {
  const parsed = availabilitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "הערכים שהוזנו אינם תקינים." };

  const { user, organizationId } = await requireProjectAccess(
    parsed.data.projectId,
    "availability:manage",
  );

  const product = await prisma.catalogProduct.findUnique({
    where: { id: parsed.data.productId },
    include: { supplier: { select: { organizationId: true, name: true } } },
  });

  if (!product) return { ok: false, message: "המוצר לא נמצא." };

  // ספק של ארגון אחר אינו זמין לפרויקט הזה
  if (product.supplier.organizationId !== organizationId) {
    return { ok: false, message: "המוצר שייך לארגון אחר." };
  }

  await prisma.projectProductAvailability.upsert({
    where: {
      projectId_productId: {
        projectId: parsed.data.projectId,
        productId: parsed.data.productId,
      },
    },
    create: {
      projectId: parsed.data.projectId,
      productId: parsed.data.productId,
      available: parsed.data.available,
      includedInStandard: parsed.data.includedInStandard,
      upgradePrice: parsed.data.upgradePrice,
      requiresApproval: parsed.data.requiresApproval,
      requiresConsultant: parsed.data.requiresConsultant,
    },
    update: {
      available: parsed.data.available,
      includedInStandard: parsed.data.includedInStandard,
      upgradePrice: parsed.data.upgradePrice,
      requiresApproval: parsed.data.requiresApproval,
      requiresConsultant: parsed.data.requiresConsultant,
    },
  });

  await recordActivity({
    organizationId,
    projectId: parsed.data.projectId,
    userId: user.id,
    kind: "NOTE_ADDED",
    message: `${user.name} עדכנה את זמינות המוצר ${product.name} בפרויקט`,
    metadata: { productId: product.id, available: parsed.data.available },
  });

  revalidatePath(`/projects/${parsed.data.projectId}`);
  revalidatePath("/tenant", "layout");
  return { ok: true, message: "הזמינות עודכנה." };
}

/** חיבור או ניתוק ספק מפרויקט */
export async function setProjectSupplier(input: {
  projectId: string;
  supplierId: string;
  active: boolean;
}): Promise<ActionResult> {
  const schema = z.object({
    projectId: z.string().min(1),
    supplierId: z.string().min(1),
    active: z.boolean(),
  });
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "הפרטים אינם תקינים." };

  const { user, organizationId } = await requireProjectAccess(
    parsed.data.projectId,
    "availability:manage",
  );

  const supplier = await prisma.supplier.findUnique({
    where: { id: parsed.data.supplierId },
    select: { organizationId: true, name: true },
  });

  if (!supplier || supplier.organizationId !== organizationId) {
    return { ok: false, message: "הספק אינו זמין לארגון שלך." };
  }

  await prisma.projectSupplier.upsert({
    where: {
      projectId_supplierId: {
        projectId: parsed.data.projectId,
        supplierId: parsed.data.supplierId,
      },
    },
    create: {
      projectId: parsed.data.projectId,
      supplierId: parsed.data.supplierId,
      active: parsed.data.active,
    },
    update: { active: parsed.data.active },
  });

  // ניתוק ספק מסיר את מוצריו מהאפשרויות של הדיירים
  if (!parsed.data.active) {
    await prisma.projectProductAvailability.updateMany({
      where: {
        projectId: parsed.data.projectId,
        product: { supplierId: parsed.data.supplierId },
      },
      data: { available: false },
    });
  }

  await recordActivity({
    organizationId,
    projectId: parsed.data.projectId,
    userId: user.id,
    kind: "NOTE_ADDED",
    message: `${user.name} ${parsed.data.active ? "חיברה" : "ניתקה"} את הספק ${supplier.name} ${parsed.data.active ? "לפרויקט" : "מהפרויקט"}`,
  });

  revalidatePath(`/projects/${parsed.data.projectId}`);
  revalidatePath("/tenant", "layout");
  return {
    ok: true,
    message: parsed.data.active ? "הספק חובר לפרויקט." : "הספק נותק מהפרויקט.",
  };
}
