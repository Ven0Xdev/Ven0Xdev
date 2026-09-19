# שכבת ההדמיה — מנוע תלת-ממד להחלפה

## הרעיון בשורה אחת

המנוע התלת-ממדי הוא **מודול נפרד מאחורי ממשק אחד**. הפורטל, מסכי המנהלת,
מודל הנתונים ומנוע התמחור אינם יודעים אם הדירה מרונדרת בדפדפן או בשרת רינדור
מרוחק.

## למה

התצוגה שרצה היום היא **אב-טיפוס** מבוסס Three.js. היא נאמנה לתוכנית, אבל אינה
הדמיה פוטוריאליסטית. היעד של OVIAX הוא Photorealistic Architectural
Visualization ברמת luxury real-estate — חומרים מציאותיים, תאורה גלובלית,
השתקפויות, זכוכית אמיתית, תאורה פנימית, נוף חיצוני אמיתי, מעבר יום/שקיעה/לילה
ותנועת מצלמה קולנועית. רמה כזו אינה מושגת בליטוש נוסף של Three.js בדפדפן.

לכן הכסף וההשקעה אינם הולכים כרגע לליטוש האב-טיפוס, אלא **לגבולות הנכונים**:
כשהמנוע הפוטוריאליסטי יהיה מוכן, החלפתו לא תדרוש כתיבה מחדש של הפורטל.

## המבנה

```
src/lib/visualization/
├── types.ts                              טיפוסים שאינם תלויים במנוע
├── provider.ts                           ApartmentVisualizationProvider + בחירת מנוע
├── material-library.ts                   משפחות חומר, מפרט הסטנדרט, ערכות מראה
├── materials.ts                          גזירת חומרים ממוצרי הספקים
├── resolve.ts                            מיזוג סטנדרט עם בחירות הדייר
├── lighting.ts                           תאורה לפי שעה ביום
├── quality.ts                            זיהוי מכשיר ורמות איכות
├── use-visualization.ts                  חיבור React למנוע
└── providers/
    ├── r3f.ts                            R3FVisualizationProvider         (פעיל)
    └── unreal-pixel-streaming.ts         UnrealPixelStreamingProvider     (עתידי)
```

```
מסך ──▶ useApartmentVisualization ──▶ ApartmentVisualizationProvider
                                              │
                          ┌───────────────────┴────────────────────┐
                          ▼                                        ▼
            R3FVisualizationProvider                UnrealPixelStreamingProvider
            (Three.js בדפדפן)                        (Unreal + Pixel Streaming)
                          │                                        │
                    LOCAL_SCENE                             REMOTE_STREAM
```

## הממשק

```ts
interface ApartmentVisualizationProvider {
  readonly id: VisualizationProviderId;
  readonly label: string;
  readonly capabilities: VisualizationCapabilities;

  loadApartment(input: LoadApartmentInput): Promise<VisualizationState>;
  loadConfiguration(input: LoadConfigurationInput): Promise<VisualizationState>;
  applyMaterial(input: ApplyMaterialInput): Promise<VisualizationState>;
  applyProductVariant(input: ApplyProductVariantInput): Promise<VisualizationState>;
  setTimeOfDay(timeOfDay: TimeOfDay): Promise<VisualizationState>;
  setExteriorEnvironment(environment: ExteriorEnvironment | null): Promise<VisualizationState>;
  focusRoom(roomId: string | null): Promise<VisualizationState>;
  startWalkthrough(options?: WalkthroughOptions): Promise<VisualizationState>;
  stopWalkthrough(): Promise<VisualizationState>;
  setQualityMode(mode: QualityMode): Promise<VisualizationState>;
  resetScene(): Promise<VisualizationState>;

  getState(): VisualizationState;
  subscribe(listener: VisualizationListener): () => void;
  dispose(): void;
}
```

כל פעולה מחזירה את המצב המעודכן **וגם** משדרת אותו למאזינים. מנוע מרוחק מדווח
כך על התקדמות טעינה בלי שהמסך יצטרך לדעת שהוא מרוחק.

