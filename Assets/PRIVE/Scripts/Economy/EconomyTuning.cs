using Prive.Core;

namespace Prive.Economy
{
    /// <summary>
    /// Progression targets and starting conditions, in one place.
    /// </summary>
    /// <remarks>
    /// <para>
    /// These are the numbers the whole economy is balanced against. They live here as named
    /// constants rather than scattered magic numbers so a tuning change is a one-line diff,
    /// and so the progression curve can be asserted by a regression test rather than judged
    /// by feel.
    /// </para>
    /// <para>
    /// PRIVÉ is single-player. The curve is tuned to feel generous but earned: reaching
    /// $1,000,000 is the point at which the luxury tier <em>opens</em>, not the end of the game.
    /// </para>
    /// </remarks>
    public static class EconomyTuning
    {
        // --- New game -----------------------------------------------------------
        public static readonly Money StartingCash = Money.FromDollars(1500L);
        public static readonly Money StartingBankBalance = Money.FromDollars(3500L);

        /// <summary>Total starting liquidity: $5,000.</summary>
        public static Money StartingLiquidity { get { return StartingCash + StartingBankBalance; } }

        // --- Progression milestones --------------------------------------------
        /// <summary>Early hustle. Should be reachable in well under an hour.</summary>
        public static readonly Money MilestoneEarly = Money.FromDollars(25000L);

        /// <summary>First real capital: the point where vehicle flipping becomes a business.</summary>
        public static readonly Money MilestoneEstablished = Money.FromDollars(100000L);

        /// <summary>Entry to the luxury tier — the beginning of the fantasy, not the end.</summary>
        public static readonly Money MilestoneLuxury = Money.FromDollars(1000000L);

        public static readonly Money MilestoneElite = Money.FromDollars(10000000L);
        public static readonly Money MilestoneMogul = Money.FromDollars(100000000L);
        public static readonly Money MilestoneBillionaire = Money.FromDollars(1000000000L);

        // --- Pacing targets (hours of effective play, used by balance tests) -----
        public const double TargetHoursToEarly = 0.75;
        public const double TargetHoursToEstablished = 2.5;
        public const double TargetHoursToLuxury = 8.0;

        /// <summary>How far a milestone estimate may drift before the balance test fails.</summary>
        public const double PacingTolerance = 0.35;

        // --- Baseline living costs ----------------------------------------------
        /// <summary>Charged daily so the player always has a reason to keep earning.</summary>
        public static readonly Money DefaultDailyLivingCost = Money.FromDollars(120L);

        /// <summary>Ordered milestones, ascending. Used for progression UI and tests.</summary>
        public static Money[] Milestones
        {
            get
            {
                return new[]
                {
                    MilestoneEarly,
                    MilestoneEstablished,
                    MilestoneLuxury,
                    MilestoneElite,
                    MilestoneMogul,
                    MilestoneBillionaire
                };
            }
        }
    }
}
