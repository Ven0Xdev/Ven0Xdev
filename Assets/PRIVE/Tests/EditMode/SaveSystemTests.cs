using System.Collections.Generic;
using NUnit.Framework;
using Prive.Core;
using Prive.Economy;
using Prive.Player;
using Prive.Save;
using Prive.Social;
using Prive.Travel;
using Prive.World;

namespace Prive.Tests
{
    internal sealed class StubSaveable : ISaveable
    {
        public StubSaveable(string key) { SaveKey = key; }

        public string SaveKey { get; private set; }
        public int Value;
        public string Text = "";
        public bool RestoreShouldThrow;
        public int RestoreCalls;

        public SaveNode Capture()
        {
            SaveNode node = SaveNode.NewObject();
            node.Set("value", Value);
            node.Set("text", Text);
            return node;
        }

        public void Restore(SaveNode node)
        {
            RestoreCalls++;
            if (RestoreShouldThrow) throw new System.InvalidOperationException("deliberate failure");

            Value = node.GetInt("value");
            Text = node.GetString("text", "");
        }
    }

    internal sealed class RenameMigration : ISaveMigration
    {
        public int FromVersion { get { return 1; } }
        public string Description { get { return "v1 -> v2: rename 'thing' to 'widget'"; } }

        public void Upgrade(SaveGame save)
        {
            SaveNode old = save.GetNode("thing");
            if (old == null) return;

            save.SetNode("widget", old);
            save.RemoveNode("thing");
        }
    }

    [TestFixture]
    public class JsonSerializerTests
    {
        private JsonSaveSerializer _serializer;

        [SetUp]
        public void SetUp()
        {
            _serializer = new JsonSaveSerializer();
        }

        private SaveNode RoundTrip(SaveNode node)
        {
            return _serializer.Deserialize(_serializer.Serialize(node));
        }

        [Test]
        public void PrimitivesRoundTrip()
        {
            SaveNode node = SaveNode.NewObject();
            node.Set("flag", true);
            node.Set("count", 42);
            node.Set("ratio", 0.625);
            node.Set("name", "Vermillion Bay");
            node.Set("nothing", SaveNode.Null());

            SaveNode restored = RoundTrip(node);

            Assert.IsTrue(restored.GetBool("flag"));
            Assert.AreEqual(42, restored.GetInt("count"));
            Assert.AreEqual(0.625, restored.GetDouble("ratio"), 0.0000001);
            Assert.AreEqual("Vermillion Bay", restored.GetString("name"));
            Assert.IsTrue(restored.GetNode("nothing").IsNull);
        }

        [Test]
        public void LargeIntegersSurviveExactly()
        {
            // A double would lose precision well below this; money must not.
            const long cents = 92233720368547758L;

            SaveNode node = SaveNode.NewObject();
            node.Set("cents", cents);

            SaveNode restored = RoundTrip(node);

            Assert.AreEqual(cents, restored.GetLong("cents"));
            Assert.AreEqual(SaveNodeType.Integer, restored.GetNode("cents").Type);
        }

        [Test]
        public void FloatsStayFloatsAndIntegersStayIntegers()
        {
            SaveNode node = SaveNode.NewObject();
            node.Set("whole", 5.0);
            node.Set("integer", 5);

            SaveNode restored = RoundTrip(node);

            Assert.AreEqual(SaveNodeType.Float, restored.GetNode("whole").Type,
                "A float written as 5.0 must not come back as an integer.");
            Assert.AreEqual(SaveNodeType.Integer, restored.GetNode("integer").Type);
        }

        [Test]
        public void NestedStructuresRoundTrip()
        {
            SaveNode root = SaveNode.NewObject();
            SaveNode list = SaveNode.NewArray();

            for (int i = 0; i < 3; i++)
            {
                SaveNode item = SaveNode.NewObject();
                item.Set("index", i);
                item.Set("label", "item" + i);
                list.Add(item);
            }

            root.Set("items", list);
            root.GetOrCreateObject("meta").Set("version", 3);

            SaveNode restored = RoundTrip(root);

            Assert.AreEqual(3, restored.GetNode("items").Count);
            Assert.AreEqual("item2", restored.GetNode("items")[2].GetString("label"));
            Assert.AreEqual(3, restored.GetNode("meta").GetInt("version"));
        }

