using System;

namespace Prive.Vehicles
{
    /// <summary>
    /// How impressive a specific vehicle is to look at, 0–100.
    /// </summary>
    /// <remarks>
    /// Distinct from value, and deliberately so. A pristine classic can be worth less than a
    /// new luxury SUV and still command far more attention; a supercar with visible damage
    /// reads as a story rather than as success. Prestige drives the social layer; valuation
    /// drives the balance sheet. They are allowed to disagree.
    /// </remarks>
    public static class VehiclePrestige
    {
        /// <summary>How much a battered example loses relative to a pristine one.</summary>
        public const double ConditionInfluence = 0.35;

        /// <summary>Prestige added at the top rarity tier.</summary>
        public const double MaxRarityBonus = 18.0;

        public static double Evaluate(VehicleDefinition definition, VehicleInstance instance)
        {
            if (definition == null) return 0.0;

            double conditionValue = instance != null ? instance.Condition.Value : 1.0;

            // Condition scales prestige but never erases it: a scruffy hypercar is still a
            // hypercar.
            double conditionScale = (1.0 - ConditionInfluence) + (ConditionInfluence * conditionValue);

            double rarityBonus = RarityBonus(definition.Rarity);

            return Clamp((definition.BasePrestige * conditionScale) + rarityBonus, 0.0, 100.0);
        }

        /// <summary>
        /// How readable the vehicle is at a glance, 0–1 — how likely a passer-by is to know
        /// what they are looking at. Feeds observed-wealth confidence.
        /// </summary>
        public static double Recognisability(VehicleDefinition definition)
        {
            if (definition == null) return 0.0;

            // Prestige is the dominant term: a hypercar stops traffic whether or not anyone
            // can name it. Rarity adds a little for the enthusiasts.
            double fromPrestige = definition.BasePrestige / 100.0;
            double fromRarity = (int)definition.Rarity / (double)VehicleRarity.Exotic * 0.2;

            return Clamp(fromPrestige * 0.85 + fromRarity, 0.0, 1.0);
        }

        private static double RarityBonus(VehicleRarity rarity)
        {
            return (int)rarity / (double)VehicleRarity.Exotic * MaxRarityBonus;
        }

        private static double Clamp(double value, double min, double max)
        {
            if (double.IsNaN(value)) return min;
            return value < min ? min : (value > max ? max : value);
        }
    }
}
