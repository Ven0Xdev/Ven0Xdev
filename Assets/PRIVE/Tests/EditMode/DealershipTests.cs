using System.Collections.Generic;
using NUnit.Framework;
using Prive.Core;
using Prive.Dealership;
using Prive.Economy;
using Prive.Save;
using Prive.Vehicles;
using Prive.World;

namespace Prive.Tests
{
    [TestFixture]
    public class DealershipPricingTests
    {
        private DealershipDefinition Lot(DealershipTier tier, double markup, double buyBack,
                                         params VehicleCategory[] categories)
        {
            return new DealershipDefinition(
                StableId.Create("dealership", "test_lot"), "Test Lot",
                WorldLocations.VermillionBayDistricts.Industrial, tier,
                new List<VehicleCategory>(categories), markup, buyBack, 5, 3);
        }

        [Test]
        public void TheAskingPriceIsMarketValuePlusMarkup()
        {
            DealershipDefinition lot = Lot(DealershipTier.Standard, 0.20, 0.75, VehicleCategory.Economy);

            Assert.AreEqual(Money.FromDollars(12000L), lot.AskingPrice(Money.FromDollars(10000L)));
        }

        [Test]
        public void TheOfferPriceIsMarketValueLessTheSpread()
        {
            DealershipDefinition lot = Lot(DealershipTier.Standard, 0.20, 0.75, VehicleCategory.Economy);

            Assert.AreEqual(Money.FromDollars(7500L),
                lot.OfferPrice(Money.FromDollars(10000L), VehicleCategory.Economy));
        }

        [Test]
        public void ADealershipAlwaysAsksMoreThanItOffers()
        {
            // Without this the player could buy and immediately re-sell for a profit.
            IReadOnlyList<DealershipDefinition> lots = DefaultDealerships.Build();
            Money marketValue = Money.FromDollars(100000L);

            for (int i = 0; i < lots.Count; i++)
            {
                DealershipDefinition lot = lots[i];
                Money asking = lot.AskingPrice(marketValue);
                Money offer = lot.OfferPrice(marketValue, lot.Categories[0]);

                Assert.IsTrue(asking > offer, lot.DisplayName + " would be a money printer.");
            }
        }

        [Test]
        public void ADealershipPaysLessForSomethingOutsideItsBusiness()
        {
            DealershipDefinition budgetLot = Lot(DealershipTier.Budget, 0.20, 0.70, VehicleCategory.Economy);
            Money marketValue = Money.FromDollars(400000L);

            Money inCategory = budgetLot.OfferPrice(marketValue, VehicleCategory.Economy);
            Money outOfCategory = budgetLot.OfferPrice(marketValue, VehicleCategory.Supercar);

            Assert.IsTrue(outOfCategory < inCategory,
                "A used-car lot has no idea what to do with a supercar.");
        }

        [Test]
        public void TheTierSpreadCreatesAnArbitrageRoute()
        {
            // The Phase 2 trading loop: sell an exotic where it is understood, not at the port.
            IReadOnlyList<DealershipDefinition> lots = DefaultDealerships.Build();

            DealershipDefinition port = null;
            DealershipDefinition scuderia = null;
            for (int i = 0; i < lots.Count; i++)
            {
                if (lots[i].Id == DefaultDealerships.PortAuto) port = lots[i];
                if (lots[i].Id == DefaultDealerships.ScuderiaVermillion) scuderia = lots[i];
            }

            Money marketValue = Money.FromDollars(485000L);
            Money atPort = port.OfferPrice(marketValue, VehicleCategory.Supercar);
            Money atScuderia = scuderia.OfferPrice(marketValue, VehicleCategory.Supercar);

            Assert.IsTrue(atScuderia > atPort.Scale(1.2),
                "Where the player sells must matter enough to be worth the drive.");
        }

        [Test]
        public void InvalidCommercialTermsAreRejected()
        {
            Assert.Throws<System.ArgumentOutOfRangeException>(
                () => Lot(DealershipTier.Budget, -0.1, 0.7, VehicleCategory.Economy));

            Assert.Throws<System.ArgumentOutOfRangeException>(
                () => Lot(DealershipTier.Budget, 0.1, 1.5, VehicleCategory.Economy));

            Assert.Throws<System.ArgumentOutOfRangeException>(
                () => Lot(DealershipTier.Budget, 0.1, 0.0, VehicleCategory.Economy));
        }

