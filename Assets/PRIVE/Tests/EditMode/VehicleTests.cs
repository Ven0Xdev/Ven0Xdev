using System.Collections.Generic;
using NUnit.Framework;
using Prive.Core;
using Prive.Economy;
using Prive.Social;
using Prive.Vehicles;
using Prive.World;

namespace Prive.Tests
{
    /// <summary>Shared scaffolding for the vehicle and dealership fixtures.</summary>
    internal sealed class VehicleTestRig
    {
        public readonly EventBus Bus;
        public readonly GameClock Clock;
        public readonly PlayerEconomy Economy;
        public readonly SocialStatus Status;
        public readonly ObservedWealthCalculator ObservedWealth;
        public readonly RuntimeIdFactory IdFactory;
        public readonly VehicleCatalog Catalog;
        public readonly VehicleModule Vehicles;

        public static readonly WorldLocationId Home = WorldLocations.VermillionBayDistricts.Downtown;

        public VehicleTestRig(long startingDollars = 500000, int garageSlots = 4)
        {
            Bus = new EventBus();
            Clock = new GameClock(Bus);
            Economy = new PlayerEconomy(Bus, Clock,
                new PlayerWallet(Money.Zero, Money.FromDollars(startingDollars)));
            Status = new SocialStatus(Bus);
            ObservedWealth = new ObservedWealthCalculator(Bus);
            IdFactory = new RuntimeIdFactory();
            Catalog = DefaultVehicleCatalog.Build();

            Vehicles = new VehicleModule(Catalog, Economy, Clock, Bus, IdFactory,
                new FlatGarageCapacity(garageSlots));

            Vehicles.Install(Economy.NetWorth, ObservedWealth, null);
        }

        public VehicleOwnershipService Ownership { get { return Vehicles.Ownership; } }
        public VehicleRepository Repository { get { return Vehicles.Repository; } }

        /// <summary>Buys a vehicle at its full base price and returns its id.</summary>
        public VehicleId Buy(VehicleDefinitionId definitionId)
        {
            VehicleDefinition definition = Catalog.Get(definitionId);
            VehicleTransactionResult result = Ownership.Buy(definitionId, definition.BasePrice, Home);
            Assert.IsTrue(result.IsSuccess, result.Message);
            return result.VehicleId;
        }

        public ObservedWealthContext Context()
        {
            return new ObservedWealthContext(Home, PrestigeTier.Standard, Clock.Now,
                Status.Fame, Status.Reputation, Status.LifestyleScore);
        }
    }

    [TestFixture]
    public class VehicleValuationTests
    {
        private VehicleValuationModel _model;
        private VehicleCatalog _catalog;

        [SetUp]
        public void SetUp()
        {
            _model = new VehicleValuationModel();
            _catalog = DefaultVehicleCatalog.Build();
        }

        private VehicleInstance Instance(VehicleDefinitionId id, double condition = 1.0,
                                         int odometerKm = 0, GameTime purchasedAt = default(GameTime))
        {
            return new VehicleInstance(
                VehicleId.Mint(new RuntimeIdFactory()), id, Money.Zero, purchasedAt,
                VehicleTestRig.Home, new VehicleCondition(condition), odometerKm);
        }

        private Money Value(VehicleDefinitionId id, double condition = 1.0, int odometerKm = 0,
                            GameTime now = default(GameTime), double market = 1.0)
        {
            VehicleDefinition definition = _catalog.Get(id);
            return _model.Value(new VehicleValuationContext(
                definition, Instance(id, condition, odometerKm), now, market));
        }

        [Test]
        public void APristineUndrivenVehicleIsWorthExactlyItsBasePrice()
        {
            // Holds for every model regardless of rarity. When rarity was an outright
            // multiplier this was false, and buying any rare car at list price minted money.
            VehicleCatalog catalog = DefaultVehicleCatalog.Build();
            IReadOnlyList<VehicleDefinition> all = catalog.Definitions;

            for (int i = 0; i < all.Count; i++)
            {
                VehicleDefinition definition = all[i];
                Assert.AreEqual(definition.BasePrice, Value(definition.Id),
                    definition.DisplayName + " is not worth its list price when new.");
            }
        }

        [Test]
        public void ScarcitySlowsLossRatherThanAddingAPremium()
        {
            // Same wear applied to a common and an exotic car: both start at list price, and
            // the exotic keeps more of it.
            double commonRetained = VehicleValuationModel.ApplyRarity(
                0.6, VehicleValuationModel.RarityFactor(VehicleRarity.Common));
            double exoticRetained = VehicleValuationModel.ApplyRarity(
                0.6, VehicleValuationModel.RarityFactor(VehicleRarity.Exotic));

            Assert.AreEqual(0.6, commonRetained, 0.0001);
            Assert.Greater(exoticRetained, commonRetained);
            Assert.Less(exoticRetained, 1.0, "Wear must still cost something, even on an exotic.");
        }

