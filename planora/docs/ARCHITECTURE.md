# PLANORA — ארכיטקטורה

## עקרון מנחה
Planora היא **Copilot מקצועי** למנהלת שינויי דיירים. המערכת מכינה נתונים, משווה,
סופרת ומארגנת — אך ההחלטה המקצועית נשארת אצל בן אדם מורשה. אין במערכת מסלול
שבו קובץ שהועלה הופך אוטומטית ל"תוכנית מאושרת".

## שכבות

```
app/            שכבת המסכים (React Server Components + Server Actions)
components/     רכיבי UI ללא לוגיקה עסקית
lib/            לוגיקה עסקית טהורה, ניתנת לבדיקה ביחידה
  drawing/      מודל נתוני שרטוט + DrawingProcessor (abstraction)
  changes/      השוואת תוכניות, תיאור שינויים, רמת ודאות
  rules/        מנוע כללים דטרמיניסטי
  pricing/      מנוע תמחור
  auth/         זהות והרשאות
  i18n/         תוויות עברית ופורמטים ישראליים
server/         גישה לנתונים (Prisma) ופעולות שרת
```

כלל: רכיבי SVG של השרטוט **אינם** מכילים מידע עסקי. הגאומטריה מגיעה מ-`lib/drawing`,
והמשמעות העסקית מגיעה מ-`ChangeItem` בבסיס הנתונים.

## DrawingProcessor

```ts
interface DrawingProcessor {
  processFile(input): Promise<ProcessedDrawing>
  extractElements(drawing): Promise<DrawingElement[]>
  comparePlans(base, target): Promise<DetectedChange[]>
  generatePreview(drawing): Promise<DrawingPreview>
}
```

מימושים:
- `DemoDrawingProcessor` — פעיל ב-V1, עובד על מודל הנתונים הפנימי.
- `AutodeskDrawingProcessor`, `IfcDrawingProcessor`, `RevitDrawingProcessor` — חתימות
  מוכנות ב-`lib/drawing/processors/`, ללא מימוש.

## זרימת הערך

```
העלאת תוכנית → גרסה חדשה → ניתוח והשוואה → זיהוי שינויים
→ מנוע כללים (מה דורש יועץ / חסום) → בדיקת מנהלת שינויי דיירים
→ יועצים לפי צורך → כמויות → תמחור → אישור דייר → תשלום → שחרור לביצוע
```

כל מעבר שלב מתועד ב-`ActivityLog` וכל החלטה מקצועית ב-`ProfessionalDecision`.

## הרשאות
כל שאילתה עוברת דרך `requireProjectAccess` / `requireApartmentAccess` בצד השרת.
ארגון אינו רואה מידע של ארגון אחר. הסתרה ב-UI אינה מנגנון אבטחה.

## אחסון
`lib/storage` מספק abstraction (`StorageProvider`). ב-V1 המימוש מקומי.
תוכניות דירה אינן נשלחות לשירות חיצוני.
