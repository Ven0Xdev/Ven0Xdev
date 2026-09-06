using Prive.Core;
using Prive.World;

namespace Prive.Social
{
    /// <summary>
    /// What an observer can infer about the player from a single signal.
    /// </summary>
    /// <remarks>
    /// <see cref="Confidence"/> is how strongly the signal reads at a glance, and
    /// <see cref="Weight"/> is how much that class of signal matters socially. A rare
    /// hypercar is high on both; a discreet watch is high weight but low confidence, because
    /// most people will not notice it.
    /// </remarks>
    public readonly struct ObservedWealthContribution
    {
        public readonly WealthSignalKind Kind;

        /// <summary>The wealth this signal alone would suggest.</summary>
        public readonly Money ImpliedWealth;

        /// <summary>Relative social importance of this signal class. Typically 0–2.</summary>
        public readonly double Weight;

        /// <summary>How readable the signal is right now. 0–1.</summary>
        public readonly double Confidence;

        public ObservedWealthContribution(WealthSignalKind kind, Money impliedWealth, double weight, double confidence)
        {
            Kind = kind;
            ImpliedWealth = impliedWealth;
            Weight = weight < 0.0 ? 0.0 : weight;
            Confidence = confidence < 0.0 ? 0.0 : (confidence > 1.0 ? 1.0 : confidence);
        }

        /// <summary>Combined influence of this contribution on the blend.</summary>
        public double EffectiveWeight { get { return Weight * Confidence; } }

        public bool IsMeaningful { get { return EffectiveWeight > 0.0 && ImpliedWealth.IsPositive; } }
    }

    /// <summary>
    /// What signals are allowed to know about the player.
    /// </summary>
    /// <remarks>
    /// <b>Note what is absent: actual net worth and bank balance.</b> That omission is the
    /// whole design. NPCs cannot see the player's finances, so no signal can accidentally
    /// leak them into the world's perception.
    /// </remarks>
    public readonly struct ObservedWealthContext
    {
        public readonly WorldLocationId Location;
        public readonly PrestigeTier LocationPrestige;
        public readonly GameTime Now;
        public readonly double Fame;
        public readonly double Reputation;
        public readonly double LifestyleScore;

        public ObservedWealthContext(WorldLocationId location, PrestigeTier locationPrestige, GameTime now,
                                     double fame, double reputation, double lifestyleScore)
        {
            Location = location;
            LocationPrestige = locationPrestige;
            Now = now;
            Fame = fame;
            Reputation = reputation;
            LifestyleScore = lifestyleScore;
        }
    }

    /// <summary>
    /// Implemented by anything the world can see and price — vehicle, outfit, watch,
    /// jewellery, residence, known businesses, social media presence.
    /// </summary>
    /// <remarks>
    /// Content systems register signals with <see cref="ObservedWealthCalculator"/>; the
    /// calculator never learns what a watch is.
    /// </remarks>
    public interface IObservedWealthSignal
    {
        WealthSignalKind Kind { get; }

        /// <summary>
        /// Evaluates this signal. Return a contribution with zero weight when the signal has
        /// nothing to say right now (no car present, nothing worn).
        /// </summary>
        ObservedWealthContribution Evaluate(ObservedWealthContext context);
    }
}
