using System;
using Prive.Core;

namespace Prive.Vehicles
{
    /// <summary>
    /// Authored data for a vehicle model: everything shared by every example of it.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Immutable and engine-free. In the Editor these are authored as <c>ScriptableObject</c>s
    /// and projected into this form at load, so the simulation never holds an asset reference
    /// and every definition is comparable, serialisable and testable.
    /// </para>
    /// <para>
    /// Brands are fictional. Prestige and rarity are authored deliberately rather than derived
    /// from price, because they are not the same thing: a well-kept classic can be worth less
    /// than a new SUV and still turn far more heads.
    /// </para>
    /// </remarks>
    public sealed class VehicleDefinition
    {
        public VehicleDefinitionId Id { get; private set; }

        /// <summary>Fictional manufacturer, e.g. "Aurelian".</summary>
        public string Brand { get; private set; }

        /// <summary>Model name, e.g. "Meridian".</summary>
        public string Model { get; private set; }

        public VehicleCategory Category { get; private set; }
        public VehicleRarity Rarity { get; private set; }

        /// <summary>Price as new, in perfect condition, in a baseline market.</summary>
        public Money BasePrice { get; private set; }

        /// <summary>
        /// How impressive this model is to onlookers, 0–100, independent of its price.
        /// </summary>
        public double BasePrestige { get; private set; }

        /// <summary>
        /// Kilometres this model is expected to cover before mileage stops mattering much.
        /// Exotics have low expected lifetimes: 60,000 km on a hypercar is ruinous, on a
        /// hatchback it is barely worth mentioning.
        /// </summary>
        public int ExpectedLifetimeKm { get; private set; }

        /// <summary>
        /// Fraction of value gained (positive) or lost (negative) per year, before condition
        /// and mileage. Ordinary cars depreciate; genuine collector pieces appreciate.
        /// </summary>
        public double AnnualValueRate { get; private set; }

        /// <summary>Garage slots consumed. Limousines take more room than a hatchback.</summary>
        public int GarageSlots { get; private set; }

        public int SeatCount { get; private set; }
        public int TopSpeedKph { get; private set; }

        public VehicleDefinition(VehicleDefinitionId id, string brand, string model,
                                 VehicleCategory category, VehicleRarity rarity,
                                 Money basePrice, double basePrestige, int expectedLifetimeKm,
                                 double annualValueRate, int garageSlots = 1,
                                 int seatCount = 4, int topSpeedKph = 200)
        {
            if (!id.IsValid) throw new ArgumentException("Vehicle definition id is required", "id");
            if (!basePrice.IsPositive) throw new ArgumentException("Base price must be positive", "basePrice");
            if (expectedLifetimeKm <= 0) throw new ArgumentOutOfRangeException("expectedLifetimeKm");
            if (garageSlots < 1) throw new ArgumentOutOfRangeException("garageSlots");

            Id = id;
            Brand = brand ?? string.Empty;
            Model = model ?? string.Empty;
            Category = category;
            Rarity = rarity;
            BasePrice = basePrice;
            BasePrestige = Clamp(basePrestige, 0.0, 100.0);
            ExpectedLifetimeKm = expectedLifetimeKm;
            AnnualValueRate = annualValueRate;
            GarageSlots = garageSlots;
            SeatCount = seatCount;
            TopSpeedKph = topSpeedKph;
        }

        /// <summary>e.g. "Aurelian Meridian".</summary>
        public string DisplayName { get { return (Brand + " " + Model).Trim(); } }

        /// <summary>True for the categories that appreciate rather than depreciate.</summary>
        public bool IsCollectible
        {
            get { return Category == VehicleCategory.Classic || Category == VehicleCategory.RareCollector; }
        }

        private static double Clamp(double value, double min, double max)
        {
            if (double.IsNaN(value)) return min;
            return value < min ? min : (value > max ? max : value);
        }

        public override string ToString() { return DisplayName + " (" + Category + ")"; }
    }
}