### שתי החלטות שמחזיקות את הארכיטקטורה

**1. `VisualizationPresentation` — נקודת פיצול אחת**

```ts
type VisualizationPresentation =
  | { kind: "LOCAL_SCENE";   scene: unknown; materials; lighting }
  | { kind: "REMOTE_STREAM"; sessionId; signalingUrl; streamId? };
```

`Apartment3DViewer` מתפצל על `presentation.kind` בדיוק פעם אחת. `scene` מוגדר
`unknown` במכוון: רק הרנדרר המקומי יודע מהו המודל שלו, ואין לשאר המערכת עסק בו.

**2. `capabilities` — הממשק אינו מנחש מה המנוע יודע**

המסך שואל, ולא מניח. פקד "סיור" מוצג רק כאשר `capabilities.walkthrough` דולק.
כך מנוע פוטוריאליסטי יקבל את הפקדים שמתאימים לו, ומנוע האב-טיפוס אינו מציג
שליטה בדבר שאינו יודע לרנדר.

| יכולת | אב-טיפוס | Unreal (יעד) |
| --- | --- | --- |
| `photorealistic` | ✗ | ✓ |
| `globalIllumination` | ✗ | ✓ |
| `reflections` | ✗ | ✓ |
| `realisticGlass` | ✗ | ✓ |
| `cinematicCamera` | ✗ | ✓ |
| `roomNavigation` | ✓ | ✓ |
| `guidedTour` | ✓ | ✓ |
| `exteriorEnvironment` | ✗ | ✓ |
| `interiorLighting` | ✓ | ✓ |
| `walkthrough` | ✓ | ✓ |
| `balconyVisualization` | ✓ | ✓ |
| `supplierDrivenMaterials` | ✓ | ✓ |
| `runsInBrowser` | ✓ | ✗ |
| `requiresStreaming` | ✗ | ✓ |

## החלפת המנוע

נקודת ההחלפה היחידה:

```bash
NEXT_PUBLIC_VISUALIZATION_PROVIDER=r3f-webgl              # ברירת מחדל
NEXT_PUBLIC_VISUALIZATION_PROVIDER=unreal-pixel-streaming # כשיוטמע
```

ערך לא מוכר אינו מפיל מסך — המערכת חוזרת לאב-טיפוס, כדי שתקלת הגדרה לא תשאיר
דייר בלי תצוגה.

---

# המימוש הנוכחי — `R3FVisualizationProvider`

- הגאומטריה מגיעה מ-`ApartmentGeometry`, שנגזרת מהתוכנית שהקבלן העלה
  (ראו [`GEOMETRY.md`](GEOMETRY.md)). **אין קובץ מודל נפרד**, ולכן התוכנית
  והתלת-ממד אינם יכולים לצאת מסנכרון.