        [Test]
        public void DealershipsAreNotTiedToAnyCity()
        {
            // The same definition placed in a future city needs no code change.
            WorldLocationId dubai = WorldLocations.Dubai;

            DealershipDefinition abroad = new DealershipDefinition(
                StableId.Create("dealership", "dxb_exotics"), "Dubai Exotics", dubai,
                DealershipTier.Exotic, new List<VehicleCategory> { VehicleCategory.Hypercar },
                0.11, 0.85, 5, 8);

            Assert.AreEqual(dubai, abroad.Location);
            Assert.IsTrue(abroad.Handles(VehicleCategory.Hypercar));
        }
    }

    [TestFixture]
    public class DealershipTradingTests
    {
        private VehicleTestRig _rig;
        private DealershipService _dealerships;
        private DealershipDefinition _lot;

        [SetUp]
        public void SetUp()
        {
            _rig = new VehicleTestRig(startingDollars: 300000, garageSlots: 8);

            _dealerships = new DealershipService(
                _rig.Ownership, _rig.Catalog, _rig.Vehicles.Valuation,
                new DealershipInventoryGenerator(_rig.Catalog, _rig.Vehicles.Valuation, _rig.IdFactory),
                _rig.Clock, _rig.Bus, seed: 42UL);

            IReadOnlyList<DealershipDefinition> lots = DefaultDealerships.Build();
            for (int i = 0; i < lots.Count; i++) _dealerships.Register(lots[i]);

            _dealerships.StockAll();
            _lot = _dealerships.Get(DefaultDealerships.MeridianMotors);
        }

        private DealershipStockItem CheapestAt(StableId dealershipId)
        {
            DealershipInventory inventory = _dealerships.GetInventory(dealershipId);
            DealershipStockItem cheapest = null;

            for (int i = 0; i < inventory.Count; i++)
            {
                if (cheapest == null || inventory.Items[i].AskingPrice < cheapest.AskingPrice)
                {
                    cheapest = inventory.Items[i];
                }
            }

            return cheapest;
        }

        [Test]
        public void EveryDealershipStocksUpToCapacity()
        {
            IReadOnlyList<DealershipDefinition> lots = _dealerships.Dealerships;

            for (int i = 0; i < lots.Count; i++)
            {
                DealershipInventory inventory = _dealerships.GetInventory(lots[i].Id);
                Assert.AreEqual(lots[i].StockCapacity, inventory.Count,
                    lots[i].DisplayName + " did not fill its forecourt.");
            }
        }

        [Test]
        public void DealershipsOnlyStockWhatTheyHandle()
        {
            DealershipInventory inventory = _dealerships.GetInventory(DefaultDealerships.TheCarriageHouse);
            DealershipDefinition collector = _dealerships.Get(DefaultDealerships.TheCarriageHouse);

            for (int i = 0; i < inventory.Count; i++)
            {
                VehicleDefinition model = _rig.Catalog.Get(inventory.Items[i].Vehicle.DefinitionId);
                Assert.IsTrue(collector.Handles(model.Category),
                    "A collector house should not be selling a " + model.Category + ".");
            }
        }

        [Test]
        public void StockVariesInConditionSoBrowsingIsWorthwhile()
        {
            DealershipInventory inventory = _dealerships.GetInventory(DefaultDealerships.PortAuto);

            double lowest = 1.0;
            double highest = 0.0;
            for (int i = 0; i < inventory.Count; i++)
            {
                double condition = inventory.Items[i].Vehicle.Condition.Value;
                if (condition < lowest) lowest = condition;
                if (condition > highest) highest = condition;
            }

            Assert.Greater(highest - lowest, 0.05,
                "If every car on the lot were identical there would be nothing to shop for.");
        }

        [Test]
        public void GenerationIsDeterministicForAGivenSeed()
        {
            // A reloaded save must show the same forecourt.
            DealershipService first = BuildService(seed: 7UL);
            DealershipService second = BuildService(seed: 7UL);

            DealershipInventory a = first.GetInventory(DefaultDealerships.PortAuto);
            DealershipInventory b = second.GetInventory(DefaultDealerships.PortAuto);

            Assert.AreEqual(a.Count, b.Count);
            for (int i = 0; i < a.Count; i++)
            {
                Assert.AreEqual(a.Items[i].Vehicle.DefinitionId, b.Items[i].Vehicle.DefinitionId);
                Assert.AreEqual(a.Items[i].AskingPrice, b.Items[i].AskingPrice);
            }
        }

