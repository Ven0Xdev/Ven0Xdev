"use server";

import { signIn } from "@/auth";
import { prisma } from "@/lib/db";
import { landingPathForRole } from "@/lib/auth/routing";
import { env } from "@/lib/env";

/**
 * לאן נשלח המשתמש אחרי התחברות מוצלחת.
 * ההחלטה נעשית בשרת לפי התפקיד שבמסד הנתונים — לא לפי פרמטר בכתובת.
 */
async function landingPathForEmail(email: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: {
      isSuperAdmin: true,
      memberships: {
        where: { isActive: true },
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { role: true },
      },
    },
  });
  if (!user) return "/";
  return landingPathForRole(user.memberships[0]?.role ?? null, user.isSuperAdmin);
}

/** כניסה עם דואר אלקטרוני וסיסמה */
export async function signInWithPassword(formData: FormData) {
  const email = formData.get("email");
  const password = formData.get("password");

  if (typeof email !== "string" || typeof password !== "string") {
    return { error: "יש למלא דואר אלקטרוני וסיסמה." };
  }

  const destination = await landingPathForEmail(email);

  try {
    await signIn("password", { email, password, redirectTo: destination });
  } catch (error) {
    // הפניה מוצלחת מסומנת על ידי Next.js בזריקה — אין לבלוע אותה
    if (isRedirect(error)) throw error;
    return { error: "הפרטים שהוזנו אינם נכונים." };
  }
}

export async function signInWithGoogle() {
  await signIn("google", { redirectTo: "/" });
}

/** כניסת הדגמה — פעילה רק כאשר DEMO_LOGIN_ENABLED=true */
export async function signInWithDemoUser(formData: FormData) {
  if (!env.demoLoginEnabled) {
    throw new Error("כניסת ההדגמה אינה פעילה בסביבה זו");
  }

  const email = formData.get("email");
  if (typeof email !== "string" || email.length === 0) {
    throw new Error("לא נבחר משתמש הדגמה");
  }

  await signIn("demo", { email, redirectTo: "/" });
}

/** Next.js מסמן הפניה בזריקת שגיאה עם digest שמתחיל ב-NEXT_REDIRECT */
function isRedirect(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    ((error as { digest: string }).digest.startsWith("NEXT_REDIRECT") ||
      (error as { digest: string }).digest === "NEXT_REDIRECT")
  );
}
