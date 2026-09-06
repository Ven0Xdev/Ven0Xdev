using NUnit.Framework;
using Prive.Core;
using Prive.Economy;
using Prive.Save;
using Prive.Social;
using Prive.Vehicles;
using Prive.World;

namespace Prive.Tests
{
    [TestFixture]
    public class VehiclePurchaseTests
    {
        private VehicleTestRig _rig;

        [SetUp]
        public void SetUp()
        {
            _rig = new VehicleTestRig();
        }

        [Test]
        public void BuyingAVehicleTakesTheMoneyAndGivesTheCar()
        {
            Money before = _rig.Economy.LiquidTotal;
            Money price = _rig.Catalog.Get(DefaultVehicleCatalog.MarrowVector).BasePrice;

            VehicleTransactionResult result = _rig.Ownership.Buy(
                DefaultVehicleCatalog.MarrowVector, price, VehicleTestRig.Home, "Test Motors");

            Assert.IsTrue(result.IsSuccess);
            Assert.IsTrue(result.VehicleId.IsValid);
            Assert.AreEqual(before - price, _rig.Economy.LiquidTotal);
            Assert.AreEqual(1, _rig.Repository.Count);
        }

        [Test]
        public void BuyingRecordsATransactionInTheLedger()
        {
            _rig.Buy(DefaultVehicleCatalog.CorvaneDart);

            Assert.AreEqual(1, _rig.Economy.Ledger.Count);
            Assert.AreEqual(TransactionCategory.VehiclePurchase, _rig.Economy.Ledger.Records[0].Category);
        }

        [Test]
        public void BuyingPublishesAcquisition()
        {
            VehicleAcquiredEvent captured = default(VehicleAcquiredEvent);
            int events = 0;
            _rig.Bus.Subscribe<VehicleAcquiredEvent>(e => { captured = e; events++; });

            _rig.Buy(DefaultVehicleCatalog.KestrelSirocco);

            Assert.AreEqual(1, events);
            Assert.AreEqual(DefaultVehicleCatalog.KestrelSirocco, captured.DefinitionId);
        }

        [Test]
        public void InsufficientFundsLeavesMoneyAndGarageUntouched()
        {
            VehicleTestRig poor = new VehicleTestRig(startingDollars: 1000);
            Money before = poor.Economy.LiquidTotal;

            VehicleTransactionResult result = poor.Ownership.Buy(
                DefaultVehicleCatalog.NyxAscendant,
                poor.Catalog.Get(DefaultVehicleCatalog.NyxAscendant).BasePrice,
                VehicleTestRig.Home);

            Assert.IsTrue(result.IsFailure);
            Assert.AreEqual(FailureReason.InsufficientFunds, result.Reason);
            Assert.AreEqual(before, poor.Economy.LiquidTotal, "A failed purchase must not cost anything.");
            Assert.AreEqual(0, poor.Repository.Count);
            Assert.AreEqual(0, poor.Economy.Ledger.Count, "A declined purchase is not a transaction.");
        }

        [Test]
        public void AnUnknownModelIsRejectedBeforeAnyMoneyMoves()
        {
            Money before = _rig.Economy.LiquidTotal;

            VehicleTransactionResult result = _rig.Ownership.Buy(
                VehicleDefinitionId.FromName("does_not_exist"), Money.FromDollars(10L), VehicleTestRig.Home);

            Assert.IsTrue(result.IsFailure);
            Assert.AreEqual(FailureReason.NotFound, result.Reason);
            Assert.AreEqual(before, _rig.Economy.LiquidTotal);
        }

        [Test]
        public void ANegativePriceIsRejected()
        {
            VehicleTransactionResult result = _rig.Ownership.Buy(
                DefaultVehicleCatalog.CorvaneDart,
                Money.Zero - Money.FromDollars(5000L), VehicleTestRig.Home);

            Assert.IsTrue(result.IsFailure);
            Assert.AreEqual(FailureReason.InvalidArgument, result.Reason);
            Assert.AreEqual(0, _rig.Repository.Count);
        }

