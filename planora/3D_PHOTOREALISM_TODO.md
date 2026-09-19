# 3D Photorealism — מצב קיים ותוכנית עבודה

מסמך עבודה. מתעדכן בכל Phase. היעד: **Photorealistic Digital Twin של הדירה
שהדייר קנה** — לא Demo, לא Marketing Scene, לא קירות אפורים.

---

## 0. מה זמין בסביבה הזו

| כלי | מצב |
| --- | --- |
| 3D skills / MCP 3D tools | **אין.** נבדק — לא קיימים בסביבה. |
| Playwright + Chromium | ✅ קיים. משמש ל-Visual Iteration ולצילומי מסך. |
| three / @react-three/fiber / @react-three/drei | ✅ מותקנים (r186 / v9 / v10) |
| @react-three/postprocessing | ❌ לא מותקן |
| תמונות רפרנס | **לא הועברו בסשן הזה.** היעד הוויזואלי נגזר מהתיאור המילולי. |

אין להמציא APIs. כל ספרייה חדשה נבדקת מול הגרסה המותקנת בפועל.

---

## 1. מצב קיים — ביקורת כנה

נקרא בפועל: `src/lib/three/*`, `src/components/three/*`, `src/lib/visualization/*`.

### מה כבר טוב

- **הגאומטריה נגזרת מהתוכנית**, לא ממודל נפרד. `DrawingDocument → buildSceneModel()`.
  זה הבסיס הנכון — התוכנית והתלת-ממד לא יכולים לצאת מסנכרון.
- **חומר חייב להיות מקושר למוצר אמיתי** שאושר לפרויקט. אין חומר "מומצא".
- **מנוע ההדמיה כבר מופרד** מאחורי `ApartmentVisualizationProvider` (Phase 1).
- אין coordinates hardcoded ברכיבי UI.

### מה לא טוב — והסיבה שהתצוגה נראית כמו אב-טיפוס

| # | ממצא | היכן |
| --- | --- | --- |
| 1 | **כל הסצנה עשויה קופסאות.** `boxGeometry` בלבד — אין פרופילים, אין קיטום, אין עומק | `apartment-scene.tsx` |
| 2 | **אין PBR.** `meshStandardMaterial` עם צבע שטוח. אפס מפות: normal / roughness / ao | `apartment-scene.tsx` |
| 3 | **אין HDRI / Environment.** רק hemisphere + directional + point אחד | `apartment-scene.tsx` |
| 4 | **אין Post-processing.** אין SSAO, Bloom, Tone Mapping, Color Grading | — |
| 5 | **אין רהיטים בכלל.** דירה ריקה לחלוטין | — |
| 6 | **אין נוף חיצוני.** רקע צבע אחיד + משטח אפור | `apartment-scene.tsx` |
| 7 | **מצב "סיור" מזויף** — מצלמה מסתובבת אוטומטית ברדיוס קבוע, ללא שליטה וללא collisions | `WalkCamera` |
| 8 | **קירות חתוכים ב-1.35 מ'** — מוסכמת "בית בובות". נכון לתצוגה מלמעלה, שגוי לסיור | `scene-model.ts` |
| 9 | **אין Quality Modes** ואין התאמה למובייל | — |
| 10 | **אין Fallback ל-GPU חלש** | — |
| 11 | **אין מסך מלא** | — |
| 12 | **אין Reflections** בזכוכית, בשיש או ברצפה | — |
| 13 | **לילה לא באמת נדלק** — עוצמת point light בלבד, בלי גופי תאורה, בלי אורות עיר | `materials.ts` |
| 14 | **אין ניווט בין חדרים** ואין סיור קולנועי | — |
| 15 | **אין Asset Registry** ואין ניהול זיכרון | — |
| 16 | `model3dUrl` / `textureUrl` / `materialPresetId` **אינם קיימים** ב-`CatalogProduct` / `ProductVariant` | `schema.prisma` |
| 17 | **אין שכבת גאומטריה מנורמלת** — `SceneModel` נגזר ישירות מהציור, בלי Rooms/Walls/Openings מפורשים ובלי גרסאות | `scene-model.ts` |

---

## 2. תוכנית — 7 Phases

### Phase 1 — ארכיטקטורה ✅ (הושלם חלקית)

- [x] `ApartmentVisualizationProvider` — מנוע להחלפה מאחורי ממשק אחד
- [x] `VisualizationPresentation` — פיצול יחיד בין סצנה מקומית לזרם מרוחק
- [x] `capabilities` — המסך שואל, לא מנחש
- [x] `UnrealPixelStreamingProvider` — תיעוד בלבד, נכשל במפורש
- [ ] `setQualityMode()` + `resetScene()` בממשק
- [ ] שינוי שם המימוש הנוכחי ל-`R3FVisualizationProvider`
- [ ] **שכבת גאומטריה מנורמלת** — `ApartmentGeometry`, `RoomGeometry`,
      `WallGeometry`, `OpeningGeometry`, `BalconyGeometry`…
- [ ] `ApartmentGeometryProvider` + `DemoGeometryProvider`
- [ ] תיעוד: `AutodeskGeometryProvider`, `IFCGeometryProvider`,
      `PDFPlanGeometryProvider`, `DXFGeometryProvider` — **אין Parsing אמיתי, ולא נטען שיש**
