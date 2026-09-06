using System;
using Prive.Core;

namespace Prive.Travel
{
    /// <summary>
    /// Default pricing: <c>distance × mode rate × class multiplier × destination market</c>.
    /// </summary>
    /// <remarks>
    /// <para>
    /// A formula rather than an authored price table, so a new city is priced correctly the
    /// moment it has coordinates. Every constant below is a named tuning value; there are no
    /// magic numbers in the calculation itself.
    /// </para>
    /// <para>
    /// The curve is deliberately steep at the top. A charter costing thirty times an economy
    /// seat is what makes flying private read as an achievement rather than a menu option.
    /// </para>
    /// </remarks>
    public sealed class DistanceTravelPricingModel : ITravelPricingModel
    {
        private struct ModeProfile
        {
            public double BaseFeeDollars;
            public double PerKmDollars;
            public double CruiseKmh;

            /// <summary>Fixed overhead: check-in, security, boarding, ground handling.</summary>
            public int OverheadMinutes;

            public double Comfort;
            public double FameDelta;
            public double MaxRangeKm;
        }

        private static readonly ModeProfile Ground = new ModeProfile
        {
            BaseFeeDollars = 40, PerKmDollars = 0.55, CruiseKmh = 85,
            OverheadMinutes = 15, Comfort = 0.35, FameDelta = 0.0, MaxRangeKm = 1200
        };

        private static readonly ModeProfile Economy = new ModeProfile
        {
            BaseFeeDollars = 90, PerKmDollars = 0.11, CruiseKmh = 780,
            OverheadMinutes = 190, Comfort = 0.25, FameDelta = 0.0, MaxRangeKm = 16000
        };

        private static readonly ModeProfile Business = new ModeProfile
        {
            BaseFeeDollars = 420, PerKmDollars = 0.38, CruiseKmh = 780,
            OverheadMinutes = 150, Comfort = 0.65, FameDelta = 0.5, MaxRangeKm = 16000
        };

        private static readonly ModeProfile First = new ModeProfile
        {
            BaseFeeDollars = 1100, PerKmDollars = 0.85, CruiseKmh = 780,
            OverheadMinutes = 130, Comfort = 0.85, FameDelta = 1.5, MaxRangeKm = 16000
        };

        private static readonly ModeProfile Charter = new ModeProfile
        {
            BaseFeeDollars = 9500, PerKmDollars = 4.10, CruiseKmh = 850,
            OverheadMinutes = 45, Comfort = 1.0, FameDelta = 6.0, MaxRangeKm = 12000
        };

        /// <summary>Owned aircraft: fuel, crew and handling only — no charter margin.</summary>
        private static readonly ModeProfile Owned = new ModeProfile
        {
            BaseFeeDollars = 1800, PerKmDollars = 1.15, CruiseKmh = 850,
            OverheadMinutes = 35, Comfort = 1.0, FameDelta = 8.0, MaxRangeKm = 12000
        };

        private static readonly ModeProfile Heli = new ModeProfile
        {
            BaseFeeDollars = 2400, PerKmDollars = 9.50, CruiseKmh = 240,
            OverheadMinutes = 20, Comfort = 0.7, FameDelta = 4.0, MaxRangeKm = 600
        };

        private static readonly ModeProfile Yacht = new ModeProfile
        {
            BaseFeeDollars = 14000, PerKmDollars = 6.20, CruiseKmh = 35,
            OverheadMinutes = 90, Comfort = 0.95, FameDelta = 9.0, MaxRangeKm = 5000
        };

        /// <summary>How strongly the destination's market multiplier moves the price.</summary>
        public const double MarketInfluence = 0.5;

        public TravelPricing Price(TravelPricingContext context)
        {
            ModeProfile profile = ProfileFor(context.Mode);
            double distanceKm = Math.Max(context.Route.DistanceKm, 0.0);

            double marketMultiplier = 1.0;
            if (context.Destination != null)
            {
                marketMultiplier = 1.0 + ((context.Destination.MarketMultiplier - 1.0) * MarketInfluence);
            }

            double dollars = (profile.BaseFeeDollars + (distanceKm * profile.PerKmDollars)) * marketMultiplier;

            int travelMinutes = (int)Math.Round(distanceKm / profile.CruiseKmh * 60.0, MidpointRounding.AwayFromZero);
            int totalMinutes = Math.Max(profile.OverheadMinutes + travelMinutes, 1);

            // Arriving somewhere that already pays attention amplifies the exposure.
            double fameDelta = profile.FameDelta * (context.Destination != null ? context.Destination.MarketMultiplier : 1.0);

            return new TravelPricing(Money.FromDollars(dollars), totalMinutes, profile.Comfort, fameDelta);
        }

        public double MaxRangeKm(TravelMode mode)
        {
            return ProfileFor(mode).MaxRangeKm;
        }

        private static ModeProfile ProfileFor(TravelMode mode)
        {
            switch (mode)
            {
                case TravelMode.GroundTransfer: return Ground;
                case TravelMode.CommercialEconomy: return Economy;
                case TravelMode.CommercialBusiness: return Business;
                case TravelMode.CommercialFirst: return First;
                case TravelMode.PrivateJetCharter: return Charter;
                case TravelMode.OwnedJet: return Owned;
                case TravelMode.Helicopter: return Heli;
                case TravelMode.Yacht: return Yacht;
                default: return Economy;
            }
        }
    }
}