        [Test]
        public void ANegativeOdometerIsRejected()
        {
            VehicleTransactionResult result = _rig.Ownership.Buy(
                DefaultVehicleCatalog.CorvaneDart, Money.FromDollars(1000L),
                VehicleTestRig.Home, "", VehicleCondition.Pristine, odometerKm: -50);

            Assert.IsTrue(result.IsFailure);
            Assert.AreEqual(FailureReason.InvalidArgument, result.Reason);
        }

        [Test]
        public void AFullGarageRefusesDeliveryBeforeCharging()
        {
            VehicleTestRig rig = new VehicleTestRig(garageSlots: 1);
            rig.Buy(DefaultVehicleCatalog.CorvaneDart);

            Money before = rig.Economy.LiquidTotal;
            VehicleTransactionResult result = rig.Ownership.Buy(
                DefaultVehicleCatalog.CorvanePilot,
                rig.Catalog.Get(DefaultVehicleCatalog.CorvanePilot).BasePrice,
                VehicleTestRig.Home);

            Assert.IsTrue(result.IsFailure);
            Assert.AreEqual(FailureReason.AtCapacity, result.Reason);
            Assert.AreEqual(before, rig.Economy.LiquidTotal, "Capacity is checked before payment.");
            Assert.AreEqual(1, rig.Repository.Count);
        }

        [Test]
        public void LargeVehiclesConsumeMoreGarageSpace()
        {
            VehicleTestRig rig = new VehicleTestRig(garageSlots: 2);

            // The limousine takes two slots, so it fits exactly and nothing else does.
            rig.Buy(DefaultVehicleCatalog.HalcyonRegent);
            Assert.AreEqual(0, rig.Ownership.FreeSlotsAt(VehicleTestRig.Home));

            VehicleTransactionResult result = rig.Ownership.Buy(
                DefaultVehicleCatalog.CorvaneDart, Money.FromDollars(4200L), VehicleTestRig.Home);

            Assert.AreEqual(FailureReason.AtCapacity, result.Reason);
        }

        [Test]
        public void EveryPurchaseGetsAUniqueId()
        {
            VehicleId first = _rig.Buy(DefaultVehicleCatalog.CorvaneDart);
            VehicleId second = _rig.Buy(DefaultVehicleCatalog.CorvaneDart);

            Assert.AreNotEqual(first, second,
                "Two examples of the same model must be distinguishable.");
            Assert.AreEqual(2, _rig.Repository.Count);
            Assert.IsTrue(_rig.Repository.Contains(first));
            Assert.IsTrue(_rig.Repository.Contains(second));
        }

        [Test]
        public void ADuplicateIdIsRejectedRatherThanOverwriting()
        {
            VehicleId id = _rig.Buy(DefaultVehicleCatalog.CorvaneDart);
            VehicleInstance clone = new VehicleInstance(
                id, DefaultVehicleCatalog.CorvanePilot, Money.Zero, GameTime.Start,
                VehicleTestRig.Home, VehicleCondition.Pristine);

            Assert.Throws<System.InvalidOperationException>(() => _rig.Repository.Add(clone),
                "Overwriting would silently destroy an owned vehicle.");
        }
    }

    [TestFixture]
    public class VehicleSaleTests
    {
        private VehicleTestRig _rig;

        [SetUp]
        public void SetUp()
        {
            _rig = new VehicleTestRig();
        }

        [Test]
        public void SellingReturnsMoneyAndRemovesTheVehicle()
        {
            VehicleId id = _rig.Buy(DefaultVehicleCatalog.MarrowVector);
            Money before = _rig.Economy.LiquidTotal;

            VehicleTransactionResult result = _rig.Ownership.Sell(id, Money.FromDollars(18000L), "Test Motors");

            Assert.IsTrue(result.IsSuccess);
            Assert.AreEqual(before + Money.FromDollars(18000L), _rig.Economy.LiquidTotal);
            Assert.AreEqual(0, _rig.Repository.Count);
            Assert.IsFalse(_rig.Repository.Contains(id));
        }

