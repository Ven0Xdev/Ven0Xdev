"use client";

interface HeaderProps {
  total: number;
  visited: number;
}

export default function Header({ total, visited }: HeaderProps) {
  const pct = total > 0 ? Math.round((visited / total) * 100) : 0;

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-xl shadow">
            🇮🇱
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 leading-tight">
              Israel Travel Tracker
            </h1>
            <p className="text-xs text-gray-500">
              Discover the Holy Land
            </p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1 min-w-[180px]">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <span className="text-green-600 font-bold">{visited}</span>
            <span className="text-gray-400">/</span>
            <span>{total} places visited</span>
            <span className="text-gray-400 text-xs">({pct}%)</span>
          </div>
          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-green-500 rounded-full transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>
    </header>
  );
}
