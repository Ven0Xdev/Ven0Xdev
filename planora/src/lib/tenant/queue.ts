/**
 * תורי העבודה של הקבלן ומנהלת שינויי הדיירים.
 * מגדיר מי "מחזיק את הכדור" בכל דירה.
 */

import type { ApartmentStatus } from "@prisma/client";

export const WORK_QUEUES = {
  WAITING_FOR_ME: "ממתין לי",
  WAITING_FOR_TENANT: "ממתין לדייר",
  WAITING_FOR_CONSULTANT: "ממתין ליועץ",
  WAITING_FOR_PRICING: "ממתין לתמחור",
  READY_FOR_EXECUTION: "מוכן לביצוע",
} as const;

export type WorkQueue = keyof typeof WORK_QUEUES;

const QUEUE_BY_STATUS: Partial<Record<ApartmentStatus, WorkQueue>> = {
  AWAITING_REVIEW: "WAITING_FOR_ME",
  NEEDS_CORRECTION: "WAITING_FOR_ME",
  AWAITING_CONSULTANT: "WAITING_FOR_CONSULTANT",
  AWAITING_PRICING: "WAITING_FOR_PRICING",
  AWAITING_TENANT_APPROVAL: "WAITING_FOR_TENANT",
  AWAITING_PAYMENT: "WAITING_FOR_TENANT",
  APPROVED_FOR_EXECUTION: "READY_FOR_EXECUTION",
};

export function queueOf(status: ApartmentStatus): WorkQueue | null {
  return QUEUE_BY_STATUS[status] ?? null;
}

export function matchesQueue(status: ApartmentStatus, queue: WorkQueue): boolean {
  return queueOf(status) === queue;
}

/** הסטטוסים שמשויכים לכל תור — לשימוש בשאילתות */
export const STATUSES_BY_QUEUE: Record<WorkQueue, ApartmentStatus[]> = {
  WAITING_FOR_ME: ["AWAITING_REVIEW", "NEEDS_CORRECTION"],
  WAITING_FOR_TENANT: ["AWAITING_TENANT_APPROVAL", "AWAITING_PAYMENT"],
  WAITING_FOR_CONSULTANT: ["AWAITING_CONSULTANT"],
  WAITING_FOR_PRICING: ["AWAITING_PRICING"],
  READY_FOR_EXECUTION: ["APPROVED_FOR_EXECUTION"],
};
