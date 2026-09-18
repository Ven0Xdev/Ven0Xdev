/**
 * הרשאות לפי תפקיד.
 *
 * כלל ברזל: הבדיקה נעשית בצד השרת. הסתרת כפתור ב-UI אינה מנגנון אבטחה.
 * בנוסף — סמכות מקצועית אינה ניתנת להאצלה: רק תפקיד מתאים יכול להעביר שינוי
 * למצב מאושר מקצועית.
 */

import type { UserRole } from "@prisma/client";

export const CAPABILITIES = [
  "organization:manage",
  "project:manage",
  "project:view",
  "apartment:manage",
  "plan:upload",
  "review:perform",
  "change:decide",
  "change:comment",
  "change:sendToConsultant",
  "consultant:respond",
  "pricing:manage",
  "pricing:approve",
  "payment:record",
  "execution:release",
  "rules:manage",
  "priceBook:manage",
  "learning:view",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

const ALL: Capability[] = [...CAPABILITIES];

export const ROLE_CAPABILITIES: Record<UserRole, Capability[]> = {
  SUPER_ADMIN: ALL,
  ORGANIZATION_ADMIN: ALL,
  PROJECT_MANAGER: [
    "project:manage",
    "project:view",
    "apartment:manage",
    "plan:upload",
    "review:perform",
    "change:decide",
    "change:comment",
    "change:sendToConsultant",
    "pricing:manage",
    "pricing:approve",
    "execution:release",
    "rules:manage",
    "priceBook:manage",
    "learning:view",
  ],
  TENANT_CHANGE_MANAGER: [
    "project:view",
    "apartment:manage",
    "plan:upload",
    "review:perform",
    "change:decide",
    "change:comment",
    "change:sendToConsultant",
    "pricing:manage",
    "execution:release",
    "rules:manage",
    "priceBook:manage",
    "learning:view",
  ],
  TENANT_CHANGE_COORDINATOR: [
    "project:view",
    "plan:upload",
    "review:perform",
    "change:comment",
    "change:sendToConsultant",
    "learning:view",
  ],
  ARCHITECT: ["project:view", "plan:upload", "change:comment", "consultant:respond"],
  DESIGNER: ["project:view", "plan:upload", "change:comment"],
  BIM_MANAGER: ["project:view", "plan:upload", "change:comment"],
  HVAC_CONSULTANT: ["project:view", "change:comment", "consultant:respond"],
  PLUMBING_CONSULTANT: ["project:view", "change:comment", "consultant:respond"],
  ELECTRICAL_CONSULTANT: ["project:view", "change:comment", "consultant:respond"],
  STRUCTURAL_CONSULTANT: ["project:view", "change:comment", "consultant:respond"],
  PRICING_MANAGER: ["project:view", "pricing:manage", "pricing:approve", "change:comment"],
  TENANT: ["project:view"],
  FINANCE: ["project:view", "payment:record", "pricing:approve"],
};

/** תפקידים שיש להם סמכות מקצועית לאשר זיהוי שינוי */
export const PROFESSIONAL_DECISION_ROLES: UserRole[] = [
  "SUPER_ADMIN",
  "ORGANIZATION_ADMIN",
  "PROJECT_MANAGER",
  "TENANT_CHANGE_MANAGER",
];

/** תפקידי יועצים */
export const CONSULTANT_ROLES: UserRole[] = [
  "HVAC_CONSULTANT",
  "PLUMBING_CONSULTANT",
  "ELECTRICAL_CONSULTANT",
  "STRUCTURAL_CONSULTANT",
  "ARCHITECT",
];

export function can(role: UserRole | null | undefined, capability: Capability): boolean {
  if (!role) return false;
  return ROLE_CAPABILITIES[role]?.includes(capability) ?? false;
}

export function canAny(role: UserRole | null | undefined, capabilities: Capability[]): boolean {
  return capabilities.some((capability) => can(role, capability));
}

export function hasProfessionalAuthority(role: UserRole | null | undefined): boolean {
  return Boolean(role && PROFESSIONAL_DECISION_ROLES.includes(role));
}

export function isConsultantRole(role: UserRole | null | undefined): boolean {
  return Boolean(role && CONSULTANT_ROLES.includes(role));
}

/** התאמה בין תפקיד יועץ לסוג הבקשה */
export const ROLE_TO_CONSULTANT_KIND: Partial<Record<UserRole, string>> = {
  PLUMBING_CONSULTANT: "PLUMBING",
  HVAC_CONSULTANT: "HVAC",
  ELECTRICAL_CONSULTANT: "ELECTRICAL",
  STRUCTURAL_CONSULTANT: "STRUCTURAL",
  ARCHITECT: "ARCHITECT",
};