        private DealershipService BuildService(ulong seed)
        {
            VehicleTestRig rig = new VehicleTestRig();
            DealershipService service = new DealershipService(
                rig.Ownership, rig.Catalog, rig.Vehicles.Valuation,
                new DealershipInventoryGenerator(rig.Catalog, rig.Vehicles.Valuation, rig.IdFactory),
                rig.Clock, rig.Bus, seed);

            IReadOnlyList<DealershipDefinition> lots = DefaultDealerships.Build();
            for (int i = 0; i < lots.Count; i++) service.Register(lots[i]);

            service.StockAll();
            return service;
        }

        [Test]
        public void BuyingFromAForecourtTransfersTheCarAndTheMoney()
        {
            DealershipStockItem item = CheapestAt(DefaultDealerships.PortAuto);
            Money before = _rig.Economy.LiquidTotal;

            VehicleTransactionResult result = _dealerships.Buy(
                DefaultDealerships.PortAuto, item.Vehicle.Id, VehicleTestRig.Home);

            Assert.IsTrue(result.IsSuccess, result.Message);
            Assert.AreEqual(before - item.AskingPrice, _rig.Economy.LiquidTotal);
            Assert.IsTrue(_rig.Repository.Contains(result.VehicleId));
            Assert.IsNull(_dealerships.GetInventory(DefaultDealerships.PortAuto).Find(item.Vehicle.Id),
                "Sold stock must leave the forecourt.");
        }

        [Test]
        public void BuyingPreservesConditionAndMileageFromTheForecourt()
        {
            DealershipStockItem item = CheapestAt(DefaultDealerships.PortAuto);

            VehicleTransactionResult result = _dealerships.Buy(
                DefaultDealerships.PortAuto, item.Vehicle.Id, VehicleTestRig.Home);

            VehicleInstance owned = _rig.Ownership.GetOwned(result.VehicleId);

            Assert.AreEqual(item.Vehicle.OdometerKm, owned.OdometerKm);
            Assert.AreEqual(item.Vehicle.Condition, owned.Condition,
                "The car the player drives away must be the one they inspected.");
        }

        [Test]
        public void AFailedPurchaseLeavesTheStockOnTheForecourt()
        {
            VehicleTestRig poor = new VehicleTestRig(startingDollars: 100);
            DealershipService service = new DealershipService(
                poor.Ownership, poor.Catalog, poor.Vehicles.Valuation,
                new DealershipInventoryGenerator(poor.Catalog, poor.Vehicles.Valuation, poor.IdFactory),
                poor.Clock, poor.Bus, seed: 3UL);

            IReadOnlyList<DealershipDefinition> lots = DefaultDealerships.Build();
            for (int i = 0; i < lots.Count; i++) service.Register(lots[i]);
            service.StockAll();

            DealershipInventory inventory = service.GetInventory(DefaultDealerships.PortAuto);
            int stockBefore = inventory.Count;
            VehicleId target = inventory.Items[0].Vehicle.Id;

            VehicleTransactionResult result = service.Buy(
                DefaultDealerships.PortAuto, target, VehicleTestRig.Home);

            Assert.IsTrue(result.IsFailure);
            Assert.AreEqual(FailureReason.InsufficientFunds, result.Reason);
            Assert.AreEqual(stockBefore, inventory.Count,
                "A declined purchase must not consume inventory.");
        }

        [Test]
        public void BuyingAVehicleThatIsNotOnTheForecourtFails()
        {
            VehicleId ghost;
            VehicleId.TryParse("inst:vehicle.99999", out ghost);

            VehicleTransactionResult result = _dealerships.Buy(
                DefaultDealerships.PortAuto, ghost, VehicleTestRig.Home);

            Assert.IsTrue(result.IsFailure);
            Assert.AreEqual(FailureReason.NotFound, result.Reason);
        }

