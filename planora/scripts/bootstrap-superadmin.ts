/**
 * אתחול מנהל־העל הראשון של OVIAX — פקודת שרת חד־פעמית.
 *
 *   npm run bootstrap:superadmin
 *
 * הפקודה רצה מול מסד הנתונים שב-DATABASE_URL ואינה חושפת דבר לדפדפן.
 * אין נתיב HTTP מקביל, במתכוון: מה שאין לו כתובת אי אפשר לתקוף.
 *
 * הסוד והסיסמה נקראים ממשתני סביבה, אינם נכתבים ליומן, ואינם מוחזרים.
 */

import { config } from "dotenv";
import { readdirSync } from "node:fs";
import { hostname, userInfo } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

import {
  bootstrapFirstSuperAdmin,
  readBootstrapState,
} from "../src/server/services/admin-bootstrap";
import { redactSecrets } from "../src/lib/admin/bootstrap";

config({ path: ".env", quiet: true });

const REQUIRED_VARS = [
  "DATABASE_URL",
  "SUPER_ADMIN_EMAIL",
  "SUPER_ADMIN_NAME",
  "SUPER_ADMIN_PASSWORD",
  "SUPER_ADMIN_BOOTSTRAP_SECRET",
] as const;

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

/**
 * ההגירות חייבות לרוץ לפני האתחול — אחרת טבלת הביקורת אינה קיימת
 * והמנעול החד־פעמי אינו קיים יחד איתה.
 */
async function assertMigrationsApplied(prisma: PrismaClient): Promise<void> {
  const folder = path.join(process.cwd(), "prisma", "migrations");
  const expected = readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  let applied: { migration_name: string; finished_at: Date | null }[];
  try {
    applied = await prisma.$queryRawUnsafe(
      `SELECT migration_name, finished_at FROM _prisma_migrations`,
    );
  } catch {
    fail(
      "טבלת ההגירות אינה קיימת. יש להריץ קודם את ההגירות בייצור:\n" +
        "    npx prisma migrate deploy",
    );
  }

  const done = new Set(
    applied.filter((row) => row.finished_at !== null).map((row) => row.migration_name),
  );
  const missing = expected.filter((name) => !done.has(name));

  if (missing.length > 0) {
    fail(
      `חסרות ${missing.length} הגירות בבסיס הנתונים:\n` +
        missing.map((name) => `    - ${name}`).join("\n") +
        "\n\n  יש להריץ קודם:\n    npx prisma migrate deploy",
    );
  }
  console.log(`✓ כל ${expected.length} ההגירות הוחלו`);
}

async function main(): Promise<void> {
  console.log("\nOVIAX — אתחול מנהל־העל הראשון\n");

  const missing = REQUIRED_VARS.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    fail(
      "חסרים משתני סביבה:\n" +
        missing.map((name) => `    - ${name}`).join("\n") +
        "\n\n  ראו docs/PRODUCTION_BOOTSTRAP.md",
    );
  }

  // כניסת הדגמה ואתחול ייצור אינם הולכים יחד
  if (process.env.DEMO_LOGIN_ENABLED === "true") {
    fail(
      "DEMO_LOGIN_ENABLED=true. אין לאתחל מנהל־על בסביבה שבה כניסת ההדגמה פעילה.\n" +
        "  יש לכבות את הדגל ולהריץ שוב.",
    );
  }

  const secret = process.env.SUPER_ADMIN_BOOTSTRAP_SECRET as string;
  const password = process.env.SUPER_ADMIN_PASSWORD as string;
  const email = process.env.SUPER_ADMIN_EMAIL as string;
  const name = process.env.SUPER_ADMIN_NAME as string;

  // היעד מוצג במפורש. `.env` מקומי יכול להשלים DATABASE_URL חסר, ואסור
  // שאתחול "ייצור" יתבצע בשקט מול מסד פיתוח.
  const target = new URL(process.env.DATABASE_URL as string);
  console.log(`  יעד: ${target.hostname}${target.pathname}\n`);

  // שגיאות מוצגות בהודעות של הסקריפט עצמו, לא בפלט הגולמי של Prisma
  const prisma = new PrismaClient({ log: [] });

  try {
    await assertMigrationsApplied(prisma);

    const state = await readBootstrapState(prisma);
    if (state.alreadyBootstrapped) {
      console.log(
        `\n● האתחול כבר בוצע ב-${state.record?.createdAt.toISOString()} עבור ${state.record?.email}.`,
      );
      console.log("  מנגנון האתחול נעול. לא בוצע שינוי.\n");
      process.exit(0);
    }
    if (state.superAdminCount > 0) {
      console.log("\n● SUPER_ADMIN already exists. לא בוצע שינוי.\n");
      process.exit(0);
    }

    const outcome = await bootstrapFirstSuperAdmin(prisma, {
      email,
      name,
      password,
      secret,
      performedFrom: `${userInfo().username}@${hostname()}`,
    });

    switch (outcome.kind) {
      case "CREATED":
        console.log("\n✓ נוצר מנהל־על ראשון");
        console.log(`    מזהה:    ${outcome.userId}`);
        console.log(`    דואר:    ${outcome.email}`);
        console.log(`    תפקיד:   ${outcome.role}`);
        console.log(`    נוצר ב:  ${outcome.createdAt.toISOString()}`);
        console.log("\n  מנגנון האתחול נעול מעתה.");
        console.log("  יש להסיר כעת מהסביבה את המשתנים:");
        console.log("    SUPER_ADMIN_PASSWORD, SUPER_ADMIN_BOOTSTRAP_SECRET,");
        console.log("    SUPER_ADMIN_EMAIL, SUPER_ADMIN_NAME");
        console.log("\n  כניסה: דף ההתחברות של OVIAX, דואר אלקטרוני + סיסמה.\n");
        break;
      case "ALREADY_BOOTSTRAPPED":
      case "SUPER_ADMIN_EXISTS":
        console.log(`\n● ${outcome.message} לא בוצע שינוי.\n`);
        break;
      case "EMAIL_TAKEN":
        fail(outcome.message);
        break;
      case "INVALID_INPUT":
        fail(`${outcome.message}\n` + outcome.problems.map((p) => `    - ${p}`).join("\n"));
        break;
    }
  } catch (error) {
    // גם הודעת שגיאה לא תדליף סוד
    const message = error instanceof Error ? error.message : String(error);
    fail(redactSecrets(message, [secret, password]));
  } finally {
    await prisma.$disconnect();
  }
}

void main();
