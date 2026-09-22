/**
 * מסד נתונים נפרד לבדיקות שחייבות להתחיל מריק.
 *
 * אתחול מנהל־העל ניתן להרצה פעם אחת בלבד לכל מסד נתונים, ולכן אי אפשר
 * לבדוק אותו מול מסד ההדגמה המשותף — הוא כבר מכיל מנהל־על. הבדיקות כאן
 * בונות מסד משלהן, מריצות עליו את ההגירות, ומוחקות אותו בסוף.
 */

import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

export interface TemporaryDatabase {
  url: string;
  prisma: PrismaClient;
  drop: () => Promise<void>;
}

function replaceDatabaseName(url: string, name: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

/** מתחבר למסד הניהול `postgres` כדי ליצור ולמחוק מסדים */
function adminClient(url: string): PrismaClient {
  return new PrismaClient({
    datasources: { db: { url: replaceDatabaseName(url, "postgres") } },
    log: ["error"],
  });
}

/**
 * מחזיר מסד נתונים ריק עם הסכימה המלאה, או null כאשר אין הרשאה ליצור
 * מסדים. במקרה הזה הבדיקות שמשתמשות בו מדלגות במקום להיכשל.
 */
export async function createTemporaryDatabase(
  name: string,
): Promise<TemporaryDatabase | null> {
  const base = process.env.DATABASE_URL;
  if (!base) return null;

  const url = replaceDatabaseName(base, name);
  const admin = adminClient(base);

  try {
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}"`);
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  } catch {
    await admin.$disconnect();
    return null;
  }
  await admin.$disconnect();

  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });

  const prisma = new PrismaClient({ datasources: { db: { url } }, log: ["error"] });

  return {
    url,
    prisma,
    drop: async () => {
      await prisma.$disconnect();
      const cleanup = adminClient(base);
      await cleanup.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}"`);
      await cleanup.$disconnect();
    },
  };
}