        [Test]
        public void AppreciationIsNotDampenedByRarity()
        {
            Assert.AreEqual(1.4, VehicleValuationModel.ApplyRarity(
                1.4, VehicleValuationModel.RarityFactor(VehicleRarity.Exotic)), 0.0001);
        }

        [Test]
        public void WorseConditionIsWorthLess()
        {
            Money pristine = Value(DefaultVehicleCatalog.AurelianMeridian, condition: 1.0);
            Money good = Value(DefaultVehicleCatalog.AurelianMeridian, condition: 0.7);
            Money poor = Value(DefaultVehicleCatalog.AurelianMeridian, condition: 0.25);

            Assert.IsTrue(pristine > good);
            Assert.IsTrue(good > poor);
        }

        [Test]
        public void MileageCostsMostAtTheStart()
        {
            double first = VehicleValuationModel.MileageFactor(0, 200000)
                           - VehicleValuationModel.MileageFactor(20000, 200000);
            double later = VehicleValuationModel.MileageFactor(160000, 200000)
                           - VehicleValuationModel.MileageFactor(180000, 200000);

            Assert.Greater(first, later,
                "The first 20,000 km should cost more value than the last 20,000.");
        }

        [Test]
        public void MileageFactorIsBoundedAtBothEnds()
        {
            Assert.AreEqual(1.0, VehicleValuationModel.MileageFactor(0, 100000), 0.0001);
            Assert.AreEqual(VehicleValuationModel.MinimumMileageFactor,
                VehicleValuationModel.MileageFactor(100000, 100000), 0.0001);
            Assert.AreEqual(VehicleValuationModel.MinimumMileageFactor,
                VehicleValuationModel.MileageFactor(900000, 100000), 0.0001);
        }

        [Test]
        public void OrdinaryVehiclesDepreciateOverTime()
        {
            GameTime threeYears = GameTime.Start.AddDays(365 * 3);

            Money now = Value(DefaultVehicleCatalog.AurelianMeridian);
            Money later = Value(DefaultVehicleCatalog.AurelianMeridian, now: threeYears);

            Assert.IsTrue(later < now, "A luxury saloon must lose value over three years.");
        }

        [Test]
        public void CollectorVehiclesAppreciateOverTime()
        {
            GameTime fiveYears = GameTime.Start.AddDays(365 * 5);

            Money now = Value(DefaultVehicleCatalog.VeloceStradaGT);
            Money later = Value(DefaultVehicleCatalog.VeloceStradaGT, now: fiveYears);

            Assert.IsTrue(later > now,
                "A rare collector car is the one asset class that should gain value with age.");
        }

        [Test]
        public void AppreciationIsCapped()
        {
            GameTime aVeryLongTime = GameTime.Start.AddDays(365 * 200);
            VehicleDefinition definition = _catalog.Get(DefaultVehicleCatalog.VeloceStradaGT);

            Money value = Value(DefaultVehicleCatalog.VeloceStradaGT, now: aVeryLongTime);
            Money ceiling = definition.BasePrice.Scale(VehicleValuationModel.MaximumAgeFactor);

            Assert.IsTrue(value <= ceiling, "Appreciation must not run away without bound.");
        }

        [Test]
        public void ValueNeverFallsBelowTheFloor()
        {
            VehicleDefinition definition = _catalog.Get(DefaultVehicleCatalog.CorvaneDart);
            GameTime aDecade = GameTime.Start.AddDays(365 * 10);

            Money value = Value(DefaultVehicleCatalog.CorvaneDart,
                condition: 0.0, odometerKm: 900000, now: aDecade);

            Assert.IsTrue(value >= definition.BasePrice.Scale(VehicleValuationModel.AbsoluteFloorFactor));
            Assert.IsTrue(value.IsPositive, "Even a wreck is worth something in parts.");
        }

        [Test]
        public void ARicherMarketRaisesValue()
        {
            Money baseline = Value(DefaultVehicleCatalog.VeloceTempesta, market: 1.0);
            Money monaco = Value(DefaultVehicleCatalog.VeloceTempesta, market: 1.8);

            Assert.IsTrue(monaco > baseline);
        }

        [Test]
        public void RarerVehiclesSufferLessOfTheLoss()
        {
            Assert.IsTrue(VehicleValuationModel.RarityFactor(VehicleRarity.Common)
                          > VehicleValuationModel.RarityFactor(VehicleRarity.Rare));
            Assert.IsTrue(VehicleValuationModel.RarityFactor(VehicleRarity.Rare)
                          > VehicleValuationModel.RarityFactor(VehicleRarity.Exotic));
        }

