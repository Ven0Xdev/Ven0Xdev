import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Provider } from "next-auth/providers";

import { prisma } from "@/lib/db";
import { env, isGoogleConfigured } from "@/lib/env";

const providers: Provider[] = [];

if (isGoogleConfigured) {
  providers.push(
    Google({
      clientId: env.google.clientId,
      clientSecret: env.google.clientSecret,
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

/**
 * כניסה עם דואר אלקטרוני וסיסמה.
 * משמשת בעיקר דיירים, שאינם בהכרח בעלי חשבון Google ארגוני.
 */
providers.push(
  Credentials({
    id: "password",
    name: "דואר אלקטרוני וסיסמה",
    credentials: {
      email: { label: "דואר אלקטרוני", type: "email" },
      password: { label: "סיסמה", type: "password" },
    },
    async authorize(credentials) {
      const email = typeof credentials?.email === "string" ? credentials.email.trim() : null;
      const password = typeof credentials?.password === "string" ? credentials.password : null;
      if (!email || !password) return null;

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user?.passwordHash) return null;

      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) return null;

      return { id: user.id, name: user.name, email: user.email, image: user.image };
    },
  }),
);

/**
 * כניסת הדגמה.
 * מופעלת אך ורק כאשר DEMO_LOGIN_ENABLED=true, ומאפשרת להיכנס כמשתמש קיים
 * מנתוני ההדגמה כדי להריץ את התהליך מקצה לקצה ללא הגדרת Google OAuth.
 * אין כאן סיסמאות ואין ליצור משתמשים חדשים דרך המסלול הזה.
 */
if (env.demoLoginEnabled) {
  providers.push(
    Credentials({
      id: "demo",
      name: "כניסת הדגמה",
      credentials: { email: { label: "דואר אלקטרוני", type: "email" } },
      async authorize(credentials) {
        const email = typeof credentials?.email === "string" ? credentials.email : null;
        if (!email) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

        return { id: user.id, name: user.name, email: user.email, image: user.image };
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  trustHost: true,
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers,
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.userId = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.userId && session.user) {
        session.user.id = token.userId as string;
      }
      return session;
    },
  },
});
