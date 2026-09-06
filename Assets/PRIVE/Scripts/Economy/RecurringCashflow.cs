using System;
using System.Collections.Generic;
using Prive.Core;

namespace Prive.Economy
{
    /// <summary>A scheduled income or expense.</summary>
    /// <remarks><see cref="Amount"/> is signed: positive is income, negative is an expense.</remarks>
    public sealed class CashflowEntry
    {
        public StableId Id { get; private set; }
        public string Description { get; private set; }
        public Money Amount { get; private set; }
        public CashflowCadence Cadence { get; private set; }
        public TransactionCategory Category { get; private set; }
        public bool IsActive { get; set; }

        public CashflowEntry(StableId id, string description, Money amount,
                             CashflowCadence cadence, TransactionCategory category)
        {
            Id = id;
            Description = description ?? string.Empty;
            Amount = amount;
            Cadence = cadence;
            Category = category;
            IsActive = true;
        }

        public void SetAmount(Money amount) { Amount = amount; }

        public override string ToString()
        {
            return Description + " " + Amount + " / " + Cadence;
        }
    }

    /// <summary>
    /// Applies scheduled income and expenses on the game clock.
    /// </summary>
    /// <remarks>
    /// Registered as an ordered <see cref="IClockTickable"/> rather than an event subscriber:
    /// rent, salaries and loan interest must land in a defined sequence, and bus subscription
    /// order is not a contract.
    /// </remarks>
    public sealed class RecurringCashflow : ClockTickable
    {
        private readonly PlayerEconomy _economy;
        private readonly List<CashflowEntry> _entries = new List<CashflowEntry>();

        public RecurringCashflow(PlayerEconomy economy)
        {
            if (economy == null) throw new ArgumentNullException("economy");
            _economy = economy;
        }

        public IReadOnlyList<CashflowEntry> Entries { get { return _entries; } }

        public CashflowEntry Add(CashflowEntry entry)
        {
            if (entry == null) throw new ArgumentNullException("entry");

            for (int i = 0; i < _entries.Count; i++)
            {
                if (_entries[i].Id == entry.Id)
                {
                    throw new InvalidOperationException("Cashflow '" + entry.Id + "' is already registered.");
                }
            }

            _entries.Add(entry);
            return entry;
        }

        public bool Remove(StableId id)
        {
            for (int i = 0; i < _entries.Count; i++)
            {
                if (_entries[i].Id == id)
                {
                    _entries.RemoveAt(i);
                    return true;
                }
            }
            return false;
        }

        public CashflowEntry Find(StableId id)
        {
            for (int i = 0; i < _entries.Count; i++)
            {
                if (_entries[i].Id == id) return _entries[i];
            }
            return null;
        }

        /// <summary>Net of all active entries, normalised to a per-day amount. For the phone's summary.</summary>
        public Money NetDailyEstimate()
        {
            Money total = Money.Zero;

            for (int i = 0; i < _entries.Count; i++)
            {
                CashflowEntry entry = _entries[i];
                if (!entry.IsActive) continue;

                switch (entry.Cadence)
                {
                    case CashflowCadence.Daily: total += entry.Amount; break;
                    case CashflowCadence.Weekly: total += entry.Amount.Scale(1.0 / 7.0); break;
                    case CashflowCadence.Monthly: total += entry.Amount.Scale(12.0 / 365.0); break;
                }
            }

            return total;
        }

        public override void OnDay(GameTime now) { Apply(CashflowCadence.Daily); }
        public override void OnWeek(GameTime now) { Apply(CashflowCadence.Weekly); }
        public override void OnMonth(GameTime now) { Apply(CashflowCadence.Monthly); }

        private void Apply(CashflowCadence cadence)
        {
            for (int i = 0; i < _entries.Count; i++)
            {
                CashflowEntry entry = _entries[i];
                if (!entry.IsActive || entry.Cadence != cadence || entry.Amount.IsZero) continue;

                if (entry.Amount.IsPositive)
                {
                    _economy.Receive(entry.Amount, entry.Category, entry.Description);
                }
                else
                {
                    // An unaffordable recurring expense still has to be recorded. It is
                    // charged against the bank, which is what creates the overdraft that the
                    // credit and debt systems will later act on.
                    _economy.Charge(entry.Amount.Abs(), entry.Category, entry.Description);
                }
            }
        }
    }
}
