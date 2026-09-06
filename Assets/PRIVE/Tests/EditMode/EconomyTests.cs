using System;
using System.Collections.Generic;
using NUnit.Framework;
using Prive.Core;
using Prive.Economy;

namespace Prive.Tests
{
    /// <summary>A stand-in for a future content system such as vehicles or property.</summary>
    internal sealed class StubAssetProvider : IAssetValueProvider
    {
        private readonly List<AssetValuation> _items = new List<AssetValuation>();

        public StubAssetProvider(AssetCategory category) { Category = category; }

        public AssetCategory Category { get; private set; }

        public void Add(string name, Money value)
        {
            _items.Add(new AssetValuation(StableId.Create("inst", name), Category, name, value));
        }

        public Money GetTotalValue()
        {
            Money total = Money.Zero;
            for (int i = 0; i < _items.Count; i++) total += _items[i].Value;
            return total;
        }

        public IEnumerable<AssetValuation> GetValuations() { return _items; }
    }

    internal sealed class StubLiabilityProvider : ILiabilityProvider
    {
        private readonly List<LiabilityRecord> _items = new List<LiabilityRecord>();

        public void Add(string name, Money balance)
        {
            _items.Add(new LiabilityRecord(StableId.Create("inst", name), LiabilityCategory.Loan, name, balance));
        }

        public Money GetOutstandingTotal()
        {
            Money total = Money.Zero;
            for (int i = 0; i < _items.Count; i++) total += _items[i].OutstandingBalance;
            return total;
        }

        public IEnumerable<LiabilityRecord> GetLiabilities() { return _items; }
    }

    [TestFixture]
    public class PlayerWalletTests
    {
        [Test]
        public void Pay_FromAny_DrawsFromTheBankFirst()
        {
            // Players expect cash in hand to survive an ordinary purchase.
            PlayerWallet wallet = new PlayerWallet(Money.FromDollars(500L), Money.FromDollars(2000L));

            Assert.IsTrue(wallet.Pay(Money.FromDollars(1500L)).IsSuccess);
            Assert.AreEqual(Money.FromDollars(500L), wallet.Cash);
            Assert.AreEqual(Money.FromDollars(500L), wallet.BankBalance);
        }

        [Test]
        public void Pay_FromAny_FallsBackToCashWhenTheBankRunsOut()
        {
            PlayerWallet wallet = new PlayerWallet(Money.FromDollars(500L), Money.FromDollars(200L));

            Assert.IsTrue(wallet.Pay(Money.FromDollars(600L)).IsSuccess);
            Assert.AreEqual(Money.FromDollars(100L), wallet.Cash);
            Assert.AreEqual(Money.Zero, wallet.BankBalance);
        }

        [Test]
        public void Pay_InsufficientFunds_ChangesNothing()
        {
            PlayerWallet wallet = new PlayerWallet(Money.FromDollars(50L), Money.FromDollars(20L));

            OperationResult result = wallet.Pay(Money.FromDollars(500L));

            Assert.IsTrue(result.IsFailure);
            Assert.AreEqual(FailureReason.InsufficientFunds, result.Reason);
            Assert.AreEqual(Money.FromDollars(50L), wallet.Cash);
            Assert.AreEqual(Money.FromDollars(20L), wallet.BankBalance);
        }

        [Test]
        public void Pay_FromASpecificSource_IgnoresTheOther()
        {
            PlayerWallet wallet = new PlayerWallet(Money.FromDollars(1000L), Money.FromDollars(0L));

            Assert.IsTrue(wallet.Pay(Money.FromDollars(100L), PaymentSource.Bank).IsFailure,
                "A bank-only payment must not raid the player's cash.");
            Assert.IsTrue(wallet.Pay(Money.FromDollars(100L), PaymentSource.Cash).IsSuccess);
        }

        [Test]
        public void DepositAndWithdraw_MoveMoneyWithoutCreatingIt()
        {
            PlayerWallet wallet = new PlayerWallet(Money.FromDollars(300L), Money.FromDollars(700L));
            Money before = wallet.Total;

            Assert.IsTrue(wallet.Deposit(Money.FromDollars(300L)).IsSuccess);
            Assert.AreEqual(Money.Zero, wallet.Cash);
            Assert.AreEqual(before, wallet.Total);

            Assert.IsTrue(wallet.Withdraw(Money.FromDollars(400L)).IsSuccess);
            Assert.AreEqual(Money.FromDollars(400L), wallet.Cash);
            Assert.AreEqual(before, wallet.Total);
        }

        [Test]
        public void NegativeAmounts_AreRejected()
        {
            PlayerWallet wallet = new PlayerWallet(Money.FromDollars(100L));

            Assert.AreEqual(FailureReason.InvalidArgument, wallet.Pay(Money.Zero - Money.FromDollars(5L)).Reason);
            Assert.AreEqual(FailureReason.InvalidArgument, wallet.Receive(Money.Zero - Money.FromDollars(5L)).Reason);
        }

