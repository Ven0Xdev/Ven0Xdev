using Prive.Core;

namespace Prive.Travel
{
    /// <summary>
    /// A priced, bookable travel option.
    /// </summary>
    /// <remarks>
    /// Quotes are values, not commands. Getting them is free and side-effect-free, which is
    /// what lets the phone's travel app show every option side by side before the player
    /// commits to one.
    /// </remarks>
    public readonly struct TravelQuote
    {
        public readonly TravelRoute Route;
        public readonly TravelMode Mode;
        public readonly Money Cost;

        /// <summary>Door-to-door duration, including boarding and ground handling.</summary>
        public readonly int DurationMinutes;

        /// <summary>0–1. Feeds lifestyle score and how rested the player arrives.</summary>
        public readonly double Comfort;

        /// <summary>Fame gained on arrival. Being seen stepping off a jet is worth something.</summary>
        public readonly double FameDelta;

        public readonly bool IsAvailable;
        public readonly TravelUnavailableReason UnavailableReason;

        private TravelQuote(TravelRoute route, TravelMode mode, Money cost, int durationMinutes,
                            double comfort, double fameDelta, bool isAvailable,
                            TravelUnavailableReason unavailableReason)
        {
            Route = route;
            Mode = mode;
            Cost = cost;
            DurationMinutes = durationMinutes;
            Comfort = comfort;
            FameDelta = fameDelta;
            IsAvailable = isAvailable;
            UnavailableReason = unavailableReason;
        }

        public static TravelQuote Available(TravelRoute route, TravelMode mode, Money cost,
                                            int durationMinutes, double comfort, double fameDelta)
        {
            return new TravelQuote(route, mode, cost, durationMinutes, comfort, fameDelta,
                                   true, TravelUnavailableReason.None);
        }

        public static TravelQuote Unavailable(TravelRoute route, TravelMode mode, TravelUnavailableReason reason)
        {
            return new TravelQuote(route, mode, Money.Zero, 0, 0.0, 0.0, false, reason);
        }

        public double DurationHours { get { return DurationMinutes / 60.0; } }

        public override string ToString()
        {
            return IsAvailable
                ? Mode + " " + Cost + " / " + DurationHours.ToString("0.#") + "h"
                : Mode + " unavailable (" + UnavailableReason + ")";
        }
    }
}
