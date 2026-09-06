using System.Collections.Generic;
using Prive.Core;

namespace Prive.Economy
{
    /// <summary>One valued thing the player owns, for the net worth breakdown.</summary>
    public readonly struct AssetValuation
    {
        public readonly StableId Id;
        public readonly AssetCategory Category;
        public readonly string DisplayName;
        public readonly Money Value;

        public AssetValuation(StableId id, AssetCategory category, string displayName, Money value)
        {
            Id = id;
            Category = category;
            DisplayName = displayName;
            Value = value;
        }

        public override string ToString() { return DisplayName + ": " + Value; }
    }

    /// <summary>One thing the player owes.</summary>
    public readonly struct LiabilityRecord
    {
        public readonly StableId Id;
        public readonly LiabilityCategory Category;
        public readonly string DisplayName;
        public readonly Money OutstandingBalance;

        public LiabilityRecord(StableId id, LiabilityCategory category, string displayName, Money outstandingBalance)
        {
            Id = id;
            Category = category;
            DisplayName = displayName;
            OutstandingBalance = outstandingBalance;
        }

        public override string ToString() { return DisplayName + ": " + OutstandingBalance; }
    }

    /// <summary>
    /// Implemented by any system that owns things worth money — vehicles, properties,
    /// businesses, investments, collectibles.
    /// </summary>
    /// <remarks>
    /// This is the seam that keeps <see cref="NetWorthService"/> from ever needing to know
    /// what a car is. Content systems register themselves; the aggregator is never edited.
    /// </remarks>
    public interface IAssetValueProvider
    {
        AssetCategory Category { get; }

        /// <summary>Total current value of everything this provider owns.</summary>
        Money GetTotalValue();

        /// <summary>Per-item breakdown for the phone's asset screens. May be empty.</summary>
        IEnumerable<AssetValuation> GetValuations();
    }

    /// <summary>Implemented by any system that creates debt — loans, mortgages, credit, tax.</summary>
    public interface ILiabilityProvider
    {
        Money GetOutstandingTotal();
        IEnumerable<LiabilityRecord> GetLiabilities();
    }
}
