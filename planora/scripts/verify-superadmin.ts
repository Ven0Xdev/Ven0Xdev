/**
 * בדיקת מצב האתחול והאבטחה של סביבת הייצור. קריאה בלבד — אינה משנה דבר.
 *
 *   npm run bootstrap:verify
 *
 * עונה על ארבע שאלות: האם ההגירות רצו, האם קיים מנהל־על, האם מנגנון
 * האתחול נעול, והאם קיימים חשבונות הדגמה שיכולים להיכנס לייצור.
 */

import { config } from "dotenv";
import { readdirSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

import { countSuperAdmins } from "../src/server/services/admin-bootstrap";

config({ path: ".env", quiet: true });

/** תבניות של חשבונות הדגמה שנוצרו בסקריפטי ה-seed */
const DEMO_EMAIL_PATTERNS = [/@oviax\.demo$/i, /@planora\.demo$/i, /^demo[.@]/i];

async function main(): Promise<void> {
  const prisma = new PrismaClient({ log: ["error"] });
  let problems = 0;

  try {
    console.log("\nOVIAX — בדיקת מצב ייצור\n");

    // --- הגירות ---
    const expected = readdirSync(path.join(process.cwd(), "prisma", "migrations"), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    let applied: { migration_name: string; finished_at: Date | null }[] = [];
    try {
      applied = await prisma.$queryRawUnsafe(
        `SELECT migration_name, finished_at FROM _prisma_migrations`,
      );
    } catch {
      console.log("✖ הגירות: טבלת ההגירות אינה קיימת — יש להריץ prisma migrate deploy");
      problems += 1;
    }
    const done = new Set(
      applied.filter((row) => row.finished_at).map((row) => row.migration_name),
    );
    const missing = expected.filter((name) => !done.has(name));
    if (applied.length > 0) {
      if (missing.length === 0) {
        console.log(`✓ הגירות: כל ${expected.length} ההגירות הוחלו`);
      } else {
        console.log(`✖ הגירות: חסרות ${missing.length} — ${missing.join(", ")}`);
        problems += 1;
      }
    }

    // --- מנהל־על ---
    const superAdminCount = await countSuperAdmins(prisma);
    const admins = await prisma.user.findMany({
      where: { isSuperAdmin: true },
      select: { id: true, email: true, name: true, createdAt: true },
    });
    if (superAdminCount === 0) {
      console.log("● מנהל־על: אינו קיים — האתחול טרם בוצע");
    } else {
      console.log(`✓ מנהל־על: ${superAdminCount}`);
      for (const admin of admins) {
        console.log(`    ${admin.email}  (${admin.id})  ${admin.createdAt.toISOString()}`);
      }
    }
    if (superAdminCount > 1) {
      console.log("✖ יותר ממנהל־על אחד — יש לבדוק מי יצר אותם");
      problems += 1;
    }

    // --- מנעול האתחול ---
    const record = await prisma.adminBootstrap.findUnique({ where: { lock: "singleton" } });
    if (record) {
      console.log(`✓ מנגנון האתחול: נעול (${record.method}, ${record.createdAt.toISOString()})`);
      console.log(`    טביעת אצבע של הסוד: ${record.secretFingerprint.slice(0, 12)}…`);
    } else {
      console.log("● מנגנון האתחול: פתוח — הרצה אחת אפשרית");
    }

    // --- כניסת הדגמה ---
    if (process.env.DEMO_LOGIN_ENABLED === "true") {
      console.log("✖ DEMO_LOGIN_ENABLED=true — כניסת הדגמה פעילה בסביבה הזו");
      problems += 1;
    } else {
      console.log("✓ כניסת הדגמה: כבויה");
    }

    // --- חשבונות הדגמה ---
    const withPassword = await prisma.user.findMany({
      where: { passwordHash: { not: null } },
      select: { email: true, isSuperAdmin: true },
    });
    const demoAccounts = withPassword.filter((user) =>
      DEMO_EMAIL_PATTERNS.some((pattern) => pattern.test(user.email ?? "")),
    );
    if (demoAccounts.length === 0) {
      console.log(`✓ חשבונות הדגמה עם סיסמה: אין (${withPassword.length} חשבונות סיסמה בסך הכול)`);
    } else {
      console.log(`✖ נמצאו ${demoAccounts.length} חשבונות הדגמה עם סיסמה:`);
      for (const account of demoAccounts) console.log(`    ${account.email}`);
      problems += 1;
    }

    console.log(
      problems === 0 ? "\nהכול תקין.\n" : `\nנמצאו ${problems} ממצאים שדורשים טיפול.\n`,
    );
  } finally {
    await prisma.$disconnect();
  }

  process.exit(problems === 0 ? 0 : 1);
}

void main();