        [Test]
        public void ARareCarHoldsValueBetterThanACommonOneOverTime()
        {
            GameTime fourYears = GameTime.Start.AddDays(365 * 4);

            VehicleDefinition common = _catalog.Get(DefaultVehicleCatalog.MarrowVector);
            VehicleDefinition rare = _catalog.Get(DefaultVehicleCatalog.AurelianSovereign);

            double commonRetained = Value(common.Id, condition: 0.8, odometerKm: 60000, now: fourYears)
                                    .ToDouble() / common.BasePrice.ToDouble();
            double rareRetained = Value(rare.Id, condition: 0.8, odometerKm: 60000, now: fourYears)
                                  .ToDouble() / rare.BasePrice.ToDouble();

            Assert.Greater(rareRetained, commonRetained);
        }

        [Test]
        public void BreakdownExplainsTheNumber()
        {
            VehicleDefinition definition = _catalog.Get(DefaultVehicleCatalog.KestrelSirocco);
            VehicleValuationBreakdown breakdown = _model.Explain(new VehicleValuationContext(
                definition, Instance(DefaultVehicleCatalog.KestrelSirocco, 0.8, 40000), GameTime.Start));

            Assert.AreEqual(definition.BasePrice, breakdown.BasePrice);
            Assert.IsTrue(breakdown.ConditionFactor > 0.0 && breakdown.ConditionFactor < 1.0);
            Assert.IsTrue(breakdown.MileageFactor > 0.0 && breakdown.MileageFactor < 1.0);
            Assert.IsTrue(breakdown.Value.IsPositive);
        }
    }

    [TestFixture]
    public class VehicleCatalogContentTests
    {
        [Test]
        public void TheCatalogueCoversEveryProgressionTier()
        {
            VehicleCatalog catalog = DefaultVehicleCatalog.Build();

            foreach (VehicleCategory category in new[]
            {
                VehicleCategory.Economy, VehicleCategory.Sports, VehicleCategory.Luxury,
                VehicleCategory.LuxurySuv, VehicleCategory.Supercar, VehicleCategory.Hypercar,
                VehicleCategory.Limousine, VehicleCategory.Classic, VehicleCategory.RareCollector
            })
            {
                Assert.IsNotEmpty((System.Collections.ICollection)catalog.InCategory(category),
                    "No vehicle authored for " + category);
            }
        }

        [Test]
        public void ANewGameCanAffordSomethingOnDayOne()
        {
            VehicleCatalog catalog = DefaultVehicleCatalog.Build();

            bool affordable = false;
            IReadOnlyList<VehicleDefinition> all = catalog.Definitions;
            for (int i = 0; i < all.Count; i++)
            {
                if (all[i].BasePrice <= EconomyTuning.StartingLiquidity) affordable = true;
            }

            Assert.IsTrue(affordable,
                "The trading loop must be reachable from the starting balance, not after a grind.");
        }

        [Test]
        public void PrestigeRisesWithTier()
        {
            VehicleCatalog catalog = DefaultVehicleCatalog.Build();

            VehicleDefinition hatchback = catalog.Get(DefaultVehicleCatalog.CorvaneDart);
            VehicleDefinition saloon = catalog.Get(DefaultVehicleCatalog.AurelianMeridian);
            VehicleDefinition hypercar = catalog.Get(DefaultVehicleCatalog.NyxAscendant);

            Assert.Greater(saloon.BasePrestige, hatchback.BasePrestige);
            Assert.Greater(hypercar.BasePrestige, saloon.BasePrestige);
        }

        [Test]
        public void CollectibleCategoriesAppreciateAndOthersDoNot()
        {
            VehicleCatalog catalog = DefaultVehicleCatalog.Build();
            IReadOnlyList<VehicleDefinition> all = catalog.Definitions;

            for (int i = 0; i < all.Count; i++)
            {
                VehicleDefinition definition = all[i];

                if (definition.IsCollectible)
                {
                    Assert.Greater(definition.AnnualValueRate, 0.0,
                        definition.DisplayName + " is collectible but depreciates.");
                }
                else if (definition.Category != VehicleCategory.Hypercar)
                {
                    Assert.Less(definition.AnnualValueRate, 0.0,
                        definition.DisplayName + " should depreciate.");
                }
            }
        }

        [Test]
        public void DuplicateDefinitionIdsAreRejected()
        {
            VehicleCatalog catalog = new VehicleCatalog();
            VehicleDefinition definition = new VehicleDefinition(
                DefaultVehicleCatalog.CorvaneDart, "Corvane", "Dart",
                VehicleCategory.Economy, VehicleRarity.Common,
                Money.FromDollars(4200L), 4, 260000, -0.11);

            catalog.Add(definition);
            Assert.Throws<System.InvalidOperationException>(() => catalog.Add(definition));
        }
    }
}