        [Test]
        public void SellingReportsProfitAgainstThePurchasePrice()
        {
            Money paid = _rig.Catalog.Get(DefaultVehicleCatalog.MarrowVector).BasePrice;
            VehicleId id = _rig.Buy(DefaultVehicleCatalog.MarrowVector);

            VehicleSoldEvent captured = default(VehicleSoldEvent);
            _rig.Bus.Subscribe<VehicleSoldEvent>(e => captured = e);

            Money soldFor = paid + Money.FromDollars(4000L);
            _rig.Ownership.Sell(id, soldFor);

            Assert.AreEqual(Money.FromDollars(4000L), captured.ProfitOrLoss);
            Assert.AreEqual(soldFor, captured.PriceReceived);
        }

        [Test]
        public void SellingAVehicleThePlayerDoesNotOwnFails()
        {
            VehicleId ghost;
            VehicleId.TryParse("inst:vehicle.999", out ghost);

            Money before = _rig.Economy.LiquidTotal;
            VehicleTransactionResult result = _rig.Ownership.Sell(ghost, Money.FromDollars(50000L));

            Assert.IsTrue(result.IsFailure);
            Assert.AreEqual(FailureReason.NotOwned, result.Reason);
            Assert.AreEqual(before, _rig.Economy.LiquidTotal, "No money may appear from nowhere.");
        }

        [Test]
        public void SellingTheSameVehicleTwiceFailsTheSecondTime()
        {
            VehicleId id = _rig.Buy(DefaultVehicleCatalog.CorvaneDart);

            Assert.IsTrue(_rig.Ownership.Sell(id, Money.FromDollars(4000L)).IsSuccess);

            Money afterFirst = _rig.Economy.LiquidTotal;
            VehicleTransactionResult second = _rig.Ownership.Sell(id, Money.FromDollars(4000L));

            Assert.IsTrue(second.IsFailure);
            Assert.AreEqual(afterFirst, _rig.Economy.LiquidTotal,
                "Duplicate sales would be an infinite money exploit.");
        }

        [Test]
        public void ANegativeSalePriceIsRejectedAndKeepsTheVehicle()
        {
            VehicleId id = _rig.Buy(DefaultVehicleCatalog.CorvaneDart);

            VehicleTransactionResult result = _rig.Ownership.Sell(id, Money.Zero - Money.FromDollars(100L));

            Assert.IsTrue(result.IsFailure);
            Assert.AreEqual(FailureReason.InvalidArgument, result.Reason);
            Assert.IsTrue(_rig.Repository.Contains(id));
        }

        [Test]
        public void SellingTheActiveVehicleStandsThePlayerDown()
        {
            VehicleId id = _rig.Buy(DefaultVehicleCatalog.VeloceTempesta);
            _rig.Ownership.SetActiveVehicle(id);
            Assert.AreEqual(id, _rig.Ownership.ActiveVehicleId);

            _rig.Ownership.Sell(id, Money.FromDollars(400000L));

            Assert.IsFalse(_rig.Ownership.ActiveVehicleId.IsValid,
                "The player cannot still be driving a car they just sold.");
            Assert.IsNull(_rig.Ownership.ActiveVehicle);
        }
    }

    [TestFixture]
    public class VehicleNetWorthIntegrationTests
    {
        private VehicleTestRig _rig;

        [SetUp]
        public void SetUp()
        {
            _rig = new VehicleTestRig();
        }

        [Test]
        public void VehiclesAppearInNetWorthThroughTheExistingContract()
        {
            Money before = _rig.Economy.NetWorth.Recalculate();

            _rig.Buy(DefaultVehicleCatalog.AurelianMeridian);

            NetWorthBreakdown breakdown = _rig.Economy.NetWorth.BuildBreakdown();

            Assert.IsTrue(breakdown.Vehicles.IsPositive, "The vehicle must show as an asset.");
            Assert.IsTrue(breakdown.NetWorth <= before,
                "Buying at market price cannot increase net worth.");
        }