        [Test]
        public void StringsWithAwkwardCharactersRoundTrip()
        {
            const string awkward = "Quote \" backslash \\ newline \n tab \t unicode é PRIVÉ";

            SaveNode node = SaveNode.NewObject();
            node.Set("text", awkward);

            Assert.AreEqual(awkward, RoundTrip(node).GetString("text"));
        }

        [Test]
        public void EmptyContainersRoundTrip()
        {
            SaveNode root = SaveNode.NewObject();
            root.Set("emptyObject", SaveNode.NewObject());
            root.Set("emptyArray", SaveNode.NewArray());

            SaveNode restored = RoundTrip(root);

            Assert.AreEqual(0, restored.GetNode("emptyObject").Count);
            Assert.IsTrue(restored.GetNode("emptyArray").IsArray);
        }

        [Test]
        public void PrettyOutputParsesIdentically()
        {
            SaveNode root = SaveNode.NewObject();
            root.Set("a", 1);
            root.GetOrCreateObject("nested").Set("b", "two");
            root.Set("list", SaveNode.NewArray().Add(SaveNode.From(1)).Add(SaveNode.From(2)));

            JsonSaveSerializer pretty = new JsonSaveSerializer(pretty: true);
            SaveNode restored = pretty.Deserialize(pretty.Serialize(root));

            Assert.AreEqual(1, restored.GetInt("a"));
            Assert.AreEqual("two", restored.GetNode("nested").GetString("b"));
            Assert.AreEqual(2, restored.GetNode("list").Count);
        }

        [Test]
        public void MalformedPayloadsAreRejectedClearly()
        {
            Assert.Throws<SaveFormatException>(() => _serializer.Deserialize("{"));
            Assert.Throws<SaveFormatException>(() => _serializer.Deserialize("{\"a\":}"));
            Assert.Throws<SaveFormatException>(() => _serializer.Deserialize("{\"a\":1} trailing"));
            Assert.Throws<SaveFormatException>(() => _serializer.Deserialize(""));
        }

        [Test]
        public void MissingOrWrongTypedValuesFallBackInsteadOfThrowing()
        {
            // Forward compatibility: a save written before a field existed must still load.
            SaveNode node = SaveNode.NewObject();
            node.Set("text", "not a number");

            Assert.AreEqual(7, node.GetInt("absent", 7));
            Assert.AreEqual(7, node.GetInt("text", 7));
            Assert.IsNull(node.GetNode("absent"));
        }

        [Test]
        public void ObjectKeysAreOrderedSoSavesAreDiffable()
        {
            SaveNode node = SaveNode.NewObject();
            node.Set("zebra", 1);
            node.Set("alpha", 2);
            node.Set("mike", 3);

            List<string> keys = new List<string>(node.Keys);

            Assert.AreEqual("alpha", keys[0]);
            Assert.AreEqual("mike", keys[1]);
            Assert.AreEqual("zebra", keys[2]);
        }
    }

    [TestFixture]
    public class SaveManagerTests
    {
        private JsonSaveSerializer _serializer;
        private InMemorySaveStorage _storage;

        [SetUp]
        public void SetUp()
        {
            _serializer = new JsonSaveSerializer();
            _storage = new InMemorySaveStorage();
        }

        private SaveManager NewManager(SaveMigrator migrator = null)
        {
            return new SaveManager(_serializer, _storage, migrator, "test-build");
        }

        [Test]
        public void SaveThenLoad_RestoresEveryRegisteredSystem()
        {
            SaveManager writer = NewManager();
            StubSaveable a = new StubSaveable("alpha") { Value = 11, Text = "eleven" };
            StubSaveable b = new StubSaveable("beta") { Value = 22, Text = "twenty-two" };
            writer.Register(a);
            writer.Register(b);
            writer.Save();

            SaveManager reader = NewManager();
            StubSaveable a2 = new StubSaveable("alpha");
            StubSaveable b2 = new StubSaveable("beta");
            reader.Register(a2);
            reader.Register(b2);

            LoadOutcome outcome = reader.Load();

            Assert.IsTrue(outcome.Success);
            Assert.AreEqual(11, a2.Value);
            Assert.AreEqual("twenty-two", b2.Text);
        }

