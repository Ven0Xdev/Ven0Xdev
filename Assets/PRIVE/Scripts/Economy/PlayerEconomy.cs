using System;
using Prive.Core;
using Prive.Save;

namespace Prive.Economy
{
    /// <summary>
    /// The player's financial state and the only sanctioned way to move their money.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Every dollar that enters or leaves the player's control passes through here, which is
    /// what guarantees the ledger, the balance events and net worth can never disagree.
    /// Systems must never mutate <see cref="Wallet"/> directly.
    /// </para>
    /// <para>
    /// Failure is a return value, not an exception: being unable to afford a car is an
    /// expected gameplay outcome.
    /// </para>
    /// </remarks>
    public sealed class PlayerEconomy : ISaveable
    {
        public const string SaveNodeKey = "economy";

        /// <summary>How many recent transactions are persisted. The rest are display-only history.</summary>
        public const int PersistedTransactionCount = 100;

        private readonly IEventBus _bus;
        private readonly IGameClock _clock;

        public PlayerEconomy(IEventBus bus, IGameClock clock, PlayerWallet wallet = null, TransactionLedger ledger = null)
        {
            if (bus == null) throw new ArgumentNullException("bus");
            if (clock == null) throw new ArgumentNullException("clock");

            _bus = bus;
            _clock = clock;
            Wallet = wallet ?? new PlayerWallet(EconomyTuning.StartingCash, EconomyTuning.StartingBankBalance);
            Ledger = ledger ?? new TransactionLedger();
            NetWorth = new NetWorthService(Wallet, bus);
        }

        public PlayerWallet Wallet { get; private set; }
        public TransactionLedger Ledger { get; private set; }
        public NetWorthService NetWorth { get; private set; }

        public Money Cash { get { return Wallet.Cash; } }
        public Money BankBalance { get { return Wallet.BankBalance; } }
        public Money LiquidTotal { get { return Wallet.Total; } }

        public bool CanAfford(Money amount, PaymentSource source = PaymentSource.Any)
        {
            return Wallet.CanAfford(amount, source);
        }

        /// <summary>
        /// Attempts a payment. On success the money moves, a transaction is recorded and
        /// balance events fire. On failure nothing changes and
        /// <see cref="PaymentDeclinedEvent"/> is published.
        /// </summary>
        public OperationResult TryPay(Money amount, TransactionCategory category, string description,
                                      PaymentSource source = PaymentSource.Any)
        {
            OperationResult result = Wallet.Pay(amount, source);

            if (result.IsFailure)
            {
                if (result.Reason == FailureReason.InsufficientFunds)
                {
                    _bus.Publish(new PaymentDeclinedEvent(amount, Wallet.AvailableFrom(source), category, description));
                }
                return result;
            }

            CommitChange(-amount, category, source, description);
            return OperationResult.Success();
        }

        /// <summary>
        /// Deducts money even when the balance will not cover it, overdrawing the bank.
        /// </summary>
        /// <remarks>
        /// Reserved for obligations the player cannot decline — rent, loan interest, fines,
        /// tax. Ordinary purchases must use <see cref="TryPay"/>.
        /// </remarks>
        public void Charge(Money amount, TransactionCategory category, string description)
        {
            if (amount.IsNegative) throw new ArgumentOutOfRangeException("amount", "Charge amount cannot be negative.");
            if (amount.IsZero) return;

            OperationResult result = Wallet.Pay(amount, PaymentSource.Any);

            if (result.IsFailure)
            {
                // Forced obligation: take what is there and let the bank go negative. The
                // debt systems act on that overdraft rather than the payment silently failing.
                Money cash = Wallet.Cash;
                Money fromCash = Money.Min(amount, Money.Max(cash, Money.Zero));
                Wallet.RestoreBalances(cash - fromCash, Wallet.BankBalance - (amount - fromCash));
            }

            CommitChange(-amount, category, PaymentSource.Any, description);
        }

