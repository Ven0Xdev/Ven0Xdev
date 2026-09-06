using Prive.Core;

namespace Prive.Economy
{
    /// <summary>Published whenever cash or bank balance changes.</summary>
    /// <remarks>
    /// UI binds to this. No screen may read a balance field directly — that is how two
    /// widgets end up disagreeing about how much money the player has.
    /// </remarks>
    public readonly struct MoneyChangedEvent
    {
        public readonly Money Cash;
        public readonly Money BankBalance;
        public readonly Money Delta;

        public MoneyChangedEvent(Money cash, Money bankBalance, Money delta)
        {
            Cash = cash;
            BankBalance = bankBalance;
            Delta = delta;
        }

        public Money Total { get { return Cash + BankBalance; } }
    }

    /// <summary>Published for every recorded transaction.</summary>
    public readonly struct TransactionRecordedEvent
    {
        public readonly TransactionRecord Record;
        public TransactionRecordedEvent(TransactionRecord record) { Record = record; }
    }

    /// <summary>Published when recalculated net worth differs from the previous value.</summary>
    public readonly struct NetWorthChangedEvent
    {
        public readonly Money Previous;
        public readonly Money Current;

        public NetWorthChangedEvent(Money previous, Money current)
        {
            Previous = previous;
            Current = current;
        }

        public Money Delta { get { return Current - Previous; } }
    }

    /// <summary>
    /// Published when a payment fails for lack of funds, so UI can react without every
    /// caller writing its own "you cannot afford this" handling.
    /// </summary>
    public readonly struct PaymentDeclinedEvent
    {
        public readonly Money Requested;
        public readonly Money Available;
        public readonly TransactionCategory Category;
        public readonly string Description;

        public PaymentDeclinedEvent(Money requested, Money available, TransactionCategory category, string description)
        {
            Requested = requested;
            Available = available;
            Category = category;
            Description = description;
        }
    }
}
