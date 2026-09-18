/**
 * שרטוט אדריכלי אבסטרקטי למסך הכניסה.
 * נוצר כולו ב-SVG — ללא תמונות מלאי.
 */
export function BlueprintArt() {
  return (
    <svg
      viewBox="0 0 520 420"
      className="h-auto w-full max-w-xl"
      fill="none"
      aria-hidden
      focusable="false"
    >
      <defs>
        <pattern id="planora-grid" width="26" height="26" patternUnits="userSpaceOnUse">
          <path d="M26 0H0V26" stroke="currentColor" strokeWidth="0.5" opacity="0.18" />
        </pattern>
      </defs>

      <rect width="520" height="420" fill="url(#planora-grid)" className="text-brand-300" />

      {/* מעטפת הדירה */}
      <g className="text-brand-800" stroke="currentColor">
        <rect x="60" y="56" width="400" height="308" strokeWidth="5" />

        {/* מחיצות פנים */}
        <path d="M250 56v138" strokeWidth="3.5" />
        <path d="M60 218h400" strokeWidth="3.5" />
        <path d="M188 218v146" strokeWidth="3.5" />
        <path d="M344 218v146" strokeWidth="3.5" />

        {/* פתחים */}
        <path d="M250 194v24" strokeWidth="5" className="text-surface" stroke="white" />
        <path d="M112 218h46" strokeWidth="5" stroke="white" />
        <path d="M242 218h44" strokeWidth="5" stroke="white" />
        <path d="M392 218h44" strokeWidth="5" stroke="white" />
      </g>

      {/* סיבוב דלתות */}
      <g className="text-brand-500" stroke="currentColor" strokeWidth="1.5" opacity="0.7">
        <path d="M112 218a46 46 0 0 1 46 46" />
        <path d="M242 218a44 44 0 0 1 44 44" />
        <path d="M392 218a44 44 0 0 1 44 44" />
      </g>

      {/* חלונות */}
      <g stroke="white" strokeWidth="5">
        <path d="M120 56h90" />
        <path d="M300 56h100" />
        <path d="M110 364h80" />
        <path d="M250 364h70" />
      </g>
      <g className="text-brand-400" stroke="currentColor" strokeWidth="1.5">
        <path d="M120 56h90" />
        <path d="M300 56h100" />
        <path d="M110 364h80" />
        <path d="M250 364h70" />
      </g>

      {/* סימוני שינוי — שפת ההשוואה של המערכת */}
      <g>
        <circle cx="196" cy="128" r="7" className="fill-success-600" opacity="0.9" />
        <circle cx="330" cy="120" r="7" className="fill-success-600" opacity="0.9" />
        <circle cx="128" cy="300" r="7" className="fill-warning-600" opacity="0.9" />
        <circle cx="404" cy="300" r="7" className="fill-consultant-600" opacity="0.85" />
        <path
          d="M250 124h-54"
          className="text-warning-600"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="5 4"
        />
      </g>

      {/* קו מידה */}
      <g className="text-ink-subtle" stroke="currentColor" strokeWidth="1">
        <path d="M60 392h400" />
        <path d="M60 386v12M460 386v12M250 388v8" />
      </g>
    </svg>
  );
}
