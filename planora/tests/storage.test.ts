import { describe, expect, it } from "vitest";

import { buildStorageKey, getStorageProvider } from "@/lib/storage";

describe("אחסון קבצים", () => {
  it("בונה מפתח אחסון עקבי לפי ארגון, פרויקט, דירה וגרסה", () => {
    const key = buildStorageKey({
      organizationId: "org-1",
      projectId: "prj-1",
      apartmentId: "apt-42",
      planVersionId: "ver-3",
      fileName: "תוכנית שינויים.pdf",
    });

    expect(key).toBe("org/org-1/project/prj-1/apartment/apt-42/version/ver-3/תוכנית_שינויים.pdf");
  });

  it("מנקה תווים שעלולים לשמש למעבר בין תיקיות", () => {
    const key = buildStorageKey({ organizationId: "org-1", fileName: "../../etc/passwd" });

    expect(key).not.toContain("..");
    expect(key.startsWith("org/org-1/")).toBe(true);
    // שם הקובץ אינו יכול להוסיף רמות נתיב נוספות
    expect(key.slice("org/org-1/".length)).not.toContain("/");
  });

  it("ללא ספק אחסון מוגדר — העלאה נכשלת במפורש ולא בשקט", async () => {
    await expect(
      getStorageProvider().put({
        key: "k",
        originalName: "a.pdf",
        body: Buffer.from(""),
      }),
    ).rejects.toThrow(/אחסון הקבצים אינו מוגדר/);
  });
});
