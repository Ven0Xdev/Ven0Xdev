using System;

namespace Prive.Core
{
    /// <summary>The single source of in-game time.</summary>
    public interface IGameClock
    {
        GameTime Now { get; }

        bool IsPaused { get; set; }

        /// <summary>In-game minutes that pass per real second at 1× speed.</summary>
        double MinutesPerRealSecond { get; set; }

        /// <summary>Advances by real elapsed seconds, emitting every crossed boundary including minutes.</summary>
        void Tick(double realDeltaSeconds);

        /// <summary>
        /// Jumps forward without emitting per-minute ticks — flights, sleeping, fast travel.
        /// Emits hour and coarser boundaries plus <see cref="TimeSkippedEvent"/>.
        /// </summary>
        void Skip(long minutes, string reason);

        /// <summary>Registers an ordered tickable. Returns a token; dispose to unregister.</summary>
        IDisposable Register(IClockTickable tickable);

        /// <summary>Hard-sets the clock without emitting boundaries. Loading a save only.</summary>
        void RestoreTime(GameTime time);
    }
}
