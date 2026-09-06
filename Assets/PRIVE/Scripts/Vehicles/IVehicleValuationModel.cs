using Prive.Core;

namespace Prive.Vehicles
{
    /// <summary>Everything a valuation is allowed to consider.</summary>
    public readonly struct VehicleValuationContext
    {
        public readonly VehicleDefinition Definition;
        public readonly VehicleInstance Instance;
        public readonly GameTime Now;

        /// <summary>Local market multiplier, 1.0 being the baseline city.</summary>
        public readonly double MarketMultiplier;

        public VehicleValuationContext(VehicleDefinition definition, VehicleInstance instance,
                                       GameTime now, double marketMultiplier = 1.0)
        {
            Definition = definition;
            Instance = instance;
            Now = now;
            MarketMultiplier = marketMultiplier <= 0.0 ? 1.0 : marketMultiplier;
        }
    }

    /// <summary>Component factors behind a valuation, for the phone's vehicle screen and tests.</summary>
    public readonly struct VehicleValuationBreakdown
    {
        public readonly Money BasePrice;
        public readonly double ConditionFactor;
        public readonly double MileageFactor;
        public readonly double AgeFactor;
        public readonly double RarityFactor;
        public readonly double MarketFactor;
        public readonly Money Value;

        public VehicleValuationBreakdown(Money basePrice, double conditionFactor, double mileageFactor,
                                         double ageFactor, double rarityFactor, double marketFactor, Money value)
        {
            BasePrice = basePrice;
            ConditionFactor = conditionFactor;
            MileageFactor = mileageFactor;
            AgeFactor = ageFactor;
            RarityFactor = rarityFactor;
            MarketFactor = marketFactor;
            Value = value;
        }
    }

    /// <summary>
    /// Prices a specific vehicle.
    /// </summary>
    /// <remarks>
    /// Injected rather than hardcoded so the whole valuation curve is tunable, and so
    /// dealerships, insurance and auctions can later apply their own models without any of
    /// them re-implementing depreciation.
    /// </remarks>
    public interface IVehicleValuationModel
    {
        Money Value(VehicleValuationContext context);

        VehicleValuationBreakdown Explain(VehicleValuationContext context);
    }
}
