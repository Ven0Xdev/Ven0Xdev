using System.Collections.Generic;
using NUnit.Framework;
using Prive.Core;
using Prive.Dealership;
using Prive.Save;
using Prive.Vehicles;
using Prive.World;

namespace Prive.Tests
{
    [TestFixture]
    public class VehicleSaveTests
    {
        private JsonSaveSerializer _serializer;
        private InMemorySaveStorage _storage;

        [SetUp]
        public void SetUp()
        {
            _serializer = new JsonSaveSerializer();
            _storage = new InMemorySaveStorage();
        }

        private SaveManager NewManager()
        {
            return new SaveManager(_serializer, _storage, null, "phase2-test");
        }

        [Test]
        public void AVehicleInstanceRoundTripsThroughItsDto()
        {
            RuntimeIdFactory factory = new RuntimeIdFactory();
            VehicleInstance original = new VehicleInstance(
                VehicleId.Mint(factory), DefaultVehicleCatalog.VeloceTempesta,
                Money.FromDollars(462500L), GameTime.FromDate(2025, 4, 2, 14, 30),
                WorldLocations.VermillionBayDistricts.Marina,
                new VehicleCondition(0.735), odometerKm: 18422);

            original.SetPlate("VB-88-QX");
            original.SetCustomisationState("wrap=midnight;wheels=forged");
            original.SetInsurancePolicy("policy-7781");
            original.SetStorageState(VehicleStorageState.Consigned);

            string problem;
            VehicleInstance restored = VehicleInstance.TryRestore(
                _serializer.Deserialize(_serializer.Serialize(original.Capture())), out problem);

            Assert.IsNull(problem);
            Assert.AreEqual(original.Id, restored.Id);
            Assert.AreEqual(original.DefinitionId, restored.DefinitionId);
            Assert.AreEqual(original.PurchasePrice, restored.PurchasePrice);
            Assert.AreEqual(original.PurchasedAt, restored.PurchasedAt);
            Assert.AreEqual(original.StoredAt, restored.StoredAt);
            Assert.AreEqual(original.OdometerKm, restored.OdometerKm);
            Assert.AreEqual(original.Condition.Value, restored.Condition.Value, 0.000001);
            Assert.AreEqual(original.StorageState, restored.StorageState);
            Assert.AreEqual("VB-88-QX", restored.PlateNumber);
            Assert.AreEqual(original.CustomisationState, restored.CustomisationState);
            Assert.AreEqual(original.InsurancePolicyId, restored.InsurancePolicyId);
        }

        [Test]
        public void MoneyOnAVehicleSurvivesToTheExactCent()
        {
            RuntimeIdFactory factory = new RuntimeIdFactory();
            Money awkward = Money.FromMinorUnits(48273901L);

            VehicleInstance original = new VehicleInstance(
                VehicleId.Mint(factory), DefaultVehicleCatalog.NyxAscendant,
                awkward, GameTime.Start, WorldLocations.VermillionBayDistricts.Downtown,
                VehicleCondition.Pristine);

            string problem;
            VehicleInstance restored = VehicleInstance.TryRestore(
                _serializer.Deserialize(_serializer.Serialize(original.Capture())), out problem);

            Assert.AreEqual(awkward.MinorUnits, restored.PurchasePrice.MinorUnits);
        }

        [Test]
        public void AGarageSurvivesSaveAndReload()
        {
            VehicleTestRig session = new VehicleTestRig(startingDollars: 3000000, garageSlots: 8);

            VehicleId hatchback = session.Buy(DefaultVehicleCatalog.CorvaneDart);
            VehicleId supercar = session.Buy(DefaultVehicleCatalog.VeloceTempesta);
            session.Ownership.SetActiveVehicle(supercar);
            session.Ownership.GetOwned(hatchback).AddDistance(12000, 0.000004);

            SaveManager writer = NewManager();
            writer.Register(session.Vehicles);
            writer.Save();

            // A completely fresh object graph.
            VehicleTestRig reloaded = new VehicleTestRig(startingDollars: 0, garageSlots: 8);
            SaveManager reader = NewManager();
            reader.Register(reloaded.Vehicles);

            Assert.IsTrue(reader.Load().Success);

            Assert.AreEqual(2, reloaded.Repository.Count);
            Assert.IsTrue(reloaded.Repository.Contains(hatchback));
            Assert.IsTrue(reloaded.Repository.Contains(supercar));
            Assert.AreEqual(supercar, reloaded.Ownership.ActiveVehicleId,
                "The player should be back in the car they were driving.");
            Assert.AreEqual(12000, reloaded.Ownership.GetOwned(hatchback).OdometerKm);
            Assert.IsEmpty((System.Collections.ICollection)reloaded.Repository.LastRestoreProblems);
        }

