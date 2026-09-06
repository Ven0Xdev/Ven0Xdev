using Prive.Core;

namespace Prive.Economy
{
    /// <summary>A single immutable movement of money.</summary>
    /// <remarks>
    /// <see cref="Amount"/> is signed from the player's perspective: positive is income,
    /// negative is spending. Keeping the sign in the amount rather than in a separate flag
    /// means summing a filtered list is always correct.
    /// </remarks>
    public readonly struct TransactionRecord
    {
        public readonly long Sequence;
        public readonly GameTime At;
        public readonly Money Amount;
        public readonly TransactionCategory Category;
        public readonly PaymentSource Source;
        public readonly string Description;

        /// <summary>Balance (cash + bank) immediately after this transaction.</summary>
        public readonly Money BalanceAfter;

        public TransactionRecord(long sequence, GameTime at, Money amount, TransactionCategory category,
                                 PaymentSource source, string description, Money balanceAfter)
        {
            Sequence = sequence;
            At = at;
            Amount = amount;
            Category = category;
            Source = source;
            Description = description;
            BalanceAfter = balanceAfter;
        }

        public bool IsIncome { get { return Amount.IsPositive; } }
        public bool IsExpense { get { return Amount.IsNegative; } }

        public override string ToString()
        {
            return At + "  " + (Amount.IsPositive ? "+" : "") + Amount + "  " + Category + "  " + Description;
        }
    }
}