        [Test]
        public void LoadingAnEmptySlot_ReportsMissingRatherThanFailing()
        {
            LoadOutcome outcome = NewManager().Load("never-saved");

            Assert.IsFalse(outcome.Success);
            Assert.IsTrue(outcome.IsMissing);
            Assert.IsNull(outcome.Error);
        }

        [Test]
        public void LoadingACorruptSlot_ReportsTheErrorWithoutThrowing()
        {
            _storage.Write("broken", "{ this is not json");

            LoadOutcome outcome = NewManager().Load("broken");

            Assert.IsFalse(outcome.Success);
            Assert.IsFalse(outcome.IsMissing);
            Assert.IsNotNull(outcome.Error);
        }

        [Test]
        public void ASystemNewerThanTheSave_KeepsItsDefaults()
        {
            SaveManager writer = NewManager();
            writer.Register(new StubSaveable("alpha") { Value = 5 });
            writer.Save();

            SaveManager reader = NewManager();
            StubSaveable newSystem = new StubSaveable("brand_new") { Value = 99 };
            reader.Register(new StubSaveable("alpha"));
            reader.Register(newSystem);

            Assert.IsTrue(reader.Load().Success);
            Assert.AreEqual(99, newSystem.Value, "A system the save predates must not be zeroed.");
            Assert.AreEqual(0, newSystem.RestoreCalls);
        }

        [Test]
        public void UnknownNodesSurviveALoadSaveRoundTrip()
        {
            // A save touched by a newer build must not be quietly destroyed by an older one.
            SaveManager newer = NewManager();
            newer.Register(new StubSaveable("alpha") { Value = 1 });
            newer.Register(new StubSaveable("future_system") { Value = 1234 });
            newer.Save();

            SaveManager older = NewManager();
            older.Register(new StubSaveable("alpha"));

            LoadOutcome outcome = older.Load();
            Assert.IsTrue(outcome.Success);
            Assert.AreEqual(1, outcome.Report.UnknownNodesPreserved.Count);
            Assert.AreEqual("future_system", outcome.Report.UnknownNodesPreserved[0]);

            older.Save();

            SaveManager newerAgain = NewManager();
            StubSaveable future = new StubSaveable("future_system");
            newerAgain.Register(new StubSaveable("alpha"));
            newerAgain.Register(future);
            Assert.IsTrue(newerAgain.Load().Success);

            Assert.AreEqual(1234, future.Value, "The older build must have written the unknown node back.");
        }

        [Test]
        public void OneSystemFailingToRestore_DoesNotCostThePlayerTheRest()
        {
            SaveManager writer = NewManager();
            writer.Register(new StubSaveable("alpha") { Value = 7 });
            writer.Register(new StubSaveable("beta") { Value = 8 });
            writer.Save();

            SaveManager reader = NewManager();
            StubSaveable broken = new StubSaveable("alpha") { RestoreShouldThrow = true };
            StubSaveable healthy = new StubSaveable("beta");
            reader.Register(broken);
            reader.Register(healthy);

            LoadOutcome outcome = reader.Load();

            Assert.IsTrue(outcome.Success);
            Assert.IsTrue(outcome.Report.HasErrors);
            Assert.AreEqual(8, healthy.Value);
        }

        [Test]
        public void DuplicateSaveKeys_AreRejectedAtRegistration()
        {
            SaveManager manager = NewManager();
            manager.Register(new StubSaveable("alpha"));

            Assert.Throws<System.InvalidOperationException>(() => manager.Register(new StubSaveable("alpha")));
        }

        [Test]
        public void MigrationsRunInOrderAndAreReported()
        {
            SaveGame legacy = new SaveGame(version: 1, buildId: "old");
            legacy.SetNode("thing", SaveNode.NewObject().Set("value", 5));

            SaveMigrator migrator = new SaveMigrator();
            migrator.Register(new RenameMigration());

            SaveLoadReport report = new SaveLoadReport();
            migrator.Migrate(legacy, report, targetVersion: 2);

            Assert.AreEqual(2, legacy.Version);
            Assert.IsFalse(legacy.HasNode("thing"));
            Assert.AreEqual(5, legacy.GetNode("widget").GetInt("value"));
            Assert.AreEqual(1, report.MigrationsApplied.Count);
        }