        [Test]
        public void RestoredVehiclesStillCountTowardsNetWorth()
        {
            VehicleTestRig session = new VehicleTestRig(startingDollars: 3000000, garageSlots: 8);
            session.Buy(DefaultVehicleCatalog.SableEstate);
            Money expected = session.Vehicles.AssetProvider.GetTotalValue();

            SaveManager writer = NewManager();
            writer.Register(session.Vehicles);
            writer.Save();

            VehicleTestRig reloaded = new VehicleTestRig(startingDollars: 0, garageSlots: 8);
            SaveManager reader = NewManager();
            reader.Register(reloaded.Vehicles);
            Assert.IsTrue(reader.Load().Success);

            Assert.AreEqual(expected, reloaded.Vehicles.AssetProvider.GetTotalValue());
            Assert.IsTrue(reloaded.Economy.NetWorth.Recalculate().IsPositive);
        }

        [Test]
        public void AVehicleWhoseModelNoLongerShipsIsSkippedNotFatal()
        {
            // Removing a car from the catalogue must cost the player that car, not the garage.
            VehicleTestRig session = new VehicleTestRig(startingDollars: 3000000, garageSlots: 8);
            session.Buy(DefaultVehicleCatalog.CorvaneDart);
            session.Buy(DefaultVehicleCatalog.KestrelSirocco);

            SaveNode captured = session.Vehicles.Capture();

            // Rebuild against a catalogue containing only one of the two models.
            VehicleCatalog reduced = new VehicleCatalog();
            reduced.Add(session.Catalog.Get(DefaultVehicleCatalog.CorvaneDart));

            VehicleRepository repository = new VehicleRepository(reduced);
            repository.Restore(captured);

            Assert.AreEqual(1, repository.Count);
            Assert.AreEqual(1, repository.LastRestoreProblems.Count);
            Assert.IsTrue(repository.LastRestoreProblems[0].Contains("does not ship"));
        }

        [Test]
        public void AMalformedVehicleEntryIsReportedAndSkipped()
        {
            SaveNode node = SaveNode.NewObject();
            SaveNode owned = SaveNode.NewArray();
            owned.Add(SaveNode.NewObject().Set("id", "not-an-id"));
            node.Set("owned", owned);

            VehicleRepository repository = new VehicleRepository(DefaultVehicleCatalog.Build());
            repository.Restore(node);

            Assert.AreEqual(0, repository.Count);
            Assert.AreEqual(1, repository.LastRestoreProblems.Count);
        }

        [Test]
        public void AnActiveVehicleThatIsNoLongerOwnedResolvesToOnFoot()
        {
            SaveNode node = SaveNode.NewObject();
            node.Set("owned", SaveNode.NewArray());
            node.Set("active", "inst:vehicle.404");

            VehicleTestRig rig = new VehicleTestRig();
            rig.Vehicles.Restore(node);

            Assert.IsFalse(rig.Ownership.ActiveVehicleId.IsValid,
                "A dangling active id must not leave the player driving nothing.");
        }

        [Test]
        public void RestoringDoesNotAnnounceAVehicleChange()
        {
            VehicleTestRig session = new VehicleTestRig(startingDollars: 3000000);
            VehicleId id = session.Buy(DefaultVehicleCatalog.KestrelSirocco);
            session.Ownership.SetActiveVehicle(id);
            SaveNode captured = session.Vehicles.Capture();

            VehicleTestRig reloaded = new VehicleTestRig(startingDollars: 0);
            int changes = 0;
            reloaded.Bus.Subscribe<ActiveVehicleChangedEvent>(e => changes++);

            reloaded.Vehicles.Restore(captured);

            Assert.AreEqual(0, changes, "Loading a save is not the player getting into a car.");
            Assert.AreEqual(id, reloaded.Ownership.ActiveVehicleId);
        }

        [Test]
        public void MintedIdsNeverCollideAcrossASaveAndReload()
        {
            VehicleTestRig session = new VehicleTestRig(startingDollars: 3000000, garageSlots: 8);
            VehicleId first = session.Buy(DefaultVehicleCatalog.CorvaneDart);

            // Simulate a reload where the id counter is restored alongside the garage.
            long counter = session.IdFactory.Counter;
            SaveNode captured = session.Vehicles.Capture();

            VehicleTestRig reloaded = new VehicleTestRig(startingDollars: 3000000, garageSlots: 8);
            reloaded.IdFactory.RestoreCounter(counter);
            reloaded.Vehicles.Restore(captured);

            VehicleId second = reloaded.Buy(DefaultVehicleCatalog.CorvanePilot);

            Assert.AreNotEqual(first, second);
            Assert.AreEqual(2, reloaded.Repository.Count);
        }
    }