        /// <summary>Credits money to the player.</summary>
        public void Receive(Money amount, TransactionCategory category, string description,
                            PaymentSource destination = PaymentSource.Bank)
        {
            if (amount.IsNegative) throw new ArgumentOutOfRangeException("amount", "Received amount cannot be negative.");
            if (amount.IsZero) return;

            Wallet.Receive(amount, destination);
            CommitChange(amount, category, destination, description);
        }

        /// <summary>Moves cash into the bank. Recorded as a transfer, not as income.</summary>
        public OperationResult Deposit(Money amount)
        {
            OperationResult result = Wallet.Deposit(amount);
            if (result.IsSuccess) PublishBalances(Money.Zero);
            return result;
        }

        /// <summary>Moves bank funds into cash. Recorded as a transfer, not as spending.</summary>
        public OperationResult Withdraw(Money amount)
        {
            OperationResult result = Wallet.Withdraw(amount);
            if (result.IsSuccess) PublishBalances(Money.Zero);
            return result;
        }

        private void CommitChange(Money delta, TransactionCategory category, PaymentSource source, string description)
        {
            TransactionRecord record = Ledger.Record(
                _clock.Now, delta, category, source, description, Wallet.Total);

            PublishBalances(delta);
            _bus.Publish(new TransactionRecordedEvent(record));
            NetWorth.Recalculate();
        }

        private void PublishBalances(Money delta)
        {
            _bus.Publish(new MoneyChangedEvent(Wallet.Cash, Wallet.BankBalance, delta));
        }

        // --- Persistence --------------------------------------------------------

        public string SaveKey { get { return SaveNodeKey; } }

        public SaveNode Capture()
        {
            SaveNode node = SaveNode.NewObject();
            node.Set("cash", Wallet.Cash);
            node.Set("bank", Wallet.BankBalance);
            node.Set("lifetimeIncome", Ledger.LifetimeIncome);
            node.Set("lifetimeExpenses", Ledger.LifetimeExpenses);
            node.Set("sequence", Ledger.TotalRecorded);

            SaveNode transactions = SaveNode.NewArray();
            var recent = Ledger.Recent(PersistedTransactionCount);

            // Recent() is newest-first; write oldest-first so a restore replays in order.
            for (int i = recent.Count - 1; i >= 0; i--)
            {
                TransactionRecord record = recent[i];
                SaveNode entry = SaveNode.NewObject();
                entry.Set("seq", record.Sequence);
                entry.Set("at", record.At);
                entry.Set("amount", record.Amount);
                entry.Set("category", (int)record.Category);
                entry.Set("source", (int)record.Source);
                entry.Set("description", record.Description);
                entry.Set("balanceAfter", record.BalanceAfter);
                transactions.Add(entry);
            }

            node.Set("transactions", transactions);
            return node;
        }

        public void Restore(SaveNode node)
        {
            if (node == null) return;

            Wallet.RestoreBalances(node.GetMoney("cash"), node.GetMoney("bank"));

            Ledger.Clear();
            Ledger.RestoreTotals(
                node.GetLong("sequence"),
                node.GetMoney("lifetimeIncome"),
                node.GetMoney("lifetimeExpenses"));

            SaveNode transactions = node.GetNode("transactions");
            if (transactions != null && transactions.IsArray)
            {
                for (int i = 0; i < transactions.Count; i++)
                {
                    SaveNode entry = transactions[i];
                    Ledger.RestoreRecord(new TransactionRecord(
                        entry.GetLong("seq"),
                        entry.GetTime("at"),
                        entry.GetMoney("amount"),
                        (TransactionCategory)entry.GetInt("category"),
                        (PaymentSource)entry.GetInt("source"),
                        entry.GetString("description", string.Empty),
                        entry.GetMoney("balanceAfter")));
                }
            }

            PublishBalances(Money.Zero);
            NetWorth.Recalculate();
        }
    }
}