- [ ] `GeometryVersion` — מקור, גרסה, מי יצר, מתי, אילו שינויים הוחלו
- [ ] Geometry Overrides לדירות חריגות (פנטהאוז / גן / דופלקס)
- [ ] `validateGeometry()` hooks — דלתות חסרות, חפיפת קירות, חדר לא סגור

### Phase 2 — חומרים ותאורה

- [ ] Material Library לפי קטגוריות: WOOD, MARBLE, STONE, CONCRETE, GLASS,
      METAL, FABRIC, PAINT, CERAMIC, OUTDOOR
- [ ] PBR: baseColor, normalMap, roughnessMap, metalnessMap, aoMap
- [ ] טקסטורות פרוצדורליות היכן שאין קובץ ספק — עדיף על צבע שטוח
- [ ] HDRI / Environment lighting
- [ ] גופי תאורה: recessed, LED strips, area lights
- [ ] Contact shadows + צללים רכים
- [ ] לילה אמיתי: פנים נדלק, מרפסת נדלקת, חוץ מחשיך, אורות עיר
- [ ] `model3dUrl` / `textureUrl` / `materialConfig` ב-schema
- [ ] Material Presets: Light / Warm / Dark — **רק ממוצרים שקיימים בקטלוג**

### Phase 3 — מצלמה וניווט

- [ ] מצב תצוגה: orbit / pan / zoom / focus room
- [ ] מצב סיור אמיתי: גובה עיניים, damping, collisions, אין מעבר דרך קירות
- [ ] גובה קירות מלא בסיור, חתך "בית בובות" בתצוגה בלבד
- [ ] ניווט לפי חדר עם מעבר מצלמה חלק
- [ ] סיור קולנועי אוטומטי בין החדרים — לא Teleport

### Phase 4 — תצורה מקושרת ספקים

- [ ] Hotspots עדינים על מטבח / ריצוף / קיר / ברז / דלת / תאורה
- [ ] החלפת מוצר בזמן אמת + משוב מחיר (`+ ₪4,500`)
- [ ] Edit Mode — בחירת מוצר וחומר בלבד, **ללא שינוי מבני לא מאושר**
- [ ] Scene Modes: Default / Cinematic / Edit / Walkthrough
- [ ] "הדירה המקורית" מול "הדירה שלי"

### Phase 5 — חוץ

- [ ] Exterior Environment לפי `ApartmentViewProfile`
- [ ] View Types: SEA / CITY / PARK / STREET / MOUNTAIN / OTHER
- [ ] קו רקיע, ים, אורות עיר בלילה
- [ ] גובה קומה משפיע על קו האופק
- [ ] מרפסת: ריצוף חוץ, ישיבה, צמחייה, תאורת אווירה

### Phase 6 — ביצועים

- [ ] Quality Modes: High / Balanced / Performance
- [ ] זיהוי מכשיר וברירת מחדל מתאימה
- [ ] LOD, instancing, texture compression, preloading
- [ ] ניקוי זיכרון: textures, materials, geometries
- [ ] Asset Registry + fallback לנכס שנכשל — **הסצנה לא קורסת**
- [ ] Fallback ל-GPU חלש: הודעה + 2D + Performance Mode

### Phase 7 — ליטוש ויזואלי

- [ ] Post-processing: SSAO, Bloom עדין, Tone Mapping, Color Grading, Vignette, DoF
- [ ] Reflections סלקטיביים — זכוכית, שיש, מתכת, רצפה. **לא הכול מבריק**
- [ ] Staging: ספה, שטיח, שולחן, אי מטבח, וילונות, צמחים, מיטה, כלים סניטריים
- [ ] **כל רהיט שאינו חלק מהביצוע מסומן `Visualization Only`**
- [ ] מסך מלא + UI מינימלי
- [ ] "מכין את הדירה שלך..." עם progress אמיתי
- [ ] Visual QA בדפדפן אחרי כל Pass

---

## 3. גבולות שלא נחצים

1. **אין Fake 3D.** לא תמונת רקע, לא וידאו, לא screenshot מוכן. החוויה אינטראקטיבית.
2. **אין הזיות מוצר.** מטבח, ריצוף, ברז או דלת שאינם בקטלוג המאושר לפרויקט —
   לא מוצגים. לעולם.
3. **פוטוריאליזם לא בא על חשבון האמת.** מידות, זמינות, מחירים, כללי פרויקט
   ושינויים מאושרים גוברים על המראה.
4. **שינוי מבני מגיע רק משינוי מאושר מקצועית.** הדייר בוחר חומרים ומוצרים,
   לא מזיז קירות.
5. **רהיטי Staging מסומנים ככאלה.** אין להשאיר דייר בהנחה שהספה כלולה.
6. **לא נטען ש-DWG/RVT/IFC עובד** כל עוד אין Parser אמיתי.
7. **אין לשבור את OVIAX.** Auth, Pricing, Catalogs, Permissions, Workflows —
   לא נוגעים בהם אלא אם נדרש ישירות לחיבור ה-3D.

---

## 4. Verification בכל Phase

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

ואחר כך בדפדפן: כניסת דייר → פתיחת הדירה → 3D → החלפת ריצוף → החלפת מטבח →
בוקר/שקיעה/לילה → מרפסת → חזרה לסיכום → אימות שהמחיר התעדכן.

**Quality Gate:** אין לסמן Phase כהושלם אם הסצנה עדיין נראית כמו prototype.