        [Test]
        public void BuyingConvertsCashIntoAnAssetWithoutDestroyingValue()
        {
            Money before = _rig.Economy.NetWorth.Recalculate();
            _rig.Buy(DefaultVehicleCatalog.MarrowVector);
            Money after = _rig.Economy.NetWorth.Recalculate();

            // Dealer markup is not modelled at base price, so the only movement is the
            // rarity premium; the loss must at least be small.
            Money difference = (after - before).Abs();
            Assert.IsTrue(difference < Money.FromDollars(5000L),
                "Converting cash to a vehicle at fair value should roughly preserve net worth.");
        }

        [Test]
        public void EveryOwnedVehicleCountsIncludingGaragedOnes()
        {
            _rig.Buy(DefaultVehicleCatalog.CorvaneDart);
            _rig.Buy(DefaultVehicleCatalog.CorvanePilot);
            VehicleId driven = _rig.Buy(DefaultVehicleCatalog.KestrelSirocco);
            _rig.Ownership.SetActiveVehicle(driven);

            Money total = _rig.Vehicles.AssetProvider.GetTotalValue();
            Money sum = Money.Zero;
            foreach (AssetValuation valuation in _rig.Vehicles.AssetProvider.GetValuations())
            {
                sum += valuation.Value;
            }

            Assert.AreEqual(total, sum);
            Assert.AreEqual(3, new System.Collections.Generic.List<AssetValuation>(
                _rig.Vehicles.AssetProvider.GetValuations()).Count);
        }

        [Test]
        public void SellingRemovesTheVehicleFromNetWorth()
        {
            VehicleId id = _rig.Buy(DefaultVehicleCatalog.AurelianMeridian);
            Assert.IsTrue(_rig.Vehicles.AssetProvider.GetTotalValue().IsPositive);

            _rig.Ownership.Sell(id, Money.FromDollars(80000L));

            Assert.AreEqual(Money.Zero, _rig.Vehicles.AssetProvider.GetTotalValue());
        }

        [Test]
        public void TheProviderReportsUnderTheVehicleCategory()
        {
            Assert.AreEqual(AssetCategory.Vehicle, _rig.Vehicles.AssetProvider.Category);
        }
    }

    [TestFixture]
    public class VehicleObservedWealthIntegrationTests
    {
        private VehicleTestRig _rig;

        [SetUp]
        public void SetUp()
        {
            _rig = new VehicleTestRig(startingDollars: 4000000);
        }

        [Test]
        public void AGaragedFleetIsInvisibleToTheWorld()
        {
            _rig.Buy(DefaultVehicleCatalog.VeloceTempesta);
            _rig.Buy(DefaultVehicleCatalog.SableEstate);

            ObservedWealthContribution contribution =
                _rig.Vehicles.WealthSignal.Evaluate(_rig.Context());

            Assert.AreEqual(0.0, contribution.EffectiveWeight, 0.0001,
                "Nobody on the street can see into a garage.");
        }

        [Test]
        public void DrivingAVehicleMakesItTheSignal()
        {
            VehicleId id = _rig.Buy(DefaultVehicleCatalog.VeloceTempesta);
            _rig.Ownership.SetActiveVehicle(id);

            ObservedWealthContribution contribution =
                _rig.Vehicles.WealthSignal.Evaluate(_rig.Context());

            Assert.IsTrue(contribution.IsMeaningful);
            Assert.IsTrue(contribution.ImpliedWealth > Money.FromDollars(1000000L),
                "A supercar should imply far more wealth than it costs.");
        }

        [Test]
        public void AMoreImpressiveCarReadsAsMoreWealth()
        {
            VehicleId hatchback = _rig.Buy(DefaultVehicleCatalog.CorvaneDart);
            VehicleId supercar = _rig.Buy(DefaultVehicleCatalog.VeloceTempesta);

            _rig.Ownership.SetActiveVehicle(hatchback);
            Money modest = _rig.ObservedWealth.Evaluate(_rig.Context());

            _rig.Ownership.SetActiveVehicle(supercar);
            Money impressive = _rig.ObservedWealth.Evaluate(_rig.Context());

            Assert.IsTrue(impressive > modest);
        }