    [TestFixture]
    public class DealershipSaveTests
    {
        private DealershipService BuildService(VehicleTestRig rig, ulong seed)
        {
            DealershipService service = new DealershipService(
                rig.Ownership, rig.Catalog, rig.Vehicles.Valuation,
                new DealershipInventoryGenerator(rig.Catalog, rig.Vehicles.Valuation, rig.IdFactory),
                rig.Clock, rig.Bus, seed);

            IReadOnlyList<DealershipDefinition> lots = DefaultDealerships.Build();
            for (int i = 0; i < lots.Count; i++) service.Register(lots[i]);

            return service;
        }

        [Test]
        public void AForecourtSurvivesSaveAndReload()
        {
            VehicleTestRig session = new VehicleTestRig();
            DealershipService written = BuildService(session, 99UL);
            written.StockAll();

            DealershipInventory before = written.GetInventory(DefaultDealerships.AurelianBay);
            List<VehicleId> ids = new List<VehicleId>();
            List<Money> prices = new List<Money>();
            for (int i = 0; i < before.Count; i++)
            {
                ids.Add(before.Items[i].Vehicle.Id);
                prices.Add(before.Items[i].AskingPrice);
            }

            InMemorySaveStorage storage = new InMemorySaveStorage();
            SaveManager writer = new SaveManager(new JsonSaveSerializer(), storage);
            writer.Register(written);
            writer.Save();

            VehicleTestRig reloadedRig = new VehicleTestRig();
            DealershipService read = BuildService(reloadedRig, 1UL);
            SaveManager reader = new SaveManager(new JsonSaveSerializer(), storage);
            reader.Register(read);
            Assert.IsTrue(reader.Load().Success);

            DealershipInventory after = read.GetInventory(DefaultDealerships.AurelianBay);

            Assert.AreEqual(ids.Count, after.Count);
            for (int i = 0; i < ids.Count; i++)
            {
                Assert.AreEqual(ids[i], after.Items[i].Vehicle.Id);
                Assert.AreEqual(prices[i], after.Items[i].AskingPrice,
                    "A reloaded forecourt must show the same cars at the same prices.");
            }
        }

        [Test]
        public void ASoldCarDoesNotReappearOnTheForecourtAfterReload()
        {
            VehicleTestRig session = new VehicleTestRig(startingDollars: 400000, garageSlots: 8);
            DealershipService written = BuildService(session, 5UL);
            written.StockAll();

            DealershipInventory inventory = written.GetInventory(DefaultDealerships.PortAuto);
            VehicleId target = inventory.Items[0].Vehicle.Id;
            Assert.IsTrue(written.Buy(DefaultDealerships.PortAuto, target, VehicleTestRig.Home).IsSuccess);

            InMemorySaveStorage storage = new InMemorySaveStorage();
            SaveManager writer = new SaveManager(new JsonSaveSerializer(), storage);
            writer.Register(written);
            writer.Save();

            VehicleTestRig reloadedRig = new VehicleTestRig();
            DealershipService read = BuildService(reloadedRig, 5UL);
            SaveManager reader = new SaveManager(new JsonSaveSerializer(), storage);
            reader.Register(read);
            Assert.IsTrue(reader.Load().Success);

            Assert.IsNull(read.GetInventory(DefaultDealerships.PortAuto).Find(target),
                "Buying a car and reloading must not duplicate it back onto the lot.");
        }

        [Test]
        public void ADealershipAddedAfterTheSaveWasWrittenIsStockedFresh()
        {
            VehicleTestRig session = new VehicleTestRig();

            // Save a world with only one dealership.
            DealershipService partial = new DealershipService(
                session.Ownership, session.Catalog, session.Vehicles.Valuation,
                new DealershipInventoryGenerator(session.Catalog, session.Vehicles.Valuation, session.IdFactory),
                session.Clock, session.Bus, 17UL);
            partial.Register(DefaultDealerships.Build()[0]);
            partial.StockAll();

            InMemorySaveStorage storage = new InMemorySaveStorage();
            SaveManager writer = new SaveManager(new JsonSaveSerializer(), storage);
            writer.Register(partial);
            writer.Save();

            // Load it into a build that ships all five.
            VehicleTestRig reloadedRig = new VehicleTestRig();
            DealershipService full = BuildService(reloadedRig, 17UL);
            SaveManager reader = new SaveManager(new JsonSaveSerializer(), storage);
            reader.Register(full);
            Assert.IsTrue(reader.Load().Success);

            DealershipInventory newLot = full.GetInventory(DefaultDealerships.TheCarriageHouse);
            Assert.IsTrue(newLot.Count > 0,
                "A dealership that did not exist when the save was written must not be empty.");
        }
    }
}
