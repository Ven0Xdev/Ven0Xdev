# Planora

מערכת לניהול שינויי דיירים בפרויקטי מגורים בישראל.

Planora לוקחת תהליך שמתנהל היום בין AutoCAD, PDF, Excel, WhatsApp ומייל — והופכת אותו
לתהליך אחד מסודר, מדיד ומתועד: מתוכנית הסטנדרט, דרך זיהוי השינויים, הבדיקה המקצועית
ואישורי היועצים, ועד לתמחור, אישור הדייר והשחרור לביצוע.

## מה המוצר עושה

```
תוכנית סטנדרט → תוכנית שינויים → זיהוי ההבדלים → בדיקה מקצועית
→ אישורי יועצים → כמויות → תמחור → אישור דייר → תשלום → תוכנית מאושרת לביצוע
```

**Planora אינה מחליפה את מנהלת שינויי הדיירים.** היא נבנתה כ-Copilot מקצועי עבורה:
המערכת משווה, סופרת, מסווגת, מזהה חריגים ומכינה נתונים — וההחלטה המקצועית נשארת
תמיד אצל אדם מורשה.

המערכת לעולם אינה קובעת שדבר מה "עומד בתקן" או "מאושר הנדסית". היא מנסחת ממצאים
בלבד: *נדרשת בדיקה מקצועית*, *נדרש אישור יועץ*, *לא ניתן לקבוע אוטומטית*.

## Tech Stack

| שכבה | טכנולוגיה |
| --- | --- |
| Framework | Next.js 16 (App Router), React 19, TypeScript strict |
| עיצוב | Tailwind CSS v4, Design Tokens, Radix UI primitives |
| טיפוגרפיה | Heebo (עברית), Inter (מספרים, מחירים, קודים) |
| מסד נתונים | PostgreSQL 16 + Prisma ORM |
| הזדהות | Auth.js (NextAuth v5) + Google OAuth |
| ולידציה | Zod, React Hook Form |
| גרפים ואייקונים | Recharts, Lucide |
| בדיקות | Vitest |

## Architecture

```
prisma/           סכימה, מיגרציות ונתוני הדגמה
src/
  app/            מסכים (React Server Components + Server Actions)
    (auth)/       מסך כניסה
    (app)/        המערכת עצמה — מוגנת בבדיקת הרשאות בצד השרת
  components/     רכיבי UI ללא לוגיקה עסקית
  lib/            לוגיקה עסקית טהורה, ניתנת לבדיקה ביחידה
    drawing/      מודל נתוני שרטוט + DrawingProcessor + מנוע השוואה
    changes/      ניסוח שינויים בעברית ורמת ודאות בזיהוי
    rules/        מנוע כללים דטרמיניסטי
    pricing/      מנוע תמחור
    auth/         זהות, הרשאות וסמכות מקצועית
    i18n/         תוויות עברית ופורמטים ישראליים
  server/         שאילתות, שירותים ופעולות שרת
tests/            בדיקות למנועים ולהרשאות
```

עקרון מפריד: **רכיבי ה-SVG של התוכנית אינם מכילים מידע עסקי.** הגאומטריה מגיעה
מ-`lib/drawing`, והמשמעות העסקית מגיעה מ-`ChangeItem` בבסיס הנתונים.

## Local Setup

דרישות: Node.js 20+, PostgreSQL 14+.

```bash
# 1. התקנת תלויות
npm install

# 2. הגדרת משתני סביבה
cp .env.example .env
# ערכו את .env לפי ההסבר בהמשך

# 3. יצירת הסכימה והרצת נתוני ההדגמה
npm run db:migrate
npm run db:seed

# 4. הרצה
npm run dev
```

האפליקציה תעלה בכתובת `http://localhost:3000`.

### Environment Variables

| משתנה | חובה | תיאור |
| --- | --- | --- |
| `DATABASE_URL` | כן | חיבור ל-PostgreSQL |
| `AUTH_SECRET` | כן | מפתח חתימה. יצירה: `openssl rand -base64 32` |
| `AUTH_URL` | בפריסה | כתובת הבסיס של האפליקציה |
| `AUTH_GOOGLE_ID` | לכניסה עם Google | Client ID מ-Google Cloud Console |
| `AUTH_GOOGLE_SECRET` | לכניסה עם Google | Client Secret |
| `DEMO_LOGIN_ENABLED` | לא | `true` מפעיל כניסת הדגמה ללא Google. **לפיתוח והדגמה בלבד.** |

אין להכניס סודות לקוד. כל הערכים נטענים ממשתני סביבה בלבד.

