import Link from "next/link";

const features = [
  {
    title: "תוכנית אימונים שבועית",
    desc: "מותאמת לרמה, לציוד ולמספר הימים שלך.",
    icon: "🏋️",
  },
  {
    title: "תפריט תזונה",
    desc: "יעד קלוריות וחלבון + תפריט יומי לדוגמה.",
    icon: "🥗",
  },
  {
    title: "טיפים והתקדמות",
    desc: "איך להתקדם נכון ובבטחה לאורך זמן.",
    icon: "📈",
  },
];

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-5 py-10">
      <header className="flex items-center justify-between">
        <div className="text-lg font-extrabold tracking-tight">
          AI <span className="text-brand-400">Gym</span> Coach
        </div>
        <Link
          href="/onboarding"
          className="text-sm font-medium text-slate-300 hover:text-white"
        >
          התחלה →
        </Link>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center py-16 text-center">
        <span className="mb-4 rounded-full border border-white/10 bg-ink-800/60 px-4 py-1.5 text-xs font-medium text-brand-200">
          המאמן האישי שלך, מבוסס AI
        </span>
        <h1 className="max-w-2xl text-4xl font-extrabold leading-tight sm:text-5xl">
          תוכנית אימונים ותזונה{" "}
          <span className="text-brand-400">אישית</span> תוך דקה
        </h1>
        <p className="mt-5 max-w-xl text-lg text-slate-300">
          עונים על כמה שאלות פשוטות, ולוחצים על כפתור אחד. ה-AI בונה לכם תוכנית
          ריאלית ובטוחה — אימונים, תפריט, קלוריות וחלבון.
        </p>
        <Link href="/onboarding" className="btn-primary mt-8 text-lg">
          בואו נתחיל
        </Link>
      </section>

      <section className="grid gap-4 pb-10 sm:grid-cols-3">
        {features.map((f) => (
          <div key={f.title} className="card">
            <div className="text-3xl">{f.icon}</div>
            <h3 className="mt-3 font-bold">{f.title}</h3>
            <p className="mt-1 text-sm text-slate-400">{f.desc}</p>
          </div>
        ))}
      </section>

      <footer className="border-t border-white/10 pt-6 text-center text-xs text-slate-500">
        המידע אינו מהווה ייעוץ רפואי. בכל מגבלה או פציעה התייעצו עם איש מקצוע.
      </footer>
    </main>
  );
}