        [Test]
        public void Pay_FromAny_DoesNotDeepenAnOverdraftWhileCashRemains()
        {
            PlayerWallet wallet = new PlayerWallet(Money.FromDollars(500L), Money.Zero - Money.FromDollars(100L));

            Assert.IsTrue(wallet.Pay(Money.FromDollars(300L)).IsSuccess);
            Assert.AreEqual(Money.FromDollars(200L), wallet.Cash);
            Assert.AreEqual(Money.Zero - Money.FromDollars(100L), wallet.BankBalance);
        }
    }

    [TestFixture]
    public class PlayerEconomyTests
    {
        private EventBus _bus;
        private GameClock _clock;
        private PlayerEconomy _economy;

        [SetUp]
        public void SetUp()
        {
            _bus = new EventBus();
            _clock = new GameClock(_bus);
            _economy = new PlayerEconomy(_bus, _clock,
                new PlayerWallet(Money.FromDollars(1000L), Money.FromDollars(4000L)));
        }

        [Test]
        public void NewGameDefaults_MatchTheTunedStartingLiquidity()
        {
            PlayerEconomy fresh = new PlayerEconomy(_bus, _clock);

            Assert.AreEqual(EconomyTuning.StartingLiquidity, fresh.LiquidTotal);
            Assert.AreEqual(Money.FromDollars(5000L), fresh.LiquidTotal);
        }

        [Test]
        public void TryPay_MovesMoneyAndRecordsTheTransaction()
        {
            OperationResult result = _economy.TryPay(
                Money.FromDollars(1200L), TransactionCategory.VehiclePurchase, "Used coupe");

            Assert.IsTrue(result.IsSuccess);
            Assert.AreEqual(Money.FromDollars(3800L), _economy.LiquidTotal);
            Assert.AreEqual(1, _economy.Ledger.Count);

            TransactionRecord record = _economy.Ledger.Records[0];
            Assert.IsTrue(record.IsExpense);
            Assert.AreEqual(TransactionCategory.VehiclePurchase, record.Category);
            Assert.AreEqual(_economy.LiquidTotal, record.BalanceAfter);
        }

        [Test]
        public void TryPay_PublishesBalanceAndTransactionEvents()
        {
            int moneyEvents = 0;
            int transactionEvents = 0;

            _bus.Subscribe<MoneyChangedEvent>(e => moneyEvents++);
            _bus.Subscribe<TransactionRecordedEvent>(e => transactionEvents++);

            _economy.TryPay(Money.FromDollars(100L), TransactionCategory.Lifestyle, "Dinner");

            Assert.AreEqual(1, moneyEvents);
            Assert.AreEqual(1, transactionEvents);
        }

        [Test]
        public void TryPay_WhenUnaffordable_DeclinesAndChangesNothing()
        {
            PaymentDeclinedEvent declined = default(PaymentDeclinedEvent);
            int declineCount = 0;
            _bus.Subscribe<PaymentDeclinedEvent>(e => { declined = e; declineCount++; });

            Money before = _economy.LiquidTotal;
            OperationResult result = _economy.TryPay(
                Money.FromDollars(500000L), TransactionCategory.VehiclePurchase, "Hypercar");

            Assert.IsTrue(result.IsFailure);
            Assert.AreEqual(FailureReason.InsufficientFunds, result.Reason);
            Assert.AreEqual(before, _economy.LiquidTotal);
            Assert.AreEqual(0, _economy.Ledger.Count, "A declined payment is not a transaction.");
            Assert.AreEqual(1, declineCount);
            Assert.AreEqual(Money.FromDollars(500000L), declined.Requested);
        }

        [Test]
        public void Charge_ForcesTheObligationAndOverdrawsTheBank()
        {
            // Rent and interest cannot be declined; the resulting overdraft is what the debt
            // systems are meant to act on.
            _economy.Charge(Money.FromDollars(8000L), TransactionCategory.PropertyUpkeep, "Rent");

            Assert.AreEqual(Money.Zero - Money.FromDollars(3000L), _economy.LiquidTotal);
            Assert.IsTrue(_economy.BankBalance.IsNegative);
            Assert.AreEqual(1, _economy.Ledger.Count);
        }

        [Test]
        public void Receive_CreditsAndRecordsIncome()
        {
            _economy.Receive(Money.FromDollars(2500L), TransactionCategory.VehicleSale, "Sold coupe");

            Assert.AreEqual(Money.FromDollars(7500L), _economy.LiquidTotal);
            Assert.IsTrue(_economy.Ledger.Records[0].IsIncome);
            Assert.AreEqual(Money.FromDollars(2500L), _economy.Ledger.LifetimeIncome);
        }