- קירות נחתכים בגובה 1.35 מ' ("בית בובות") בתצוגה מלמעלה, ועומדים בגובהם
  המלא (2.7 מ') במצב סיור.
- **חומרים:** כל משטח נושא משפחת חומר, ומקבל מרקם פרוצדורלי שנוצר בזמן ריצה —
  סיב עץ, עורקי שיש, פוגות, מרקם בטון. אין קובצי תמונה ואין הורדה מהרשת.
  טקסטורת ספק אמיתית (`textureUrl`) תגבר עליו כשתחובר.
- **תאורה:** מפת סביבה מחושבת (Lightformer) להשתקפויות, שמש מכוונת, צללי
  מגע, מיפוי גוונים ACES וחשיפה משתנה לפי שעה. בלילה הדירה נדלקת מבפנים.
- **מצלמה:** מעבר חלק אל חדר נבחר, סיור בגובה עיניים עם התנגשויות ועדשה
  רחבה, וסיור מודרך אוטומטי בין החדרים.
- **ריהוט:** מסומן `visualizationOnly` ואינו חלק מהביצוע. הממשק אומר זאת לדייר.
- חומר נכנס לסצנה רק אם הוא מקושר ל-`MaterialDefinition` של מוצר או וריאנט
  שאושר לפרויקט.
- קבועות סניטריות אינן ממופות למשטח — ברז בגוון שחור אינו הופך את האסלה לשחורה.
- `setExteriorEnvironment` שומר את הנתון ומחזיר הודעה מפורשת שהנוף אינו מרונדר.
  המנוע מדווח מה הוא לא עושה, במקום להציג "נוף לים" שאינו נראה.

---

# המימוש העתידי — `UnrealPixelStreamingProvider`

> **הקובץ קיים כשלד בלבד. אין מימוש.** כל פעולה זורקת
> `VisualizationUnsupportedError` ואינה מחזירה מצב שנראה תקין — מנוע שמחזיר
> בשקט סצנה ריקה היה מציג לדייר דירה שאינה שלו.

## למה זרימת וידאו ולא הורדת המנוע לדפדפן

סצנה ברמת luxury real-estate שוקלת גיגה-בייטים ודורשת GPU. היא תרוץ על שרת
רינדור ותזרים וידאו ב-WebRTC. הדפדפן מציג משטח וידאו ושולח פקודות — זה מה
שמבדיל את `REMOTE_STREAM` מ-`LOCAL_SCENE`.

## מה צריך להיבנות

1. **צד שרת** — Unreal Engine עם תוסף Pixel Streaming, מאחורי Signalling Server
   ו-TURN. **מופע לכל צופה**, עם תפוגת זמן.
2. **הקצאת מופע** — נקודת קצה ב-Next.js שמבקשת מופע, **מאמתת הרשאה לדירה**
   (`requireTenantApartment` / `requireApartmentAccess`, בדיוק כמו כל מסך אחר),
   ומחזירה `sessionId`, `signalingUrl` ואסימון קצר-מועד.
   אסור להחזיר כתובת שרת רינדור ללא בדיקת הרשאה: זרם וידאו של דירה הוא מידע
   אישי של הדייר.
3. **נכסים** — נכס Unreal מוכן לכל `ApartmentType`. `LoadApartmentInput` מעביר
   `apartmentTypeId` בדיוק בשביל זה. הגאומטריה חייבת להיגזר מהתוכנית המאושרת.
4. **חומרים** — `MaterialAssignment` נשלח כפקודה למופע. `textureUrl` מצביע על
   טקסטורת הספק; המנוע העתידי כן יטען אותה.
5. **פקודות** — כל מתודה בממשק מתורגמת להודעת JSON לערוץ הנתונים של Pixel
   Streaming, והמצב מתעדכן כשהמופע מאשר.
6. **נגן וידאו** — הענף `REMOTE_STREAM` ב-`Apartment3DViewer` מציג כרגע הודעה;
   הנגן ייכנס יחד עם המימוש.

## מה לא משתנה כשעוברים

הפורטל, מסכי המנהלת, מודל הנתונים, מנוע התמחור ומנוע הכללים.

## סיכונים שיש להכריע בהם לפני פיתוח

- עלות GPU לצופה ומדיניות תפוגת מופע
- השהיה מקצה לקצה ברשת סלולרית של דייר
- **נגישות** — זרם וידאו אינו DOM. חובה להשאיר חלופה נגישה: המפרט הכתוב
  והתוכנית הדו-ממדית. אין להישען על התצוגה בלבד.
- אזור אירוח — נתוני פרויקט אינם יוצאים לשירות חיצוני ללא החלטה מפורשת.

---

## גבול מקצועי

התצוגה **ממחישה בלבד**. היא אינה אישור הנדסי, אינה מחליפה את המפרט הטכני ואת
התוכניות המאושרות, ואינה קובעת גימור סופי. הדבר כתוב בממשק, ליד התצוגה עצמה,
בשני המנועים.

## בדיקות

`tests/visualization-provider.test.ts` בודק את החוזה — לא את המראה: ששני
המנועים מממשים את אותן פעולות, שחומר בודד אינו נוגע במשטחים אחרים, שביטול חומר
מחזיר את מפרט הסטנדרט, שהמנוע העתידי נכשל במפורש, ושקבועה סניטרית אינה נצבעת
מגוון של ברז.
