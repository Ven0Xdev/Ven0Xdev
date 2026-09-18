import { Skeleton } from "@/components/ui/misc";

export default function Loading() {
  return (
    <div className="animate-in-up">
      <Skeleton className="h-7 w-56" />
      <Skeleton className="mt-2 h-4 w-80" />

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-28 rounded-card" />
        ))}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Skeleton className="h-80 rounded-card" />
        <Skeleton className="h-80 rounded-card" />
      </div>

      <p className="sr-only" role="status">
        טוען נתונים...
      </p>
    </div>
  );
}
