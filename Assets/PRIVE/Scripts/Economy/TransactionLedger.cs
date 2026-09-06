using System;
using System.Collections.Generic;
using Prive.Core;

namespace Prive.Economy
{
    /// <summary>
    /// The player's transaction history, newest last, capped to a bounded window.
    /// </summary>
    /// <remarks>
    /// A long session can produce tens of thousands of transactions; keeping them all would
    /// grow the save file without bound for no gameplay benefit. The ledger keeps a rolling
    /// window for display, while <see cref="LifetimeIncome"/> and
    /// <see cref="LifetimeExpenses"/> accumulate forever so career totals stay accurate.
    /// </remarks>
    public sealed class TransactionLedger
    {
        public const int DefaultCapacity = 500;

        private readonly List<TransactionRecord> _records;
        private readonly int _capacity;
        private long _sequence;

        public TransactionLedger(int capacity = DefaultCapacity)
        {
            if (capacity < 1) throw new ArgumentOutOfRangeException("capacity");
            _capacity = capacity;
            _records = new List<TransactionRecord>(Math.Min(capacity, 64));
        }

        public int Capacity { get { return _capacity; } }
        public int Count { get { return _records.Count; } }

        /// <summary>Retained records, oldest first.</summary>
        public IReadOnlyList<TransactionRecord> Records { get { return _records; } }

        /// <summary>Total money ever received, across the whole career.</summary>
        public Money LifetimeIncome { get; private set; }

        /// <summary>Total money ever spent, as a positive amount.</summary>
        public Money LifetimeExpenses { get; private set; }

        /// <summary>Number of transactions ever recorded, including those aged out of the window.</summary>
        public long TotalRecorded { get { return _sequence; } }

        public TransactionRecord Record(GameTime at, Money amount, TransactionCategory category,
                                        PaymentSource source, string description, Money balanceAfter)
        {
            _sequence++;

            TransactionRecord record = new TransactionRecord(
                _sequence, at, amount, category, source, description ?? string.Empty, balanceAfter);

            _records.Add(record);
            if (_records.Count > _capacity) _records.RemoveAt(0);

            if (amount.IsPositive) LifetimeIncome += amount;
            else if (amount.IsNegative) LifetimeExpenses += amount.Abs();

            return record;
        }

        /// <summary>Net total of retained records in <paramref name="category"/>.</summary>
        public Money SumByCategory(TransactionCategory category)
        {
            Money total = Money.Zero;
            for (int i = 0; i < _records.Count; i++)
            {
                if (_records[i].Category == category) total += _records[i].Amount;
            }
            return total;
        }

        /// <summary>Net total of retained records at or after <paramref name="since"/>.</summary>
        public Money SumSince(GameTime since)
        {
            Money total = Money.Zero;
            for (int i = 0; i < _records.Count; i++)
            {
                if (_records[i].At >= since) total += _records[i].Amount;
            }
            return total;
        }

        /// <summary>The most recent <paramref name="count"/> records, newest first.</summary>
        public IReadOnlyList<TransactionRecord> Recent(int count)
        {
            if (count < 1) return Array.Empty<TransactionRecord>();

            int take = Math.Min(count, _records.Count);
            List<TransactionRecord> result = new List<TransactionRecord>(take);

            for (int i = _records.Count - 1; i >= _records.Count - take; i--)
            {
                result.Add(_records[i]);
            }

            return result;
        }

        public void Clear()
        {
            _records.Clear();
            _sequence = 0;
            LifetimeIncome = Money.Zero;
            LifetimeExpenses = Money.Zero;
        }

        /// <summary>Restores career totals and the sequence counter when loading a save.</summary>
        public void RestoreTotals(long sequence, Money lifetimeIncome, Money lifetimeExpenses)
        {
            _sequence = sequence;
            LifetimeIncome = lifetimeIncome;
            LifetimeExpenses = lifetimeExpenses;
        }

        /// <summary>Appends a record read from a save without re-counting it in career totals.</summary>
        public void RestoreRecord(TransactionRecord record)
        {
            _records.Add(record);
            if (_records.Count > _capacity) _records.RemoveAt(0);
        }
    }
}
