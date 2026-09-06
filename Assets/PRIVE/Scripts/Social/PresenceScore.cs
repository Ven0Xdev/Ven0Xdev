using System;
using Prive.Core;
using Prive.World;

namespace Prive.Social
{
    /// <summary>
    /// How much the player commands attention right now, 0–1000.
    /// </summary>
    /// <remarks>
    /// <para>
    /// The single number the NPC reaction system consumes. It folds together what the player
    /// appears to be worth, how recognisable they are, whether they read as belonging where
    /// they are, and whether being recognised is currently a good thing.
    /// </para>
    /// <para>
    /// Context matters as much as wealth. Arriving at an elite marina club in a modest car
    /// scores <em>lower</em> than arriving in the same car in the suburbs — being out of place
    /// cuts both ways, and that asymmetry is what makes moving up the districts feel like
    /// progress.
    /// </para>
    /// </remarks>
    public static class PresenceScore
    {
        public const double MaxScore = 1000.0;

        /// <summary>Observed wealth mapped to 0 at this value.</summary>
        public const double WealthFloorDollars = 1000.0;

        /// <summary>Observed wealth mapped to 1 at this value.</summary>
        public const double WealthCeilingDollars = 100000000.0;

        // Component weights. They sum to 1.0 before the context modifier is applied.
        private const double WealthWeight = 0.50;
        private const double FameWeight = 0.30;
        private const double LifestyleWeight = 0.20;

        /// <summary>Computes the presence score for a moment.</summary>
        public static double Evaluate(Money observedWealth, double fame, double reputation,
                                      double lifestyleScore, PrestigeTier locationPrestige)
        {
            double wealthTerm = NormalizeWealth(observedWealth);
            double fameTerm = Clamp01(fame / SocialStatus.MaxFame);
            double lifestyleTerm = Clamp01(lifestyleScore / SocialStatus.MaxLifestyle);

            double baseScore = (wealthTerm * WealthWeight)
                               + (fameTerm * FameWeight)
                               + (lifestyleTerm * LifestyleWeight);

            double contextModifier = ContextFit(wealthTerm, locationPrestige);

            // Reputation shifts presence by up to ±15%: notoriety still turns heads, but
            // being disliked costs the player deference.
            double reputationModifier = 1.0 + (Clamp(reputation, SocialStatus.MinReputation, SocialStatus.MaxReputation) / 100.0 * 0.15);

            return Clamp(baseScore * contextModifier * reputationModifier * MaxScore, 0.0, MaxScore);
        }

        /// <summary>Maps observed wealth onto 0–1 logarithmically.</summary>
        /// <remarks>
        /// Linear mapping would make every value below a few million indistinguishable.
        /// Perception is roughly logarithmic — the step from $10k to $100k reads as large as
        /// the step from $1M to $10M.
        /// </remarks>
        public static double NormalizeWealth(Money observedWealth)
        {
            double dollars = observedWealth.ToDouble();
            if (dollars <= WealthFloorDollars) return 0.0;
            if (dollars >= WealthCeilingDollars) return 1.0;

            double logFloor = Math.Log10(WealthFloorDollars);
            double logCeiling = Math.Log10(WealthCeilingDollars);

            return (Math.Log10(dollars) - logFloor) / (logCeiling - logFloor);
        }

        /// <summary>
        /// How well the player's apparent standing matches where they are: 0.75 when badly
        /// out of place, up to 1.15 when they are the most impressive thing in the room.
        /// </summary>
        public static double ContextFit(double normalizedWealth, PrestigeTier locationPrestige)
        {
            // Location prestige 1–5 mapped to the wealth fraction a place expects.
            double expected = ((int)locationPrestige - 1) / 4.0;
            double difference = normalizedWealth - expected;

            if (difference >= 0.0)
            {
                // Standing out upward, with diminishing returns.
                return 1.0 + Math.Min(difference, 0.5) * 0.30;
            }

            // Underdressed for the room: attention falls away.
            return 1.0 + Math.Max(difference, -0.5) * 0.50;
        }

        private static double Clamp01(double value) { return Clamp(value, 0.0, 1.0); }

        private static double Clamp(double value, double min, double max)
        {
            if (double.IsNaN(value)) return min;
            return value < min ? min : (value > max ? max : value);
        }
    }
}