### PostgreSQL

```bash
createdb planora
# ואז ב-.env:
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/planora?schema=public"
```

### Google OAuth

1. Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID
2. סוג: **Web application**
3. Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
4. העתיקו את ה-Client ID וה-Client Secret ל-`AUTH_GOOGLE_ID` ו-`AUTH_GOOGLE_SECRET`

כאשר Google אינו מוגדר, כפתור הכניסה מוצג במצב מנוטרל עם הסבר — והכניסה מתבצעת
דרך כניסת ההדגמה.

### Seed

`npm run db:seed` יוצר סביבת הדגמה מלאה:

- **ארגון:** אורבן ניהול שינויי דיירים (חברת ניהול שינויי דיירים), ובנוסף ארגון יזם
- **פרויקטים:** פארק רזידנס (יזם: יזמות הדגמה, קבלן: בנייה הדגמה), מרומי הפארק
- **מבנה:** 2 בניינים, 22 קומות, 3 טיפוסי דירות, 78 דירות
- **דירה 42** (בניין A, קומה 11): תוכנית סטנדרט, שתי גרסאות שינויים ו-17 שינויים מזוהים
- מחירון פרויקט, כללי פרויקט, בקשות יועצים, גיליונות תמחור, יומן פעילות והתראות

משתמשי ההדגמה (פעילים כאשר `DEMO_LOGIN_ENABLED=true`):

| דואר אלקטרוני | תפקיד |
| --- | --- |
| `yael@planora.demo` | מנהלת שינויי דיירים |
| `ronit@planora.demo` | מתאמת שינויי דיירים |
| `dana@planora.demo` | מנהלת פרויקט |
| `noa@planora.demo` | מעצבת |
| `eyal@planora.demo` | יועץ אינסטלציה |
| `uri@planora.demo` | יועץ מיזוג |
| `michal@planora.demo` | מנהלת תמחור |
| `nir@planora.demo` | מנהל מערכת |

## Commands

```bash
npm run dev          # הרצת סביבת פיתוח
npm run build        # בניית גרסת ייצור
npm run start        # הרצת גרסת ייצור
npm run lint         # ESLint
npm run typecheck    # בדיקת טיפוסים
npm run db:migrate   # יצירת והרצת מיגרציה
npm run db:seed      # טעינת נתוני הדגמה
npm run db:studio    # Prisma Studio
npm run test         # הרצת הבדיקות
```

## DrawingProcessor

המערכת אינה מכירה DWG, PDF או Revit — היא מכירה ממשק אחד:

```ts
interface DrawingProcessor {
  processFile(input): Promise<ProcessedDrawing>;
  extractElements(document): Promise<DrawingElement[]>;
  comparePlans(base, target): Promise<DetectedChange[]>;
  generatePreview(document): Promise<DrawingPreview>;
}
```

- **`DemoDrawingProcessor`** — המימוש הפעיל. עובד על מודל הנתונים הפנימי
  (קירות, מחיצות, דלתות, חלונות, שקעים, תאורה, אינסטלציה, סניטרי, מיזוג, תקשורת).
- **`AutodeskDrawingProcessor` / `IfcDrawingProcessor` / `RevitDrawingProcessor`** —
  חתימות מוכנות ב-`src/lib/drawing/processors/future.ts`, ללא מימוש. החלפת מנוע
  נעשית בנקודה אחת: `getDrawingProcessor()`.

קבצי DWG, DXF, RVT ו-IFC נשמרים ב-V1 עם המטא-דאטה שלהם בלבד. אין ניסיון לפענח
פורמט קנייני.

## Rules Engine

מנוע כללים דטרמיניסטי: אותו קלט תמיד מחזיר את אותה תוצאה, ללא אקראיות.

```ts
// דוגמאות מכללי המערכת
categoryKey ∈ {PLUMBING, SANITARY} ∧ changeType ∈ {MOVED, REMOVED}
  → REQUIRE_CONSULTANT (יועץ אינסטלציה)

categoryKey = HVAC
  → REQUIRE_CONSULTANT (יועץ מיזוג)

structural = true
  → BLOCK_AUTOMATIC_WORKFLOW

confidence < 0.85
  → REQUIRE_MANAGER_REVIEW
```

לכל פרויקט ניתן להוסיף כללים משלו — למשל *"קיר W15 אינו ניתן לשינוי"* או
*"שינוי מיזוג לאחר מועד הסגירה דורש אישור מנהל"*. כלל פרויקט **מתווסף** לכללי
המערכת ואינו מבטל אותם.

