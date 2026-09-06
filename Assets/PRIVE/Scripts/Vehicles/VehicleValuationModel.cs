using System;
using Prive.Core;

namespace Prive.Vehicles
{
    /// <summary>
    /// Default valuation: <c>base × wear(condition, mileage, age) × market</c>, where rarity
    /// governs how much of the wear actually bites.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Multiplicative rather than additive, so the factors compose the way intuition expects:
    /// a hypercar in poor condition with high mileage is punished twice, and correctly so.
    /// </para>
    /// <para>
    /// Every constant is named. The curves are deliberately different per category through
    /// <see cref="VehicleDefinition.ExpectedLifetimeKm"/> and
    /// <see cref="VehicleDefinition.AnnualValueRate"/> rather than through branching on
    /// category here — which is what lets a new category ship as data.
    /// </para>
    /// </remarks>
    public sealed class VehicleValuationModel : IVehicleValuationModel
    {
        /// <summary>Value retained by a scrap-condition vehicle. Parts are still worth something.</summary>
        public const double MinimumConditionFactor = 0.25;

        /// <summary>Value retained once a vehicle has covered its full expected lifetime.</summary>
        public const double MinimumMileageFactor = 0.35;

        /// <summary>Nothing is ever worth less than this fraction of its base price.</summary>
        public const double AbsoluteFloorFactor = 0.05;

        /// <summary>Cap on appreciation, so a collector piece cannot inflate without limit.</summary>
        public const double MaximumAgeFactor = 4.0;

        public Money Value(VehicleValuationContext context)
        {
            return Explain(context).Value;
        }

        public VehicleValuationBreakdown Explain(VehicleValuationContext context)
        {
            VehicleDefinition definition = context.Definition;
            VehicleInstance instance = context.Instance;

            if (definition == null || instance == null)
            {
                return new VehicleValuationBreakdown(Money.Zero, 0, 0, 0, 0, 0, Money.Zero);
            }

            double condition = ConditionFactor(instance.Condition);
            double mileage = MileageFactor(instance.OdometerKm, definition.ExpectedLifetimeKm);
            double age = AgeFactor(definition, instance, context.Now);
            double rarity = RarityFactor(definition.Rarity);
            double market = context.MarketMultiplier;

            double intrinsic = ApplyRarity(condition * mileage * age, rarity);

            Money value = definition.BasePrice.Scale(intrinsic * market);
            Money floor = definition.BasePrice.Scale(AbsoluteFloorFactor);
            if (value < floor) value = floor;

            return new VehicleValuationBreakdown(definition.BasePrice, condition, mileage, age, rarity, market, value);
        }

        /// <summary>Condition maps linearly onto <see cref="MinimumConditionFactor"/>–1.</summary>
        public static double ConditionFactor(VehicleCondition condition)
        {
            return MinimumConditionFactor + ((1.0 - MinimumConditionFactor) * condition.Value);
        }

        /// <summary>
        /// Mileage costs value fastest at the start — the first 10,000 km hurt far more than
        /// the tenth — and flattens out once the vehicle is simply "high mileage".
        /// </summary>
        public static double MileageFactor(int odometerKm, int expectedLifetimeKm)
        {
            if (expectedLifetimeKm <= 0) return 1.0;

            double used = odometerKm / (double)expectedLifetimeKm;
            if (used <= 0.0) return 1.0;
            if (used >= 1.0) return MinimumMileageFactor;

            // Square-root curve: steep early, shallow later.
            double loss = (1.0 - MinimumMileageFactor) * Math.Sqrt(used);
            return 1.0 - loss;
        }

        /// <summary>
        /// Compound annual change since purchase. Negative rates depreciate, positive rates
        /// appreciate; both compound, which is why a collector car pulls away over time.
        /// </summary>
        public static double AgeFactor(VehicleDefinition definition, VehicleInstance instance, GameTime now)
        {
            double years = (now.TotalMinutes - instance.PurchasedAt.TotalMinutes)
                           / (double)(GameTime.MinutesPerDay * 365);

            if (years <= 0.0) return 1.0;

            double factor = Math.Pow(1.0 + definition.AnnualValueRate, years);
            if (factor > MaximumAgeFactor) factor = MaximumAgeFactor;
            if (factor < 0.0) factor = 0.0;

            return factor;
        }

        /// <summary>
        /// Combines the wear factors with scarcity.
        /// </summary>
        /// <remarks>
        /// <para>
        /// Rarity resists <em>loss</em> rather than adding a flat premium, and the distinction
        /// matters. As an outright multiplier it made a brand-new rare car worth more than the
        /// price on its windscreen the moment it was bought — free money for anyone who could
        /// find one at list price, and a valuation that contradicted
        /// <see cref="VehicleDefinition.BasePrice"/>'s own definition.
        /// </para>
        /// <para>
        /// Framed as resistance, scarcity does what it does in reality: an exotic and a
        /// hatchback both start at their list price, and the exotic is worth far more five
        /// years later. Appreciation passes through untouched, so a collector car still climbs
        /// at its authored rate.
        /// </para>
        /// </remarks>
        public static double ApplyRarity(double wearFactor, double rarity)
        {
            if (wearFactor >= 1.0) return wearFactor;

            double loss = 1.0 - wearFactor;
            double retained = 1.0 - (loss * rarity);

            return retained < 0.0 ? 0.0 : retained;
        }

        /// <summary>
        /// How much of the usual loss a vehicle actually suffers. Common cars take all of it;
        /// exotics take barely half.
        /// </summary>
        public static double RarityFactor(VehicleRarity rarity)
        {
            switch (rarity)
            {
                case VehicleRarity.Common: return 1.00;
                case VehicleRarity.Uncommon: return 0.92;
                case VehicleRarity.Rare: return 0.80;
                case VehicleRarity.VeryRare: return 0.68;
                case VehicleRarity.Exotic: return 0.55;
                default: return 1.00;
            }
        }
    }
}