        [Test]
        public void LedgerTotals_TrackTheWholeCareer()
        {
            _economy.Receive(Money.FromDollars(1000L), TransactionCategory.BusinessRevenue, "Day 1");
            _economy.TryPay(Money.FromDollars(400L), TransactionCategory.BusinessExpense, "Stock");

            Assert.AreEqual(Money.FromDollars(1000L), _economy.Ledger.LifetimeIncome);
            Assert.AreEqual(Money.FromDollars(400L), _economy.Ledger.LifetimeExpenses);
            Assert.AreEqual(2L, _economy.Ledger.TotalRecorded);
        }

        [Test]
        public void Ledger_CapsRetainedHistoryButNotCareerTotals()
        {
            TransactionLedger ledger = new TransactionLedger(capacity: 3);
            PlayerEconomy economy = new PlayerEconomy(_bus, _clock,
                new PlayerWallet(Money.Zero, Money.FromDollars(1000L)), ledger);

            for (int i = 0; i < 10; i++)
            {
                economy.Receive(Money.FromDollars(10L), TransactionCategory.Other, "n" + i);
            }

            Assert.AreEqual(3, ledger.Count, "History is a bounded window.");
            Assert.AreEqual(10L, ledger.TotalRecorded);
            Assert.AreEqual(Money.FromDollars(100L), ledger.LifetimeIncome);
        }

        [Test]
        public void Ledger_FiltersByCategory()
        {
            _economy.TryPay(Money.FromDollars(200L), TransactionCategory.Travel, "Flight");
            _economy.TryPay(Money.FromDollars(50L), TransactionCategory.Lifestyle, "Drinks");
            _economy.TryPay(Money.FromDollars(300L), TransactionCategory.Travel, "Transfer");

            Assert.AreEqual(Money.Zero - Money.FromDollars(500L),
                _economy.Ledger.SumByCategory(TransactionCategory.Travel));
        }
    }

    [TestFixture]
    public class NetWorthTests
    {
        private EventBus _bus;
        private GameClock _clock;
        private PlayerEconomy _economy;

        [SetUp]
        public void SetUp()
        {
            _bus = new EventBus();
            _clock = new GameClock(_bus);
            _economy = new PlayerEconomy(_bus, _clock,
                new PlayerWallet(Money.FromDollars(5000L), Money.FromDollars(20000L)));
        }

        [Test]
        public void WithNoAssets_NetWorthIsLiquidOnly()
        {
            Assert.AreEqual(Money.FromDollars(25000L), _economy.NetWorth.Recalculate());
        }

        [Test]
        public void AssetsAndLiabilities_AggregateIntoOneFigure()
        {
            StubAssetProvider vehicles = new StubAssetProvider(AssetCategory.Vehicle);
            vehicles.Add("coupe", Money.FromDollars(40000L));
            vehicles.Add("suv", Money.FromDollars(90000L));

            StubAssetProvider property = new StubAssetProvider(AssetCategory.Property);
            property.Add("apartment", Money.FromDollars(450000L));

            StubLiabilityProvider debts = new StubLiabilityProvider();
            debts.Add("mortgage", Money.FromDollars(300000L));

            _economy.NetWorth.RegisterAssetProvider(vehicles);
            _economy.NetWorth.RegisterAssetProvider(property);
            _economy.NetWorth.RegisterLiabilityProvider(debts);

            // 25,000 liquid + 130,000 vehicles + 450,000 property - 300,000 debt
            Assert.AreEqual(Money.FromDollars(305000L), _economy.NetWorth.Recalculate());
        }

        [Test]
        public void Breakdown_SplitsByCategory()
        {
            StubAssetProvider investments = new StubAssetProvider(AssetCategory.Investment);
            investments.Add("portfolio", Money.FromDollars(75000L));
            _economy.NetWorth.RegisterAssetProvider(investments);

            NetWorthBreakdown breakdown = _economy.NetWorth.BuildBreakdown();

            Assert.AreEqual(Money.FromDollars(25000L), breakdown.Liquid);
            Assert.AreEqual(Money.FromDollars(75000L), breakdown.Investments);
            Assert.AreEqual(Money.Zero, breakdown.Vehicles);
            Assert.AreEqual(Money.FromDollars(100000L), breakdown.NetWorth);
        }

        [Test]
        public void Recalculate_PublishesOnlyWhenTheValueMoves()
        {
            int changes = 0;
            _bus.Subscribe<NetWorthChangedEvent>(e => changes++);

            _economy.NetWorth.Recalculate();
            int afterFirst = changes;

            _economy.NetWorth.Recalculate();

            Assert.AreEqual(afterFirst, changes, "An unchanged recalculation must not publish.");
        }

