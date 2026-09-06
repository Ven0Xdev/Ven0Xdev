using Prive.Core;

namespace Prive.Social
{
    /// <summary>
    /// Being known is itself a wealth signal: people assume the recognisable are rich.
    /// </summary>
    /// <remarks>
    /// Shipped in Phase 1 as the first working <see cref="IObservedWealthSignal"/>, which
    /// keeps the blending path exercised before vehicles and wardrobe exist. Confidence
    /// scales with fame — at low fame almost nobody recognises the player, so the signal
    /// barely reads.
    /// </remarks>
    public sealed class FameWealthSignal : IObservedWealthSignal
    {
        /// <summary>Implied wealth at maximum fame.</summary>
        public static readonly Money WealthAtMaxFame = Money.FromDollars(40000000L);

        /// <summary>Implied wealth at the threshold of being recognised at all.</summary>
        public static readonly Money WealthAtMinFame = Money.FromDollars(50000L);

        public WealthSignalKind Kind { get { return WealthSignalKind.Fame; } }

        public ObservedWealthContribution Evaluate(ObservedWealthContext context)
        {
            double fameFraction = context.Fame / SocialStatus.MaxFame;
            if (fameFraction <= 0.0)
            {
                return new ObservedWealthContribution(Kind, Money.Zero, 0.0, 0.0);
            }

            // Fame converts to implied wealth super-linearly: the gap between "locally known"
            // and "internationally known" is far larger than the gap below it.
            double curved = fameFraction * fameFraction;

            double min = WealthAtMinFame.ToDouble();
            double max = WealthAtMaxFame.ToDouble();
            Money implied = Money.FromDollars(min + ((max - min) * curved));

            return new ObservedWealthContribution(
                Kind,
                implied,
                weight: 1.2,
                confidence: fameFraction);
        }
    }
}
