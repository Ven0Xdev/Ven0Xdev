namespace Prive.Core
{
    /// <summary>Published once per in-game minute of normal play.</summary>
    public readonly struct MinuteTickEvent
    {
        public readonly GameTime Now;
        public MinuteTickEvent(GameTime now) { Now = now; }
    }

    /// <summary>Published when the clock crosses an hour boundary.</summary>
    public readonly struct HourTickEvent
    {
        public readonly GameTime Now;
        public HourTickEvent(GameTime now) { Now = now; }
    }

    /// <summary>Published at midnight. Rent, salaries, revenue and interest hang off this.</summary>
    public readonly struct DayTickEvent
    {
        public readonly GameTime Now;
        public DayTickEvent(GameTime now) { Now = now; }
    }

    /// <summary>Published on week boundaries aligned to <see cref="GameTime.Epoch"/>.</summary>
    public readonly struct WeekTickEvent
    {
        public readonly GameTime Now;
        public WeekTickEvent(GameTime now) { Now = now; }
    }

    /// <summary>Published at midnight on the first day of a calendar month.</summary>
    public readonly struct MonthTickEvent
    {
        public readonly GameTime Now;
        public MonthTickEvent(GameTime now) { Now = now; }
    }

    /// <summary>Published at midnight on 1 January.</summary>
    public readonly struct YearTickEvent
    {
        public readonly GameTime Now;
        public YearTickEvent(GameTime now) { Now = now; }
    }

    /// <summary>
    /// Published when time jumps rather than flows — a flight, a night's sleep, a
    /// fast-forward. Minute ticks are deliberately not emitted across a skip; systems
    /// that need to catch up on fine-grained state should handle this event.
    /// </summary>
    public readonly struct TimeSkippedEvent
    {
        public readonly GameTime From;
        public readonly GameTime To;
        public readonly long Minutes;
        public readonly string Reason;

        public TimeSkippedEvent(GameTime from, GameTime to, string reason)
        {
            From = from;
            To = to;
            Minutes = to.TotalMinutes - from.TotalMinutes;
            Reason = reason;
        }
    }
}