        [Test]
        public void SpendingEverythingOnAVisibleCarReadsAsRicherThanTheyAre()
        {
            // The signature behaviour of the social layer, now driven by a real asset: a player
            // who has put nearly all their money into one conspicuous car.
            VehicleTestRig stretched = new VehicleTestRig(startingDollars: 520000);

            VehicleId supercar = stretched.Buy(DefaultVehicleCatalog.VeloceTempesta);
            stretched.Ownership.SetActiveVehicle(supercar);

            Money netWorth = stretched.Economy.NetWorth.Recalculate();
            Money observed = stretched.ObservedWealth.Evaluate(stretched.Context());

            Assert.IsTrue(observed > netWorth,
                "A leased-supercar playstyle must be able to punch above its balance sheet.");
        }

        [Test]
        public void QuietWealthReadsAsPoorerThanTheyAre()
        {
            // The mirror image, and just as important: someone genuinely rich driving something
            // ordinary should not be read as rich.
            VehicleTestRig quiet = new VehicleTestRig(startingDollars: 8000000);

            VehicleId hatchback = quiet.Buy(DefaultVehicleCatalog.CorvaneDart);
            quiet.Ownership.SetActiveVehicle(hatchback);

            Money netWorth = quiet.Economy.NetWorth.Recalculate();
            Money observed = quiet.ObservedWealth.Evaluate(quiet.Context());

            Assert.IsTrue(observed < netWorth,
                "Wealth nobody can see must not be read by anybody.");
        }

        [Test]
        public void TheSameNetWorthCanReadCompletelyDifferently()
        {
            // Two players with identical balance sheets, one visible and one not. This gap is
            // what the entire NPC reaction system keys off.
            VehicleTestRig flashy = new VehicleTestRig(startingDollars: 520000);
            VehicleTestRig discreet = new VehicleTestRig(startingDollars: 520000);

            flashy.Ownership.SetActiveVehicle(flashy.Buy(DefaultVehicleCatalog.VeloceTempesta));
            discreet.Ownership.SetActiveVehicle(discreet.Buy(DefaultVehicleCatalog.CorvaneDart));

            Money flashyObserved = flashy.ObservedWealth.Evaluate(flashy.Context());
            Money discreetObserved = discreet.ObservedWealth.Evaluate(discreet.Context());

            Assert.IsTrue(flashyObserved > discreetObserved.Scale(5.0),
                "The visible-wealth gap between these two must be dramatic, not marginal.");
        }

        [Test]
        public void SwappingCarsInvalidatesPerception()
        {
            VehicleId id = _rig.Buy(DefaultVehicleCatalog.VeloceTempesta);

            int invalidations = 0;
            _rig.Bus.Subscribe<VisibleLoadoutChangedEvent>(e => invalidations++);

            _rig.Ownership.SetActiveVehicle(id);
            _rig.Ownership.SetActiveVehicle(VehicleId.None);

            Assert.AreEqual(2, invalidations,
                "Getting into and out of a car must both re-trigger how the world reads the player.");
        }

        [Test]
        public void PoorConditionWeakensTheSignal()
        {
            VehicleTransactionResult pristine = _rig.Ownership.Buy(
                DefaultVehicleCatalog.VeloceTempesta, Money.FromDollars(485000L),
                VehicleTestRig.Home, "", VehicleCondition.Pristine);

            _rig.Ownership.SetActiveVehicle(pristine.VehicleId);
            double goodConfidence = _rig.Vehicles.WealthSignal.Evaluate(_rig.Context()).Confidence;

            _rig.Ownership.GetOwned(pristine.VehicleId).SetCondition(new VehicleCondition(0.2));
            double poorConfidence = _rig.Vehicles.WealthSignal.Evaluate(_rig.Context()).Confidence;

            Assert.Less(poorConfidence, goodConfidence);
        }

        [Test]
        public void CannotDriveAVehicleTheyDoNotOwn()
        {
            VehicleId ghost;
            VehicleId.TryParse("inst:vehicle.4242", out ghost);

            OperationResult result = _rig.Ownership.SetActiveVehicle(ghost);

            Assert.IsTrue(result.IsFailure);
            Assert.AreEqual(FailureReason.NotOwned, result.Reason);
        }
    }
}