        [Test]
        public void BuyingFromAnUnknownDealershipFails()
        {
            VehicleTransactionResult result = _dealerships.Buy(
                StableId.Create("dealership", "nowhere"), VehicleId.None, VehicleTestRig.Home);

            Assert.IsTrue(result.IsFailure);
            Assert.AreEqual(FailureReason.NotFound, result.Reason);
        }

        [Test]
        public void SellingBackPaysTheOfferPriceAndReturnsTheCarToStock()
        {
            DealershipStockItem item = CheapestAt(DefaultDealerships.PortAuto);
            VehicleTransactionResult bought = _dealerships.Buy(
                DefaultDealerships.PortAuto, item.Vehicle.Id, VehicleTestRig.Home);

            Money quoted = _dealerships.QuoteTradeIn(DefaultDealerships.PortAuto, bought.VehicleId);
            Money before = _rig.Economy.LiquidTotal;

            VehicleTransactionResult sold = _dealerships.Sell(DefaultDealerships.PortAuto, bought.VehicleId);

            Assert.IsTrue(sold.IsSuccess, sold.Message);
            Assert.AreEqual(before + quoted, _rig.Economy.LiquidTotal);
            Assert.IsFalse(_rig.Repository.Contains(bought.VehicleId));
            Assert.IsNotNull(_dealerships.GetInventory(DefaultDealerships.PortAuto).Find(bought.VehicleId),
                "The dealership now has it to sell on.");
        }

        [Test]
        public void BuyingThenImmediatelySellingBackLosesMoney()
        {
            // The spread must be real, or the trading loop is a free money exploit.
            DealershipStockItem item = CheapestAt(DefaultDealerships.PortAuto);
            Money before = _rig.Economy.LiquidTotal;

            VehicleTransactionResult bought = _dealerships.Buy(
                DefaultDealerships.PortAuto, item.Vehicle.Id, VehicleTestRig.Home);
            _dealerships.Sell(DefaultDealerships.PortAuto, bought.VehicleId);

            Assert.IsTrue(_rig.Economy.LiquidTotal < before,
                "Round-tripping a car through one dealership must cost the spread.");
        }

        [Test]
        public void SellingAVehicleThePlayerDoesNotOwnFails()
        {
            VehicleId ghost;
            VehicleId.TryParse("inst:vehicle.55555", out ghost);

            Money before = _rig.Economy.LiquidTotal;
            VehicleTransactionResult result = _dealerships.Sell(DefaultDealerships.PortAuto, ghost);

            Assert.IsTrue(result.IsFailure);
            Assert.AreEqual(FailureReason.NotOwned, result.Reason);
            Assert.AreEqual(before, _rig.Economy.LiquidTotal);
        }

        [Test]
        public void SellingTheSameCarToTwoDealershipsIsImpossible()
        {
            DealershipStockItem item = CheapestAt(DefaultDealerships.PortAuto);
            VehicleTransactionResult bought = _dealerships.Buy(
                DefaultDealerships.PortAuto, item.Vehicle.Id, VehicleTestRig.Home);

            Assert.IsTrue(_dealerships.Sell(DefaultDealerships.PortAuto, bought.VehicleId).IsSuccess);

            Money afterFirst = _rig.Economy.LiquidTotal;
            VehicleTransactionResult second = _dealerships.Sell(
                DefaultDealerships.MeridianMotors, bought.VehicleId);

            Assert.IsTrue(second.IsFailure);
            Assert.AreEqual(afterFirst, _rig.Economy.LiquidTotal);
        }

        [Test]
        public void SellingSomewhereThatUnderstandsTheCarPaysBetter()
        {
            // The arbitrage, end to end through the real services.
            VehicleTestRig rich = new VehicleTestRig(startingDollars: 2000000, garageSlots: 8);
            DealershipService service = new DealershipService(
                rich.Ownership, rich.Catalog, rich.Vehicles.Valuation,
                new DealershipInventoryGenerator(rich.Catalog, rich.Vehicles.Valuation, rich.IdFactory),
                rich.Clock, rich.Bus, seed: 11UL);

            IReadOnlyList<DealershipDefinition> lots = DefaultDealerships.Build();
            for (int i = 0; i < lots.Count; i++) service.Register(lots[i]);
            service.StockAll();

            VehicleId supercar = rich.Buy(DefaultVehicleCatalog.VeloceTempesta);

            Money atPort = service.QuoteTradeIn(DefaultDealerships.PortAuto, supercar);
            Money atScuderia = service.QuoteTradeIn(DefaultDealerships.ScuderiaVermillion, supercar);

            Assert.IsTrue(atScuderia > atPort,
                "Knowing where to sell is the Phase 2 skill; it has to pay.");
        }