        [Test]
        public void ASaveAlreadyAtTheCurrentVersion_NeedsNoMigration()
        {
            SaveGame current = new SaveGame(SaveVersion.Current, "current");
            SaveLoadReport report = new SaveLoadReport();

            new SaveMigrator().Migrate(current, report);

            Assert.AreEqual(SaveVersion.Current, current.Version);
            Assert.AreEqual(0, report.MigrationsApplied.Count);
            Assert.IsFalse(report.HasErrors);
        }

        [Test]
        public void AMissingMigrationStep_IsAClearFailureNotSilentDataLoss()
        {
            SaveGame ancient = new SaveGame(version: 0, buildId: "ancient");

            Assert.Throws<SaveFormatException>(
                () => new SaveMigrator().Migrate(ancient, new SaveLoadReport(), targetVersion: 2));
        }

        [Test]
        public void TwoMigrationsFromTheSameVersion_AreRejected()
        {
            SaveMigrator migrator = new SaveMigrator();
            migrator.Register(new RenameMigration());

            Assert.Throws<System.InvalidOperationException>(() => migrator.Register(new RenameMigration()));
        }

        [Test]
        public void ASaveFromANewerBuild_IsReportedRatherThanMisread()
        {
            SaveGame future = new SaveGame(version: SaveVersion.Current + 5, buildId: "future");
            SaveLoadReport report = new SaveLoadReport();

            new SaveMigrator().Migrate(future, report);

            Assert.IsTrue(report.HasErrors);
        }

        [Test]
        public void SlotsCanBeListedAndDeleted()
        {
            SaveManager manager = NewManager();
            manager.Register(new StubSaveable("alpha"));

            manager.Save("slotA");
            manager.Save("slotB");

            Assert.IsTrue(manager.SlotExists("slotA"));
            Assert.AreEqual(2, new List<string>(manager.ListSlots()).Count);

            manager.DeleteSlot("slotA");
            Assert.IsFalse(manager.SlotExists("slotA"));
        }
    }

    [TestFixture]
    public class DelegateSaveableTests
    {
        [Test]
        public void CapturesAndRestoresThroughTheSuppliedFunctions()
        {
            long value = 42;

            DelegateSaveable saveable = new DelegateSaveable(
                "clock",
                () => SaveNode.NewObject().Set("value", value),
                node => value = node.GetLong("value"));

            SaveNode captured = saveable.Capture();
            value = 0;
            saveable.Restore(captured);

            Assert.AreEqual("clock", saveable.SaveKey);
            Assert.AreEqual(42L, value);
        }

        [Test]
        public void RequiresAKeyAndBothFunctions()
        {
            Assert.Throws<System.ArgumentException>(
                () => new DelegateSaveable("", SaveNode.NewObject, node => { }));
            Assert.Throws<System.ArgumentNullException>(
                () => new DelegateSaveable("k", null, node => { }));
            Assert.Throws<System.ArgumentNullException>(
                () => new DelegateSaveable("k", SaveNode.NewObject, null));
        }

        [Test]
        public void RoundTripsGameTimeThroughASaveManager()
        {
            // Exactly how GameBootstrap persists the clock.
            GameTime saved = GameTime.FromDate(2025, 8, 14, 21, 30);
            GameTime restored = GameTime.Start;

            SaveManager manager = new SaveManager(new JsonSaveSerializer(), new InMemorySaveStorage());
            manager.Register(new DelegateSaveable(
                "clock",
                () => SaveNode.NewObject().Set("time", saved),
                node => restored = node.GetTime("time")));

            manager.Save();
            Assert.IsTrue(manager.Load().Success);

            Assert.AreEqual(saved, restored);
        }
    }

