using System;
using System.Globalization;

namespace Prive.Core
{
    /// <summary>
    /// A point on the game calendar, stored as whole minutes since <see cref="Epoch"/>.
    /// </summary>
    /// <remarks>
    /// There is exactly one notion of time in PRIVÉ and this is it. Business revenue,
    /// rent, loan interest, NPC schedules, market ticks, flights and events all derive
    /// from <see cref="TotalMinutes"/>, so nothing can drift out of step with anything
    /// else. Calendar fields use the real Gregorian calendar via <see cref="DateTime"/>
    /// so month lengths and leap years behave the way players expect.
    /// </remarks>
    public readonly struct GameTime : IEquatable<GameTime>, IComparable<GameTime>
    {
        public const int MinutesPerHour = 60;
        public const int HoursPerDay = 24;
        public const int MinutesPerDay = MinutesPerHour * HoursPerDay;
        public const int DaysPerWeek = 7;
        public const int MinutesPerWeek = MinutesPerDay * DaysPerWeek;

        /// <summary>Calendar origin. Day 0, minute 0 of a new game.</summary>
        public static readonly DateTime Epoch = new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Unspecified);

        public static readonly GameTime Start = default(GameTime);

        private readonly long _totalMinutes;

        private GameTime(long totalMinutes)
        {
            _totalMinutes = totalMinutes;
        }

        /// <summary>Whole minutes elapsed since <see cref="Epoch"/>. The canonical value.</summary>
        public long TotalMinutes { get { return _totalMinutes; } }

        /// <summary>Whole days elapsed since <see cref="Epoch"/>. Day 0 is the first day.</summary>
        public long DayIndex { get { return FloorDiv(_totalMinutes, MinutesPerDay); } }

        /// <summary>Whole weeks elapsed since <see cref="Epoch"/>, aligned to the epoch day.</summary>
        public long WeekIndex { get { return FloorDiv(_totalMinutes, MinutesPerWeek); } }

        /// <summary>Whole hours elapsed since <see cref="Epoch"/>.</summary>
        public long HourIndex { get { return FloorDiv(_totalMinutes, MinutesPerHour); } }

        private DateTime AsDateTime { get { return Epoch.AddMinutes(_totalMinutes); } }

        public int Year { get { return AsDateTime.Year; } }
        public int Month { get { return AsDateTime.Month; } }
        public int Day { get { return AsDateTime.Day; } }
        public int Hour { get { return AsDateTime.Hour; } }
        public int Minute { get { return AsDateTime.Minute; } }
        public DayOfWeek DayOfWeek { get { return AsDateTime.DayOfWeek; } }

        /// <summary>Minutes elapsed since local midnight — the value venue and NPC schedules key off.</summary>
        public int MinuteOfDay { get { return (int)Mod(_totalMinutes, MinutesPerDay); } }

        /// <summary>True between 20:00 and 05:59 — the window the nightlife economy runs in.</summary>
        public bool IsNight
        {
            get
            {
                int hour = Hour;
                return hour >= 20 || hour < 6;
            }
        }

        /// <summary>True on Saturday or Sunday.</summary>
        public bool IsWeekend
        {
            get
            {
                DayOfWeek d = DayOfWeek;
                return d == DayOfWeek.Saturday || d == DayOfWeek.Sunday;
            }
        }

        public static GameTime FromMinutes(long totalMinutes)
        {
            if (totalMinutes < 0) throw new ArgumentOutOfRangeException("totalMinutes", "Game time cannot precede the epoch.");
            return new GameTime(totalMinutes);
        }

        /// <summary>Builds a time from calendar fields. Used by content authoring and tests.</summary>
        public static GameTime FromDate(int year, int month, int day, int hour = 0, int minute = 0)
        {
            DateTime dt = new DateTime(year, month, day, hour, minute, 0, DateTimeKind.Unspecified);
            double minutes = (dt - Epoch).TotalMinutes;
            if (minutes < 0) throw new ArgumentOutOfRangeException("year", "Date precedes the game epoch (" + Epoch.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) + ").");
            return new GameTime((long)minutes);
        }

        public GameTime AddMinutes(long minutes) { return FromMinutes(checked(_totalMinutes + minutes)); }
        public GameTime AddHours(long hours) { return AddMinutes(checked(hours * MinutesPerHour)); }
        public GameTime AddDays(long days) { return AddMinutes(checked(days * MinutesPerDay)); }

        /// <summary>Minutes from this time to <paramref name="other"/>; negative if <paramref name="other"/> is earlier.</summary>
        public long MinutesUntil(GameTime other) { return other._totalMinutes - _totalMinutes; }

        /// <summary>Midnight at the start of this day.</summary>
        public GameTime StartOfDay() { return new GameTime(DayIndex * MinutesPerDay); }

        private static long FloorDiv(long a, long b)
        {
            long q = a / b;
            if ((a % b != 0) && ((a < 0) != (b < 0))) q--;
            return q;
        }

        private static long Mod(long a, long b)
        {
            long r = a % b;
            return r < 0 ? r + b : r;
        }

        public bool Equals(GameTime other) { return _totalMinutes == other._totalMinutes; }
        public override bool Equals(object obj) { return obj is GameTime && Equals((GameTime)obj); }
        public override int GetHashCode() { return _totalMinutes.GetHashCode(); }
        public int CompareTo(GameTime other) { return _totalMinutes.CompareTo(other._totalMinutes); }

        public static bool operator ==(GameTime a, GameTime b) { return a._totalMinutes == b._totalMinutes; }
        public static bool operator !=(GameTime a, GameTime b) { return a._totalMinutes != b._totalMinutes; }
        public static bool operator >(GameTime a, GameTime b) { return a._totalMinutes > b._totalMinutes; }
        public static bool operator <(GameTime a, GameTime b) { return a._totalMinutes < b._totalMinutes; }
        public static bool operator >=(GameTime a, GameTime b) { return a._totalMinutes >= b._totalMinutes; }
        public static bool operator <=(GameTime a, GameTime b) { return a._totalMinutes <= b._totalMinutes; }

        /// <summary>e.g. <c>Wed 12 Mar 2025 21:45</c>.</summary>
        public override string ToString()
        {
            return AsDateTime.ToString("ddd dd MMM yyyy HH:mm", CultureInfo.InvariantCulture);
        }

        /// <summary>e.g. <c>21:45</c>.</summary>
        public string ToClockString()
        {
            return AsDateTime.ToString("HH:mm", CultureInfo.InvariantCulture);
        }
    }
}
