/**
 * מחסום בין סקריפטי ההדגמה לבין מסד נתונים אמיתי.
 *
 * סקריפטי ה-seed יוצרים משתמשי הדגמה עם סיסמה ידועה. אם הם ירוצו פעם אחת
 * מול ייצור, ייווצרו שם חשבונות שכל מי שקרא את המאגר יכול להיכנס איתם.
 * לכן הם נחסמים לפי יעד ההרצה, ולא לפי כוונת המריץ.
 */

export type SeedRefusal =
  | { allowed: true }
  | { allowed: false; reason: "PRODUCTION_NODE_ENV" | "REMOTE_DATABASE" | "MISSING_URL"; message: string };

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", "host.docker.internal"]);

/** מארח מקומי בלבד נחשב בטוח לזריעה */
export function isLocalDatabaseUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return LOCAL_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

export function checkSeedTarget(input: {
  databaseUrl?: string | null;
  nodeEnv?: string;
  allowRemote?: boolean;
}): SeedRefusal {
  if (input.nodeEnv === "production") {
    return {
      allowed: false,
      reason: "PRODUCTION_NODE_ENV",
      message: "NODE_ENV=production — אין לזרוע נתוני הדגמה בייצור.",
    };
  }
  if (!input.databaseUrl) {
    return { allowed: false, reason: "MISSING_URL", message: "חסר DATABASE_URL." };
  }
  if (!isLocalDatabaseUrl(input.databaseUrl) && !input.allowRemote) {
    return {
      allowed: false,
      reason: "REMOTE_DATABASE",
      message:
        "DATABASE_URL מצביע על מסד נתונים מרוחק. זריעת הדגמה מורשית רק מול מסד מקומי.\n" +
        "  לסביבת בדיקות מרוחקת בלבד: OVIAX_ALLOW_REMOTE_SEED=true",
    };
  }
  return { allowed: true };
}

/** נקראת בראש כל סקריפט seed. עוצרת את התהליך לפני שנכתב משהו. */
export function assertSeedTargetIsSafe(): void {
  const decision = checkSeedTarget({
    databaseUrl: process.env.DATABASE_URL,
    nodeEnv: process.env.NODE_ENV,
    allowRemote: process.env.OVIAX_ALLOW_REMOTE_SEED === "true",
  });
  if (!decision.allowed) {
    console.error(`\n✖ זריעה נחסמה: ${decision.message}\n`);
    process.exit(1);
  }
}