    [TestFixture]
    public class GameStateRoundTripTests
    {
        /// <summary>
        /// The end-to-end guarantee Phase 1 exists to provide: play, save, reload, and the
        /// world is exactly where it was — money, history, standing, location and time.
        /// </summary>
        [Test]
        public void AWholeSessionSurvivesSaveAndReload()
        {
            InMemorySaveStorage storage = new InMemorySaveStorage();
            JsonSaveSerializer serializer = new JsonSaveSerializer();

            // --- session one ---
            EventBus bus = new EventBus();
            GameClock clock = new GameClock(bus);
            WorldLocationCatalog world = DefaultWorldContent.Build();

            PlayerEconomy economy = new PlayerEconomy(bus, clock);
            SocialStatus status = new SocialStatus(bus);
            PlayerProfile player = new PlayerProfile(bus, economy, status, new RuntimeIdFactory(),
                WorldLocations.DefaultStartLocation, "Alex");

            PlayerTravelState travelState = new PlayerTravelState(bus, WorldLocations.VermillionBay);

            SaveManager saves = new SaveManager(serializer, storage, null, "1.0.0");
            saves.Register(player);
            saves.Register(economy);
            saves.Register(status);
            saves.Register(travelState);

            // Play a little.
            clock.Skip(3L * GameTime.MinutesPerDay + 480, "session");
            economy.Receive(Money.FromDollars(18000L), TransactionCategory.VehicleSale, "Flipped a coupe");
            economy.TryPay(Money.FromDollars(2200L), TransactionCategory.Lifestyle, "A very good night out");
            status.AddFame(140.0);
            status.AddReputation(25.0);
            status.AddLifestyle(220.0);
            player.MoveTo(WorldLocations.VermillionBayDistricts.Marina);
            player.IdFactory.Next("vehicle");

            Money expectedLiquid = economy.LiquidTotal;
            long expectedMinutes = clock.Now.TotalMinutes;
            SocialClass expectedClass = status.Class;
            long expectedIdCounter = player.IdFactory.Counter;
            int expectedLedgerCount = economy.Ledger.Count;

            saves.Save("session");

            // --- session two: a completely fresh object graph ---
            EventBus bus2 = new EventBus();
            GameClock clock2 = new GameClock(bus2);

            PlayerEconomy economy2 = new PlayerEconomy(bus2, clock2);
            SocialStatus status2 = new SocialStatus(bus2);
            PlayerProfile player2 = new PlayerProfile(bus2, economy2, status2, new RuntimeIdFactory(),
                WorldLocations.DefaultStartLocation);
            PlayerTravelState travelState2 = new PlayerTravelState(bus2, WorldLocations.VermillionBay);

            SaveManager saves2 = new SaveManager(serializer, storage, null, "1.0.0");
            saves2.Register(player2);
            saves2.Register(economy2);
            saves2.Register(status2);
            saves2.Register(travelState2);

            LoadOutcome outcome = saves2.Load("session");
            Assert.IsTrue(outcome.Success, outcome.Error);
            Assert.IsFalse(outcome.Report.HasErrors, outcome.Report.ToString());

            // The clock is restored by the bootstrap layer from the player's saved time; here
            // the assertions cover everything the pure systems own.
            Assert.AreEqual("Alex", player2.DisplayName);
            Assert.AreEqual(WorldLocations.VermillionBayDistricts.Marina, player2.CurrentLocation);
            Assert.AreEqual(expectedLiquid, economy2.LiquidTotal);
            Assert.AreEqual(expectedLedgerCount, economy2.Ledger.Count);
            Assert.AreEqual(Money.FromDollars(18000L), economy2.Ledger.LifetimeIncome);
            Assert.AreEqual(140.0, status2.Fame, 0.0001);
            Assert.AreEqual(25.0, status2.Reputation, 0.0001);
            Assert.AreEqual(expectedClass, status2.Class);
            Assert.AreEqual(expectedIdCounter, player2.IdFactory.Counter);

            // The restored factory must not re-issue an id the world already used.
            Assert.AreEqual("vehicle." + (expectedIdCounter + 1), player2.IdFactory.Next("vehicle").Name);

            // And the game time itself survives, restored onto a fresh clock.
            clock2.RestoreTime(GameTime.FromMinutes(expectedMinutes));
            Assert.AreEqual(expectedMinutes, clock2.Now.TotalMinutes);

            travelState.Dispose();
            travelState2.Dispose();
        }
    }
}
