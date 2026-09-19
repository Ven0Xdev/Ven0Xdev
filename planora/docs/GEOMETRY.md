# גאומטריית דירה — מהתוכנית של הקבלן אל התלת-ממד

## העיקרון

**ה-3D לעולם אינו hardcoded לדירת הדגמה אחת.**

כל דירה נבנית מהתוכנית האמיתית שהקבלן העלה. דירה 42 היא Showcase — לא מקרה
מיוחד בקוד. אין קואורדינטות כתובות ביד בשום רכיב תצוגה.

```
Uploaded Plan (DWG / DXF / PDF / RVT / IFC)
  → DrawingProcessor          תרגום לפורמט הפנימי
  → ApartmentGeometryProvider  חילוץ גאומטריה
  → ApartmentGeometry          חדרים / קירות / פתחים / רצפות / מרפסות
  → Tenant Configuration       בחירות הדייר
  → Approved Changes           שינויים שאושרו מקצועית
  → Final Interactive Apartment
```

## המבנה

```
src/lib/geometry/
├── types.ts               ApartmentGeometry ורכיביה — מטרים, x/z/y
├── provider.ts            ApartmentGeometryProvider + בחירת מעבד
└── providers/
    └── demo.ts            DemoGeometryProvider (היחיד שקיים)
```

הרנדרר (`buildSceneModel`) צורך **רק** `ApartmentGeometry`. הוא אינו מכיר
`DrawingDocument`, ובוודאי לא DWG.

## הממשק

```ts
interface ApartmentGeometryProvider {
  loadFromPlan(input): Promise<ApartmentGeometry>;   // מתוכנית מעובדת
  loadFromBIM(input): Promise<ApartmentGeometry>;    // מקובץ Revit / IFC
  generateGeometry(input): Promise<ApartmentGeometry>; // מטיפוס לדירה

  getRooms / getWalls / getOpenings / getDoors /
  getWindows / getBalconies / getFloors / getCeilings

  applyApprovedChanges(geometry, changes): ApartmentGeometry;
  createGeometryVersion(geometry, input): ApartmentGeometry;
  validateGeometry(geometry): GeometryValidationIssue[];
}
```

## טיפוסי דירות — 6 מודלים ל-40 דירות

פרויקט עם 40 דירות ו-6 טיפוסים מקבל **6 גאומטריות בסיס**, לא 40.

```
ApartmentTypeGeometry (בסיס)
   └─ generateGeometry({ base, apartmentId })
        └─ ApartmentGeometry לדירה, עם:
             קומה · כיוון · נוף · בחירות דייר · שינויים מאושרים · חומרים
```

דירה חריגה מקבלת `override` והגרסה שלה מסומנת `isOverride: true`:
פנטהאוז, דירת גן, דופלקס, מרפסת גדולה יותר, חזית שונה, חיבור חדרים.

## גרסאות וביקורת

לכל גאומטריה יש `GeometryVersion` עם:

| שדה | למה |
| --- | --- |
| `versionNo` | איזו גרסה מוצגת |
| `source.format` | מאיזה פורמט הגיעה |
| `source.planId` / `planVersionId` | מאיזו תוכנית ואיזו גרסה שלה |
| `createdAt` / `createdBy` | מי יצר ומתי |
| `appliedChangeIds` | אילו שינויים מאושרים הוחלו |
| `isOverride` | האם זו עקיפה ייחודית לדירה |

בלי זה אי אפשר לענות על "למה הדירה בתלת-ממד נראית כך" — וזו שאלה שנשאלת
כשיש מחלוקת.

## שינוי מבני מגיע רק מאישור מקצועי

```
Base Geometry → Change Request → Professional Review → Approved
             → applyApprovedChanges() → Geometry Version חדשה → 3D מעודכן
```

הדייר בוחר חומרים ומוצרים. **הוא אינו מזיז קירות.**
`applyApprovedChanges` מסרב להסיר קיר נושא גם כאשר הגיעה בקשה מאושרת —
בדיקת בטיחות אחרונה, לא החלטה מקצועית.

## בדיקת תקינות

`validateGeometry()` מסמן ואינו פוסק: דלתות חסרות, חפיפת קירות, חדר שאינו
סגור, פתח מחוץ לגבולות, שטח או גובה לא סבירים (לרוב קנה מידה שגוי בקובץ).
`ERROR` אומר שהגאומטריה אינה ניתנת לרינדור אמין — לא שהתוכנית פסולה.

---

# מעבדים עתידיים

> **אף אחד מהם אינו קיים.** `DemoGeometryProvider` הוא המימוש היחיד, והוא
> קורא `DrawingDocument` בלבד. `loadFromBIM` זורק `GeometryUnsupportedError`
> ואינו מחזיר דירה שהומצאה.

הפורמטים **אינם זהים**, ולכן לכל אחד מעבד משלו:

### `AutodeskGeometryProvider` — DWG / RVT

- Autodesk Platform Services (לשעבר Forge): Model Derivative להמרה,
  Data Management לאחסון.
- RVT הוא BIM: החדרים, הקירות והפתחים כבר מתויגים כאובייקטים. זה הפורמט
  העשיר ביותר, והמעבד עליו יהיה הכי מדויק.
- DWG הוא שרטוט: נדרש זיהוי שכבות ומוסכמות שונות בין משרדי אדריכלים.
- **שיקול פרטיות:** תוכניות הן מידע עסקי רגיש. שליחתן לשירות ענן חיצוני
  היא החלטה מפורשת של הלקוח, לא ברירת מחדל.

### `IFCGeometryProvider` — IFC

- פורמט BIM פתוח (buildingSMART). `IfcSpace` → חדר, `IfcWall` → קיר,
  `IfcDoor` / `IfcWindow` → פתח.
- אפשר לעבד מקומית, בלי שירות חיצוני. זו היתרון המרכזי שלו.

### `DXFGeometryProvider` — DXF

- טקסט, ניתן לפענוח מקומי. נשען על שכבות ועל בלוקים.
- דורש מיפוי שכבות לכל משרד תכנון — "A-WALL" אצל אחד אינו "קירות" אצל אחר.

### `PDFPlanGeometryProvider` — PDF

- **הפורמט הקשה ביותר.** PDF וקטורי נותן קווים בלי משמעות; PDF סרוק נותן
  תמונה בלבד.
- דורש זיהוי קנה מידה, זיהוי קירות מתוך קווים, ואישור אנושי.
- אין להציג תוצאה של מעבד כזה בלי סימון ודאות ובלי בדיקה מקצועית.

## זרימת ייבוא עתידית

```
הקבלן מעלה קובץ
  → זיהוי פורמט
  → מעבד ייעודי
  → חילוץ גאומטריה
  → נרמול ליחידות המערכת
  → validateGeometry()  →  ממצאים לבדיקה מקצועית
  → שיוך ל-ApartmentType
  → createGeometryVersion()
  → רינדור
```

**אישור אנושי נדרש בין החילוץ להצגה.** גאומטריה שחולצה אוטומטית מתוכנית
אינה "מאושרת הנדסית", והמערכת לעולם לא תטען שהיא כזו.
