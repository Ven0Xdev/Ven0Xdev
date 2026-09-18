import { describe, expect, it } from "vitest";
import type { UserRole } from "@prisma/client";

import {
  ROLE_CAPABILITIES,
  can,
  canAny,
  hasProfessionalAuthority,
  isConsultantRole,
} from "@/lib/auth/permissions";

describe("הרשאות לפי תפקיד", () => {
  it("מנהלת שינויי דיירים יכולה להכריע בשינויים ולהעביר ליועץ", () => {
    expect(can("TENANT_CHANGE_MANAGER", "change:decide")).toBe(true);
    expect(can("TENANT_CHANGE_MANAGER", "change:sendToConsultant")).toBe(true);
    expect(can("TENANT_CHANGE_MANAGER", "review:perform")).toBe(true);
    expect(can("TENANT_CHANGE_MANAGER", "pricing:manage")).toBe(true);
  });

  it("מתאמת שינויי דיירים מכינה אך אינה מכריעה", () => {
    expect(can("TENANT_CHANGE_COORDINATOR", "change:comment")).toBe(true);
    expect(can("TENANT_CHANGE_COORDINATOR", "change:sendToConsultant")).toBe(true);
    expect(can("TENANT_CHANGE_COORDINATOR", "change:decide")).toBe(false);
    expect(hasProfessionalAuthority("TENANT_CHANGE_COORDINATOR")).toBe(false);
  });

  it("מעצבת יכולה להעלות תוכניות אך לא להכריע או לתמחר", () => {
    expect(can("DESIGNER", "plan:upload")).toBe(true);
    expect(can("DESIGNER", "change:decide")).toBe(false);
    expect(can("DESIGNER", "pricing:manage")).toBe(false);
  });

  it("יועץ יכול להשיב לבקשה אך לא לתמחר או לשחרר לביצוע", () => {
    expect(can("PLUMBING_CONSULTANT", "consultant:respond")).toBe(true);
    expect(can("PLUMBING_CONSULTANT", "pricing:manage")).toBe(false);
    expect(can("PLUMBING_CONSULTANT", "execution:release")).toBe(false);
    expect(isConsultantRole("PLUMBING_CONSULTANT")).toBe(true);
  });

  it("דייר יכול לצפות בלבד", () => {
    expect(ROLE_CAPABILITIES.TENANT).toEqual(["project:view"]);
    expect(can("TENANT", "change:decide")).toBe(false);
    expect(can("TENANT", "pricing:manage")).toBe(false);
  });

  it("מנהל מערכת מקבל את כל היכולות", () => {
    expect(can("SUPER_ADMIN", "organization:manage")).toBe(true);
    expect(can("SUPER_ADMIN", "execution:release")).toBe(true);
  });

  it("משתמש ללא תפקיד אינו מקבל דבר", () => {
    expect(can(null, "project:view")).toBe(false);
    expect(can(undefined, "change:decide")).toBe(false);
    expect(hasProfessionalAuthority(null)).toBe(false);
  });

  it("canAny מחזיר אמת כאשר לפחות יכולת אחת קיימת", () => {
    expect(canAny("DESIGNER", ["change:decide", "plan:upload"])).toBe(true);
    expect(canAny("DESIGNER", ["change:decide", "pricing:approve"])).toBe(false);
  });

  it("רק תפקידים מוגדרים מקבלים סמכות מקצועית להכריע", () => {
    const authorised: UserRole[] = [
      "SUPER_ADMIN",
      "ORGANIZATION_ADMIN",
      "PROJECT_MANAGER",
      "TENANT_CHANGE_MANAGER",
    ];

    for (const role of Object.keys(ROLE_CAPABILITIES) as UserRole[]) {
      expect(hasProfessionalAuthority(role)).toBe(authorised.includes(role));
    }
  });

  it("אף תפקיד שאינו יועץ אינו יכול להשיב כיועץ", () => {
    expect(can("TENANT_CHANGE_MANAGER", "consultant:respond")).toBe(false);
    expect(can("PRICING_MANAGER", "consultant:respond")).toBe(false);
  });
});