## Pricing Engine

מתומחרים אך ורק שינויים שאושרו על ידי גורם מקצועי. שינוי שממתין לבדיקה, נדחה או
ממתין ליועץ אינו נכנס לתמחור.

- התאמת סעיף מחירון: קטגוריה + סוג שינוי, עם נפילה לסעיף כללי לפי קטגוריה
- כמויות נגזרות מהשוואת התוכניות (כולל מטרים רצים למחיצות)
- שורה שנערכה ידנית אינה נדרסת ברענון התמחור
- הנחה מחושבת לפני מע"מ

## Professional Workflow

כל הכרעה נשמרת ב-`ProfessionalDecision` עם שם בעל התפקיד, התפקיד, ההחלטה, ההערה,
הגרסה והתאריך. Audit trail מלא, שאינו נמחק.

- **סמכות מקצועית** — רק `TENANT_CHANGE_MANAGER`, `PROJECT_MANAGER`,
  `ORGANIZATION_ADMIN` ו-`SUPER_ADMIN` יכולים להכריע בשינוי.
  מתאמת שינויי דיירים מכינה ומעירה, אך אינה מאשרת.
- **יועצים** — רק תפקיד יועץ יכול להשיב לבקשה. התשובה: מאושר / מאושר בתנאים /
  נדחה / נדרש מידע נוסף.
- **מעבר לתמחור** חסום כל עוד קיימים שינויים שלא הוכרעו, שינויים שממתינים ליועץ
  או שינויים שסומנו כחוסמים.
- **גרסאות** — תוכנית מאושרת לעולם אינה נדרסת. כל שינוי יוצר גרסה חדשה עם יוצר,
  תאריך, קובץ, הערות וסטטוס.
- **אין** במערכת פעולה בשם "אישור אוטומטי לביצוע".

## Security

- כל בדיקת הרשאה מתבצעת בצד השרת (`requireProjectAccess`, `requireApartmentAccess`).
  הסתרת כפתור ב-UI אינה מנגנון אבטחה.
- ארגון א׳ אינו רואה מידע של ארגון ב׳ — גם לא דרך חיפוש גלובלי או קישור ישיר.
  משאב שאינו בהישג יד המשתמש מוחזר כ"לא נמצא", כדי לא לחשוף את קיומו.
- הרשאה נקבעת לפי שילוב של **ארגון + פרויקט + תפקיד**. משתמש יכול להיות משויך
  למספר ארגונים — מודל שנועד לחברות ניהול שינויי דיירים שעובדות מול כמה קבלנים.
- אין סודות בקוד. הכול במשתני סביבה.

## Privacy

תוכניות דירה וקבצי פרויקט הם מידע עסקי רגיש. הם אינם נשלחים לשירות חיצוני כלשהו
ללא הגדרה מפורשת. שכבת האחסון מופשטת (`StorageProvider`) כדי לאפשר בעתיד מעבר
ל-S3 / Google Cloud Storage / Azure Blob עם קישורים חתומים.

## Testing

```bash
npm run test
```

הבדיקות מכסות את הליבה העסקית: מנוע הכללים, מנוע התמחור, השוואת התוכניות,
רמת הוודאות בזיהוי, ניסוח השינויים בעברית, ההרשאות וניהול הגרסאות.

## Known gaps in Milestone 1

- **העלאת קבצים מהממשק אינה ממומשת.** מודל הנתונים (`UploadedFile`, `DrawingFile`),
  ההפשטה (`DrawingProcessor`, `StorageProvider`) ושכבת השירות שיוצרת גרסה ומריצה
  השוואה קיימות ובדוקות — חסר מסך ההעלאה ונתיב הכתיבה לאחסון. `StorageProvider`
  ללא מימוש מחזיר שגיאה מפורשת ולא נכשל בשקט.
- **כללי פרויקט ניתנים לצפייה בממשק**, ומוגדרים דרך ה-Seed. עריכה מתוך הממשק
  טרם נבנתה.
- **ניהול משתמשים והזמנות לארגון** נעשה כרגע דרך ה-Seed בלבד.

## Future: Autodesk Integration

הארכיטקטורה מוכנה לחיבור עתידי ל-Autodesk Platform Services (Model Derivative,
Viewer, Revit Automation) ול-IFC. המימוש יוחלף בנקודה אחת בלבד, ללא שינוי במסכים,
במנוע הכללים או במנוע התמחור. תצוגת 3D לדייר מתאפשרת באותה ארכיטקטורה.
