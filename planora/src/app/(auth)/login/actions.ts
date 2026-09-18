"use server";

import { signIn } from "@/auth";
import { env } from "@/lib/env";

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
