/**
 * יצירת מערכת שינויים (ChangeSet) משתי גרסאות תוכנית.
 *
 * זהו המסלול היחיד שבו נוצרים שינויים במערכת — גם בנתוני ההדגמה וגם
 * בהעלאת תוכנית אמיתית. המנוע מזהה בלבד; הוא אינו מאשר דבר.
 */

import { Prisma } from "@prisma/client";
import type { ConsultantKind } from "@prisma/client";

import { prisma } from "@/lib/db";
import { getDrawingProcessor } from "@/lib/drawing";
import type { DrawingDocument } from "@/lib/drawing/types";
import { evaluateRules } from "@/lib/rules/engine";
import type { RuleDefinition } from "@/lib/rules/types";
import { ruleConditionSchema } from "@/lib/rules/types";
import { recordActivity } from "./activity";

/** טוען את כללי המערכת של הארגון ואת כללי הפרויקט הפעילים */
export async function loadRules(
  organizationId: string,
  projectId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<RuleDefinition[]> {
  const [systemRules, projectRules] = await Promise.all([
    client.rule.findMany({ where: { organizationId } }),
    client.projectRule.findMany({ where: { projectId, isActive: true } }),
  ]);

  const parse = (condition: unknown) => {
    const result = ruleConditionSchema.safeParse(condition);
    return result.success ? result.data : null;
  };

  const definitions: RuleDefinition[] = [];

  for (const rule of systemRules) {
    const condition = parse(rule.condition);
    if (!condition) continue;
    definitions.push({
      key: rule.key,
      name: rule.name,
      description: rule.description,
      condition,
      effect: rule.effect,
      consultantKind: rule.consultantKind,
      severity: rule.severity,
      isSystem: true,
    });
  }

  for (const rule of projectRules) {
    const condition = parse(rule.condition);
    if (!condition) continue;
    definitions.push({
      key: rule.key,
      name: rule.name,
      description: rule.description,
      condition,
      effect: rule.effect,
      consultantKind: rule.consultantKind,
      severity: rule.severity,
      isSystem: false,
    });
  }

  return definitions;
}

export interface CreateChangeSetInput {
  apartmentId: string;
  baseVersionId: string;
  targetVersionId: string;
  /** תחילית קוד השינויים, למשל "CH-1" ייצר CH-101, CH-102 */
  codeStart?: number;
  userId?: string | null;
  /** מועד ההשוואה בפועל — משמש בנתוני הדגמה כדי לשמור על ציר זמן אמין */
  occurredAt?: Date;
}

export async function createChangeSetFromVersions(input: CreateChangeSetInput) {
  const apartment = await prisma.apartment.findUniqueOrThrow({
    where: { id: input.apartmentId },
    include: { project: { select: { id: true, organizationId: true } } },
  });

  const [baseVersion, targetVersion] = await Promise.all([
    prisma.planVersion.findUniqueOrThrow({ where: { id: input.baseVersionId } }),
    prisma.planVersion.findUniqueOrThrow({ where: { id: input.targetVersionId } }),
  ]);

  const baseDocument = baseVersion.elements as unknown as DrawingDocument;
  const targetDocument = targetVersion.elements as unknown as DrawingDocument;

  const processor = getDrawingProcessor();
  const startedAt = Date.now();
  const detected = await processor.comparePlans(baseDocument, targetDocument);
  const durationMs = Date.now() - startedAt;

  const rules = await loadRules(apartment.project.organizationId, apartment.projectId);

  const categories = await prisma.changeCategory.findMany({
    where: { projectId: apartment.projectId },
  });
  const categoryByKey = new Map(categories.map((category) => [category.key, category.id]));

  const occurredAt = input.occurredAt ?? new Date();

  const changeSet = await prisma.changeSet.create({
    data: {
      createdAt: occurredAt,
      apartmentId: apartment.id,
      baseVersionId: baseVersion.id,
      targetVersionId: targetVersion.id,
      status: "IN_REVIEW",
      detectedCount: detected.length,
      summary: `נמצאו ${detected.length} שינויים מול תוכנית הסטנדרט`,
    },
  });

  const codeStart = input.codeStart ?? 101;

  for (const [index, change] of detected.entries()) {
    const element = change.after ?? change.before;
    const evaluation = evaluateRules(rules, {
      categoryKey: change.categoryKey,
      changeType: change.type,
      elementType: change.elementType,
      elementTag: (element?.metadata?.tag as string | undefined) ?? null,
      structural: Boolean(element?.metadata?.structural),
      confidence: change.confidence,
      distanceCm: change.distanceCm ?? null,
      roomLabel: change.roomLabel ?? null,
      occurredAt: new Date(),
    });

    const item = await prisma.changeItem.create({
      data: {
        changeSetId: changeSet.id,
        categoryId: categoryByKey.get(change.categoryKey) ?? null,
        code: `CH-${codeStart + index}`,
        type: change.type,
        categoryKey: change.categoryKey,
        // כל שינוי נכנס כ"ממתין לבדיקה". רק אדם מורשה מעביר אותו הלאה.
        status: "DETECTED",
        elementType: change.elementType,
        elementId: change.elementId,
        roomLabel: change.roomLabel ?? null,
        description: change.description,
        quantity: change.quantity,
        unit: change.unit,
        confidence: change.confidence,
        requiresConsultant: evaluation.requiresConsultant,
        consultantKind: (evaluation.consultantKind as ConsultantKind | null) ?? null,
        blockedFromAutomation: evaluation.blockedFromAutomation,
        geometryBefore: change.before
          ? (change.before as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        geometryAfter: change.after
          ? (change.after as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });

    if (evaluation.hits.length > 0) {
      await prisma.changeItemRuleHit.createMany({
        data: evaluation.hits.map((hit) => ({
          changeItemId: item.id,
          ruleKey: hit.ruleKey,
          message: hit.message,
          severity: hit.severity,
        })),
        skipDuplicates: true,
      });
    }
  }

  const averageConfidence =
    detected.length > 0
      ? detected.reduce((sum, change) => sum + change.confidence, 0) / detected.length
      : 0;

  await prisma.aIAnalysis.create({
    data: {
      createdAt: occurredAt,
      planVersionId: targetVersion.id,
      changeSetId: changeSet.id,
      engine: processor.engine,
      engineVersion: processor.engineVersion,
      durationMs,
      itemCount: detected.length,
      averageConfidence,
    },
  });

  await recordActivity({
    organizationId: apartment.project.organizationId,
    projectId: apartment.projectId,
    apartmentId: apartment.id,
    userId: input.userId ?? null,
    kind: "ANALYSIS_COMPLETED",
    message: `הושלמה השוואה בין גרסה ${baseVersion.versionNo} לגרסה ${targetVersion.versionNo} — נמצאו ${detected.length} שינויים`,
    metadata: { changeSetId: changeSet.id, detected: detected.length },
    occurredAt,
  });

  return { changeSet, detectedCount: detected.length };
}