        [Test]
        public void UnregisteringAProvider_RemovesItsValue()
        {
            StubAssetProvider vehicles = new StubAssetProvider(AssetCategory.Vehicle);
            vehicles.Add("coupe", Money.FromDollars(40000L));

            IDisposable registration = _economy.NetWorth.RegisterAssetProvider(vehicles);
            Assert.AreEqual(Money.FromDollars(65000L), _economy.NetWorth.Recalculate());

            registration.Dispose();
            Assert.AreEqual(Money.FromDollars(25000L), _economy.NetWorth.Recalculate());
        }

        [Test]
        public void SpendingMoneyOnAnAssetOfEqualValue_LeavesNetWorthUnchanged()
        {
            StubAssetProvider vehicles = new StubAssetProvider(AssetCategory.Vehicle);
            _economy.NetWorth.RegisterAssetProvider(vehicles);

            Money before = _economy.NetWorth.Recalculate();

            _economy.TryPay(Money.FromDollars(15000L), TransactionCategory.VehiclePurchase, "Sedan");
            vehicles.Add("sedan", Money.FromDollars(15000L));

            Assert.AreEqual(before, _economy.NetWorth.Recalculate(),
                "Converting cash into an asset of the same value is not a loss.");
        }
    }

    [TestFixture]
    public class RecurringCashflowTests
    {
        private EventBus _bus;
        private GameClock _clock;
        private PlayerEconomy _economy;
        private RecurringCashflow _cashflow;

        [SetUp]
        public void SetUp()
        {
            _bus = new EventBus();
            _clock = new GameClock(_bus);
            _economy = new PlayerEconomy(_bus, _clock,
                new PlayerWallet(Money.Zero, Money.FromDollars(10000L)));
            _cashflow = new RecurringCashflow(_economy);
            _clock.Register(_cashflow);
        }

        [Test]
        public void DailyExpense_IsChargedOnEachDayBoundary()
        {
            _cashflow.Add(new CashflowEntry(
                StableId.Create("cashflow", "living"), "Living costs",
                Money.Zero - EconomyTuning.DefaultDailyLivingCost,
                CashflowCadence.Daily, TransactionCategory.Lifestyle));

            _clock.Skip(3L * GameTime.MinutesPerDay, "test");

            Assert.AreEqual(Money.FromDollars(10000L) - EconomyTuning.DefaultDailyLivingCost * 3,
                _economy.LiquidTotal);
        }

        [Test]
        public void MonthlyIncome_IsPaidOnMonthBoundariesOnly()
        {
            _cashflow.Add(new CashflowEntry(
                StableId.Create("cashflow", "rent_income"), "Rental income",
                Money.FromDollars(2400L), CashflowCadence.Monthly, TransactionCategory.PropertyIncome));

            _clock.Skip(20L * GameTime.MinutesPerDay, "test");
            Assert.AreEqual(Money.FromDollars(10000L), _economy.LiquidTotal, "No month boundary crossed yet.");

            _clock.Skip(15L * GameTime.MinutesPerDay, "test");
            Assert.AreEqual(Money.FromDollars(12400L), _economy.LiquidTotal);
        }

        [Test]
        public void InactiveEntries_AreSkipped()
        {
            CashflowEntry entry = _cashflow.Add(new CashflowEntry(
                StableId.Create("cashflow", "salary"), "Salary",
                Money.FromDollars(500L), CashflowCadence.Daily, TransactionCategory.Salary));

            entry.IsActive = false;
            _clock.Skip(GameTime.MinutesPerDay, "test");

            Assert.AreEqual(Money.FromDollars(10000L), _economy.LiquidTotal);
        }

        [Test]
        public void NetDailyEstimate_NormalisesEveryCadence()
        {
            _cashflow.Add(new CashflowEntry(StableId.Create("cashflow", "a"), "Daily",
                Money.FromDollars(100L), CashflowCadence.Daily, TransactionCategory.Salary));
            _cashflow.Add(new CashflowEntry(StableId.Create("cashflow", "b"), "Weekly",
                Money.FromDollars(70L), CashflowCadence.Weekly, TransactionCategory.BusinessRevenue));

            // 100/day + 70/week (=10/day) = 110/day
            Assert.AreEqual(Money.FromDollars(110L), _cashflow.NetDailyEstimate());
        }

        [Test]
        public void DuplicateCashflowIds_AreRejected()
        {
            StableId id = StableId.Create("cashflow", "rent");
            _cashflow.Add(new CashflowEntry(id, "Rent", Money.FromDollars(10L), CashflowCadence.Daily, TransactionCategory.PropertyUpkeep));

            Assert.Throws<InvalidOperationException>(() => _cashflow.Add(
                new CashflowEntry(id, "Rent again", Money.FromDollars(10L), CashflowCadence.Daily, TransactionCategory.PropertyUpkeep)));
        }
    }
}
