using System;
using System.Collections.Generic;

namespace Prive.Core
{
    /// <summary>
    /// Default <see cref="IGameClock"/>. Accumulates real time, converts it to whole
    /// in-game minutes, and fires each crossed boundary exactly once and in order.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Boundaries are derived arithmetically from the new time rather than by comparing
    /// calendar fields, so advancing by one minute and advancing by ten thousand produce
    /// the same sequence of day/month/year ticks.
    /// </para>
    /// <para>
    /// <see cref="Skip"/> exists because emitting 40,000 minute ticks for a long-haul
    /// flight would be pure waste: nothing that cares about minute resolution (NPC
    /// schedules, traffic, ambient reactions) is even loaded while the player is in
    /// transit. Coarse boundaries still fire so rent and revenue are never missed.
    /// </para>
    /// </remarks>
    public sealed class GameClock : IGameClock
    {
        /// <summary>Default pacing: one in-game minute per real second (1 game day ≈ 24 real minutes).</summary>
        public const double DefaultMinutesPerRealSecond = 1.0;

        private readonly IEventBus _bus;
        private readonly List<IClockTickable> _tickables = new List<IClockTickable>();
        private readonly List<IClockTickable> _dispatchBuffer = new List<IClockTickable>();

        private GameTime _now;
        private double _minuteAccumulator;

        public GameClock(IEventBus bus, GameTime startTime = default(GameTime))
        {
            if (bus == null) throw new ArgumentNullException("bus");
            _bus = bus;
            _now = startTime;
            MinutesPerRealSecond = DefaultMinutesPerRealSecond;
        }

        public GameTime Now { get { return _now; } }

        public bool IsPaused { get; set; }

        public double MinutesPerRealSecond { get; set; }

        public IDisposable Register(IClockTickable tickable)
        {
            if (tickable == null) throw new ArgumentNullException("tickable");
            _tickables.Add(tickable);
            return new Registration(this, tickable);
        }

        public void Tick(double realDeltaSeconds)
        {
            if (IsPaused || realDeltaSeconds <= 0.0) return;

            _minuteAccumulator += realDeltaSeconds * MinutesPerRealSecond;
            if (_minuteAccumulator < 1.0) return;

            long wholeMinutes = (long)_minuteAccumulator;
            _minuteAccumulator -= wholeMinutes;

            for (long i = 0; i < wholeMinutes; i++)
            {
                _now = _now.AddMinutes(1);
                EmitBoundariesFor(_now, includeMinute: true);
            }
        }

        public void Skip(long minutes, string reason)
        {
            if (minutes <= 0) return;

            GameTime from = _now;
            long target = _now.TotalMinutes + minutes;

            // Step hour by hour so day/week/month/year boundaries are still detected,
            // without paying for per-minute work across a multi-day jump.
            long nextHourBoundary = ((_now.TotalMinutes / GameTime.MinutesPerHour) + 1) * GameTime.MinutesPerHour;
            for (long m = nextHourBoundary; m <= target; m += GameTime.MinutesPerHour)
            {
                _now = GameTime.FromMinutes(m);
                EmitBoundariesFor(_now, includeMinute: false);
            }

            _now = GameTime.FromMinutes(target);
            _minuteAccumulator = 0.0;

            _bus.Publish(new TimeSkippedEvent(from, _now, reason));
        }

        public void RestoreTime(GameTime time)
        {
            _now = time;
            _minuteAccumulator = 0.0;
        }

        private void EmitBoundariesFor(GameTime now, bool includeMinute)
        {
            bool isHour = now.TotalMinutes % GameTime.MinutesPerHour == 0;
            bool isDay = now.TotalMinutes % GameTime.MinutesPerDay == 0;
            bool isWeek = isDay && now.TotalMinutes % GameTime.MinutesPerWeek == 0;
            bool isMonth = isDay && now.Day == 1;
            bool isYear = isMonth && now.Month == 1;

            if (includeMinute) Dispatch(Cadence.Minute, now);
            if (isHour) Dispatch(Cadence.Hour, now);
            if (isDay) Dispatch(Cadence.Day, now);
            if (isWeek) Dispatch(Cadence.Week, now);
            if (isMonth) Dispatch(Cadence.Month, now);
            if (isYear) Dispatch(Cadence.Year, now);
        }

        private void Dispatch(Cadence cadence, GameTime now)
        {
            // Ordered tickables first, in registration order — the economy depends on it.
            if (_tickables.Count > 0)
            {
                _dispatchBuffer.Clear();
                _dispatchBuffer.AddRange(_tickables);

                for (int i = 0; i < _dispatchBuffer.Count; i++)
                {
                    IClockTickable t = _dispatchBuffer[i];
                    switch (cadence)
                    {
                        case Cadence.Minute: t.OnMinute(now); break;
                        case Cadence.Hour: t.OnHour(now); break;
                        case Cadence.Day: t.OnDay(now); break;
                        case Cadence.Week: t.OnWeek(now); break;
                        case Cadence.Month: t.OnMonth(now); break;
                        case Cadence.Year: t.OnYear(now); break;
                    }
                }
            }

            // Then loosely coupled listeners.
            switch (cadence)
            {
                case Cadence.Minute: _bus.Publish(new MinuteTickEvent(now)); break;
                case Cadence.Hour: _bus.Publish(new HourTickEvent(now)); break;
                case Cadence.Day: _bus.Publish(new DayTickEvent(now)); break;
                case Cadence.Week: _bus.Publish(new WeekTickEvent(now)); break;
                case Cadence.Month: _bus.Publish(new MonthTickEvent(now)); break;
                case Cadence.Year: _bus.Publish(new YearTickEvent(now)); break;
            }
        }

        private enum Cadence
        {
            Minute,
            Hour,
            Day,
            Week,
            Month,
            Year
        }

        private sealed class Registration : IDisposable
        {
            private GameClock _clock;
            private IClockTickable _tickable;

            public Registration(GameClock clock, IClockTickable tickable)
            {
                _clock = clock;
                _tickable = tickable;
            }

            public void Dispose()
            {
                if (_clock == null) return;
                _clock._tickables.Remove(_tickable);
                _clock = null;
                _tickable = null;
            }
        }
    }
}
