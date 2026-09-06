using System;
using System.Collections.Generic;
using Prive.Core;
using Prive.Vehicles;
using Prive.World;

namespace Prive.Dealership
{
    /// <summary>
    /// What kind of business a dealership is. Determines what it stocks, what it charges, and
    /// what it will take in part exchange.
    /// </summary>
    public enum DealershipTier
    {
        Budget = 0,
        Standard = 1,
        Luxury = 2,
        Exotic = 3,
        Collector = 4
    }

    /// <summary>
    /// Authored identity and commercial rules for one dealership.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>Contains nothing specific to any city.</b> A dealership knows the
    /// <see cref="WorldLocationId"/> it stands at and nothing else about the world; the same
    /// class, with different data, is a used-car lot in Vermillion Bay's industrial district
    /// or a collector house in Monaco. Location-specific behaviour comes from the location's
    /// own market multiplier, applied at valuation time.
    /// </para>
    /// <para>
    /// The buy/sell spread is where the player's profit comes from, and it is deliberately
    /// asymmetric per tier. A budget lot pays badly for a supercar because it cannot sell one;
    /// an exotic dealer pays well. That difference is the arbitrage the trading loop runs on,
    /// and it is data, not code.
    /// </para>
    /// </remarks>
    public sealed class DealershipDefinition
    {
        /// <summary>Penalty applied to a trade-in the dealership does not normally handle.</summary>
        public const double OutOfCategoryBuyPenalty = 0.72;

        public StableId Id { get; private set; }
        public string DisplayName { get; private set; }
        public WorldLocationId Location { get; private set; }
        public DealershipTier Tier { get; private set; }

        /// <summary>Categories this dealership stocks and buys at full rate.</summary>
        public IReadOnlyList<VehicleCategory> Categories { get; private set; }

        /// <summary>Fraction added to market value when selling to the player. 0.15 is +15%.</summary>
        public double Markup { get; private set; }

        /// <summary>Fraction of market value offered when buying from the player. 0.80 is -20%.</summary>
        public double BuyBackRate { get; private set; }

        /// <summary>How many vehicles the forecourt holds.</summary>
        public int StockCapacity { get; private set; }

        /// <summary>In-game days between inventory refreshes.</summary>
        public int RestockIntervalDays { get; private set; }

        public DealershipDefinition(StableId id, string displayName, WorldLocationId location,
                                    DealershipTier tier, IReadOnlyList<VehicleCategory> categories,
                                    double markup, double buyBackRate,
                                    int stockCapacity, int restockIntervalDays)
        {
            if (!id.IsValid) throw new ArgumentException("Dealership id is required", "id");
            if (markup < 0.0) throw new ArgumentOutOfRangeException("markup", "Markup cannot be negative.");
            if (buyBackRate <= 0.0 || buyBackRate > 1.0)
            {
                throw new ArgumentOutOfRangeException("buyBackRate", "Buy-back rate must be within (0, 1].");
            }
            if (stockCapacity < 1) throw new ArgumentOutOfRangeException("stockCapacity");
            if (restockIntervalDays < 1) throw new ArgumentOutOfRangeException("restockIntervalDays");

            Id = id;
            DisplayName = displayName ?? string.Empty;
            Location = location;
            Tier = tier;
            Categories = categories ?? new List<VehicleCategory>();
            Markup = markup;
            BuyBackRate = buyBackRate;
            StockCapacity = stockCapacity;
            RestockIntervalDays = restockIntervalDays;
        }

        public bool Handles(VehicleCategory category)
        {
            for (int i = 0; i < Categories.Count; i++)
            {
                if (Categories[i] == category) return true;
            }
            return false;
        }

        /// <summary>What the dealership asks for a vehicle worth <paramref name="marketValue"/>.</summary>
        public Money AskingPrice(Money marketValue)
        {
            return marketValue.Scale(1.0 + Markup);
        }

        /// <summary>
        /// What the dealership offers for a vehicle worth <paramref name="marketValue"/>,
        /// discounted further when the vehicle is outside its usual business.
        /// </summary>
        public Money OfferPrice(Money marketValue, VehicleCategory category)
        {
            double rate = Handles(category) ? BuyBackRate : BuyBackRate * OutOfCategoryBuyPenalty;
            return marketValue.Scale(rate);
        }

        public override string ToString() { return DisplayName + " (" + Tier + " @ " + Location + ")"; }
    }
}
