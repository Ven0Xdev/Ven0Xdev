"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="he" dir="rtl">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "flex",
          minHeight: "100dvh",
          alignItems: "center",
          justifyContent: "center",
          background: "#f6f7f8",
          color: "#14171c",
        }}
      >
        <main style={{ textAlign: "center", padding: "0 1.5rem" }}>
          <h1 style={{ fontSize: 18, fontWeight: 600 }}>אירעה תקלה בטעינת המערכת.</h1>
          <p style={{ marginTop: 8, fontSize: 13, color: "#6b727e" }}>
            נסה לרענן את הדף. אם התקלה חוזרת, פנה למנהל המערכת.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: 24,
              padding: "10px 18px",
              borderRadius: 8,
              border: "none",
              background: "#1f4479",
              color: "#fff",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            נסה שוב
          </button>
        </main>
      </body>
    </html>
  );
}
