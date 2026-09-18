# PLANORA — תוכנית עבודה

מסמך זה מרכז את משימות הפיתוח. סימון `[x]` = הושלם ונבדק (`lint` + `typecheck`).

## Foundation
- [x] אתחול Next.js (App Router, TypeScript, Tailwind)
- [x] Design tokens וערכת צבעים
- [x] RTL נייטיבי (`dir="rtl"`)
- [x] טיפוגרפיה — Heebo לעברית, Inter למספרים וקוד
- [x] שכבת i18n עברית (תוויות, enums, פורמטים ישראליים)
- [x] רכיבי UI בסיסיים (Button, Card, Badge, Tabs, Table, Dialog, Input...)

## Authentication
- [x] ארכיטקטורת Auth.js (NextAuth v5) עם Prisma Adapter
- [x] ספק Google OAuth ("המשך עם Google")
- [x] כניסת הדגמה לסביבת פיתוח (מופעלת ב-env בלבד)
- [x] מסך כניסה מעוצב
- [x] בדיקת הרשאות בצד השרת (Organization / Project / Role)

## Database
- [x] Prisma schema מלא (32 טבלאות עסקיות + טבלאות Auth)
- [x] PostgreSQL + מיגרציה ראשונה
- [x] Seed: ארגון הדגמה, פרויקט "פארק רזידנס", בניינים, דירות, משתמשים
- [x] Seed: דירה 42 עם 17 שינויים, מחירון, כללי פרויקט, יומן פעילות

## Dashboard
- [x] לוח בקרה עם כרטיסי מדדים
- [x] מקטע "מה דורש את תשומת הלב שלי"
- [x] מסך "העבודה שלי" (משימות אישיות)

## Projects
- [x] רשימת פרויקטים
- [x] עמוד פרויקט: סקירה, בניינים, טיפוסים, דירות, צוות
- [x] כללי הפרויקט
- [x] מחירון הפרויקט
- [x] קבצים, דוחות, היסטוריה

## Apartments
- [x] רשימת דירות עם סינון וחיפוש
- [x] Workspace של דירה עם 8 לשוניות
- [x] סרגל מצב עליון (סטטוס, גרסה, אחראים)

## Drawing Viewer
- [x] פורמט נתוני שרטוט פנימי
- [x] `DrawingProcessor` abstraction + `DemoDrawingProcessor`
- [x] רנדור SVG אדריכלי (קירות, דלתות, חלונות, שקעים, תאורה, אינסטלציה, מיזוג)
- [x] Zoom / Pan / Select / Hover / Focus

## Change Detection
- [x] מנוע השוואה בין גרסאות
- [x] סיווג שינויים לקטגוריות
- [x] רמת ודאות בזיהוי + סיווג מילולי
- [x] תיאורי שינוי בעברית
- [x] מסך השוואה: סטנדרט / תוכנית שינויים / השוואה

## Review
- [x] Workflow בדיקה מקצועית
- [x] אשר זיהוי / תקן / לא מדובר בשינוי / דחה / הערה
- [x] תיעוד תיקוני זיהוי (AITrainingCorrection)
- [x] החזרת תוכנית לתיקון

## Consultants
- [x] שליחת שינוי ליועץ
- [x] תיבת עבודה של יועץ + תשובה (מאושר / בתנאים / נדחה / נדרש מידע)
- [x] רישום ProfessionalDecision לכל החלטה

## Pricing
- [x] מחירון (PriceBook) לכל פרויקט
- [x] מנוע תמחור מהשינויים המאושרים
- [x] עריכת כמות / מחיר / הנחה / שורה ידנית
- [x] השוואת כמויות סטנדרט מול שינויים

## Activity
- [x] יומן פעילות מלא
- [x] מרכז התראות

## Learning Center
- [x] מרכז למידה — מדדי זיהוי מול בדיקות אנושיות
- [x] פילוח לפי קטגוריה

## Rules Engine
- [x] מנוע כללים דטרמיניסטי
- [x] כללי מערכת + כללי פרויקט
- [x] מסך "כללי הפרויקט"

## Polish
- [x] Empty states, Loading states, Error states בעברית
- [x] חיפוש גלובלי (Ctrl+K)
- [x] נגישות, מצבי מיקוד, ניווט מקלדת
- [x] בדיקות: מנוע כללים, תמחור, השוואה, הרשאות, גרסאות
- [x] README

## אחרי Milestone 1 (לא בהיקף הנוכחי)
- [ ] Autodesk Platform Services (`AutodeskDrawingProcessor`)
- [ ] IFC / Revit processors
- [ ] תצוגת 3D לדייר
- [ ] Google Drive / Cloud Storage / Gmail / Calendar
- [ ] אחסון קבצים מרוחק (S3 / GCS / Azure) עם Signed URLs
