using Prive.Core;
using Prive.World;

namespace Prive.Travel
{
    /// <summary>Everything a pricing model is allowed to consider.</summary>
    public readonly struct TravelPricingContext
    {
        public readonly TravelRoute Route;
        public readonly TravelMode Mode;
        public readonly CityData Origin;
        public readonly CityData Destination;
        public readonly GameTime Now;

        /// <summary>Player fame, 0–1000. Notoriety can attract charter surcharges or comps later.</summary>
        public readonly double Fame;

        public TravelPricingContext(TravelRoute route, TravelMode mode, CityData origin, CityData destination,
                                    GameTime now, double fame)
        {
            Route = route;
            Mode = mode;
            Origin = origin;
            Destination = destination;
            Now = now;
            Fame = fame;
        }
    }

    /// <summary>The priced result for one mode.</summary>
    public readonly struct TravelPricing
    {
        public readonly Money Cost;
        public readonly int DurationMinutes;
        public readonly double Comfort;
        public readonly double FameDelta;

        public TravelPricing(Money cost, int durationMinutes, double comfort, double fameDelta)
        {
            Cost = cost;
            DurationMinutes = durationMinutes;
            Comfort = comfort;
            FameDelta = fameDelta;
        }
    }

    /// <summary>
    /// Prices a single travel option.
    /// </summary>
    /// <remarks>
    /// Injected rather than hardcoded so travel economics are tunable — and so difficulty
    /// modes, promotions and later a demand model can replace the whole curve without
    /// touching <see cref="TravelService"/>.
    /// </remarks>
    public interface ITravelPricingModel
    {
        TravelPricing Price(TravelPricingContext context);

        /// <summary>Maximum practical distance for a mode, in kilometres.</summary>
        double MaxRangeKm(TravelMode mode);
    }
}
