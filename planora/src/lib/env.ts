/**
 * קריאת משתני סביבה. אין סודות בקוד — הכול מגיע מ-environment variables.
 */

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

export const env = {
  databaseUrl: process.env.DATABASE_URL ?? "",
  authSecret: optional("AUTH_SECRET"),
  google: {
    clientId: optional("AUTH_GOOGLE_ID"),
    clientSecret: optional("AUTH_GOOGLE_SECRET"),
  },
  /** כניסת הדגמה — מיועדת לסביבת פיתוח והדגמה בלבד */
  demoLoginEnabled: process.env.DEMO_LOGIN_ENABLED === "true",
  isProduction: process.env.NODE_ENV === "production",
};

export const isGoogleConfigured = Boolean(env.google.clientId && env.google.clientSecret);
