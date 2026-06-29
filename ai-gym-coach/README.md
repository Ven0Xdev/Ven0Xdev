# AI Gym Coach 🏋️

אפליקציה שבה המשתמש ממלא שאלון קצר ומקבל **תוכנית אימונים ותזונה אישית** שנבנית על ידי AI.

## מה כבר בנוי (MVP)

לפי הסקופ ההתחלתי, נבנו ארבעת החלקים הראשונים:

1. **שאלון אישי** – `/onboarding`
2. **כפתור Generate Plan** – "✨ צור תוכנית"
3. **תשובה מה-AI** – תוכנית מלאה (אימונים, תפריט, קלוריות, חלבון, טיפים, מוטיבציה)
4. **שמירת תוכנית** – ב-Supabase אם מוגדר, אחרת מקומית בדפדפן (`localStorage`)

## סטאק

- **Frontend:** Next.js 14 (App Router) + TypeScript
- **Design:** Tailwind CSS (RTL, עברית)
- **Backend:** API Route (`app/api/generate-plan`)
- **AI:** OpenAI API
- **Database:** Supabase (אופציונלי ל-MVP)

## התקנה והרצה

```bash
cd ai-gym-coach
npm install
cp .env.example .env.local   # מלאו את המפתחות
npm run dev
```

פתחו http://localhost:3000

### משתני סביבה

| משתנה | חובה | תיאור |
|-------|------|-------|
| `OPENAI_API_KEY` | ✅ | מפתח OpenAI ליצירת התוכניות |
| `OPENAI_MODEL` | ⬜ | שם המודל (ברירת מחדל `gpt-4o-mini`) |
| `NEXT_PUBLIC_SUPABASE_URL` | ⬜ | כתובת פרויקט Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ⬜ | מפתח anon של Supabase |

אם Supabase לא מוגדר — האפליקציה עובדת מיד והתוכניות נשמרות מקומית בדפדפן.

### Supabase (אופציונלי)

הריצו את `supabase/schema.sql` בעורך ה-SQL כדי ליצור את טבלת `plans`.

## מבנה הפרויקט

```
ai-gym-coach/
├─ app/
│  ├─ page.tsx                 # דף בית
│  ├─ onboarding/page.tsx      # שאלון + כפתור + תצוגת תוכנית + שמירה
│  └─ api/generate-plan/route.ts  # קריאה ל-OpenAI
├─ components/PlanView.tsx     # תצוגת התוכנית
├─ lib/
│  ├─ types.ts                 # טיפוסים
│  ├─ prompt.ts                # הנחיית המערכת + בניית הפרומפט
│  ├─ supabase.ts              # קליינט Supabase
│  └─ storage.ts              # שמירה (Supabase / מקומי)
└─ supabase/schema.sql
```

## הצעדים הבאים (לא נכללים ב-MVP)

- Google Login (Supabase Auth)
- דפים: `/dashboard`, `/workouts`, `/nutrition`, `/progress`
- מעקב משקל ותמונות התקדמות

> ⚠️ המידע אינו מהווה ייעוץ רפואי. בכל פציעה או מגבלה יש להתייעץ עם איש מקצוע.
