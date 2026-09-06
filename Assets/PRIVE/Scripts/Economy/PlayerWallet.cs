using Prive.Core;

namespace Prive.Economy
{
    /// <summary>
    /// Holds liquid funds and enforces the rules for moving them.
    /// </summary>
    /// <remarks>
    /// Deliberately silent: no events, no ledger, no clock. It is a value holder with
    /// invariants, which makes it trivially testable. <see cref="PlayerEconomy"/> owns the
    /// cross-cutting concerns.
    /// </remarks>
    public sealed class PlayerWallet
    {
        public PlayerWallet(Money cash = default(Money), Money bankBalance = default(Money))
        {
            Cash = cash;
            BankBalance = bankBalance;
        }

        public Money Cash { get; private set; }

        /// <summary>May go negative only through an overdraft the credit system authorises.</summary>
        public Money BankBalance { get; private set; }

        /// <summary>Everything immediately spendable.</summary>
        public Money Total { get { return Cash + BankBalance; } }

        /// <summary>What is available from a given source.</summary>
        public Money AvailableFrom(PaymentSource source)
        {
            switch (source)
            {
                case PaymentSource.Cash: return Cash;
                case PaymentSource.Bank: return BankBalance;
                default: return Total;
            }
        }

        public bool CanAfford(Money amount, PaymentSource source = PaymentSource.Any)
        {
            return AvailableFrom(source) >= amount;
        }

        /// <summary>
        /// Deducts <paramref name="amount"/>, drawing from the bank first when the source is
        /// <see cref="PaymentSource.Any"/> — players expect their cash to be what they carry.
        /// </summary>
        public OperationResult Pay(Money amount, PaymentSource source = PaymentSource.Any)
        {
            if (amount.IsNegative)
            {
                return OperationResult.Failure(FailureReason.InvalidArgument, "Payment amount cannot be negative.");
            }

            if (amount.IsZero) return OperationResult.Success();

            if (!CanAfford(amount, source))
            {
                return OperationResult.Failure(FailureReason.InsufficientFunds,
                    "Needs " + amount + " but only " + AvailableFrom(source) + " is available.");
            }

            switch (source)
            {
                case PaymentSource.Cash:
                    Cash -= amount;
                    break;

                case PaymentSource.Bank:
                    BankBalance -= amount;
                    break;

                default:
                    Money fromBank = Money.Min(amount, Money.Max(BankBalance, Money.Zero));
                    BankBalance -= fromBank;
                    Cash -= (amount - fromBank);
                    break;
            }

            return OperationResult.Success();
        }

        /// <summary>Adds <paramref name="amount"/> to the chosen destination.</summary>
        public OperationResult Receive(Money amount, PaymentSource destination = PaymentSource.Bank)
        {
            if (amount.IsNegative)
            {
                return OperationResult.Failure(FailureReason.InvalidArgument, "Received amount cannot be negative.");
            }

            if (destination == PaymentSource.Cash) Cash += amount;
            else BankBalance += amount;

            return OperationResult.Success();
        }

        /// <summary>Moves cash into the bank.</summary>
        public OperationResult Deposit(Money amount)
        {
            if (amount.IsNegative) return OperationResult.Failure(FailureReason.InvalidArgument, "Deposit cannot be negative.");
            if (Cash < amount) return OperationResult.Failure(FailureReason.InsufficientFunds, "Not enough cash on hand.");

            Cash -= amount;
            BankBalance += amount;
            return OperationResult.Success();
        }

        /// <summary>Moves bank funds into cash.</summary>
        public OperationResult Withdraw(Money amount)
        {
            if (amount.IsNegative) return OperationResult.Failure(FailureReason.InvalidArgument, "Withdrawal cannot be negative.");
            if (BankBalance < amount) return OperationResult.Failure(FailureReason.InsufficientFunds, "Not enough in the bank.");

            BankBalance -= amount;
            Cash += amount;
            return OperationResult.Success();
        }

        /// <summary>
        /// Forces balances directly. Loading a save and debug tooling only — it bypasses
        /// every invariant above, which is exactly why it is named this way.
        /// </summary>
        public void RestoreBalances(Money cash, Money bankBalance)
        {
            Cash = cash;
            BankBalance = bankBalance;
        }

        public override string ToString()
        {
            return "Cash " + Cash + " / Bank " + BankBalance;
        }
    }
}