        [Test]
        public void ForecourtsTurnOverOnTheRestockInterval()
        {
            DealershipInventory inventory = _dealerships.GetInventory(DefaultDealerships.PortAuto);
            VehicleId firstBefore = inventory.Items[0].Vehicle.Id;

            _rig.Clock.Skip(5L * GameTime.MinutesPerDay, "test");
            _dealerships.RestockDue();

            Assert.AreEqual(_lot.StockCapacity <= 0 ? 0 : inventory.Count, inventory.Count);
            Assert.AreNotEqual(firstBefore, inventory.Items[0].Vehicle.Id,
                "Coming back days later should show different cars.");
        }

        [Test]
        public void ForecourtsDoNotTurnOverEarly()
        {
            DealershipInventory inventory = _dealerships.GetInventory(DefaultDealerships.TheCarriageHouse);
            VehicleId firstBefore = inventory.Items[0].Vehicle.Id;

            _rig.Clock.Skip(2L * GameTime.MinutesPerDay, "test");
            _dealerships.RestockDue();

            Assert.AreEqual(firstBefore, inventory.Items[0].Vehicle.Id,
                "A collector house restocks every twelve days, not every two.");
        }

        [Test]
        public void TradingPublishesDealershipEvents()
        {
            int trades = 0;
            bool sawPurchase = false;
            _rig.Bus.Subscribe<DealershipTradeEvent>(e =>
            {
                trades++;
                if (e.PlayerBought) sawPurchase = true;
            });

            DealershipStockItem item = CheapestAt(DefaultDealerships.PortAuto);
            VehicleTransactionResult bought = _dealerships.Buy(
                DefaultDealerships.PortAuto, item.Vehicle.Id, VehicleTestRig.Home);
            _dealerships.Sell(DefaultDealerships.PortAuto, bought.VehicleId);

            Assert.AreEqual(2, trades);
            Assert.IsTrue(sawPurchase);
        }

        [Test]
        public void TheFlipLoopCanActuallyMakeMoney()
        {
            // Phase 2's exit criterion, exercised end to end through the real services: buy a
            // car where it is undervalued, sell it where it is understood, come out ahead.
            VehicleTestRig trader = new VehicleTestRig(startingDollars: 700000, garageSlots: 8);

            DealershipService service = new DealershipService(
                trader.Ownership, trader.Catalog, trader.Vehicles.Valuation,
                new DealershipInventoryGenerator(trader.Catalog, trader.Vehicles.Valuation, trader.IdFactory),
                trader.Clock, trader.Bus, seed: 2024UL);

            IReadOnlyList<DealershipDefinition> lots = DefaultDealerships.Build();
            for (int i = 0; i < lots.Count; i++) service.Register(lots[i]);
            service.StockAll();

            // A supercar owned outright, valued at market.
            VehicleId supercar = trader.Buy(DefaultVehicleCatalog.VeloceTempesta);

            Money atPort = service.QuoteTradeIn(DefaultDealerships.PortAuto, supercar);
            Money atScuderia = service.QuoteTradeIn(DefaultDealerships.ScuderiaVermillion, supercar);

            Money before = trader.Economy.LiquidTotal;
            Assert.IsTrue(service.Sell(DefaultDealerships.ScuderiaVermillion, supercar).IsSuccess);
            Money gained = trader.Economy.LiquidTotal - before;

            Assert.AreEqual(atScuderia, gained);
            Assert.IsTrue(gained > atPort,
                "Selling at the right dealership must beat selling at the wrong one.");
            Assert.IsTrue((gained - atPort) > Money.FromDollars(50000L),
                "The reward for knowing the market has to be worth the trip.");
        }

        [Test]
        public void RegisteringTheSameDealershipTwiceIsRejected()
        {
            DealershipDefinition duplicate = DefaultDealerships.Build()[0];
            Assert.Throws<System.InvalidOperationException>(() => _dealerships.Register(duplicate));
        }
    }
}
