using System.Collections.Generic;
using NUnit.Framework;
using Prive.Core;
using Prive.Economy;
using Prive.Player;
using Prive.Social;
using Prive.Travel;
using Prive.World;

namespace Prive.Tests
{
    [TestFixture]
    public class WorldCatalogTests
    {
        private WorldLocationCatalog _catalog;

        [SetUp]
        public void SetUp()
        {
            _catalog = DefaultWorldContent.Build();
        }

        [Test]
        public void ShippedContent_HasNoDanglingReferences()
        {
            IReadOnlyList<string> problems = _catalog.Validate();

            Assert.AreEqual(0, problems.Count,
                problems.Count == 0 ? "" : string.Join("; ", new List<string>(problems).ToArray()));
        }

        [Test]
        public void VermillionBay_IsThePlayableStartingCity()
        {
            CityData city = _catalog.GetCity(WorldLocations.VermillionBay);

            Assert.IsNotNull(city);
            Assert.IsTrue(city.IsAvailable);
            Assert.AreEqual(9, city.Districts.Count);
            Assert.IsTrue(city.Supports(TransportCapabilities.Marina));
        }

        [Test]
        public void DistrictsCoverTheDesignedPrestigeRange()
        {
            DistrictData industrial = _catalog.GetDistrict(WorldLocations.VermillionBayDistricts.Industrial);
            DistrictData marina = _catalog.GetDistrict(WorldLocations.VermillionBayDistricts.Marina);

            Assert.AreEqual(PrestigeTier.Industrial, industrial.Prestige);
            Assert.AreEqual(PrestigeTier.Elite, marina.Prestige);
        }

        [Test]
        public void ResolveCity_WorksFromADistrictOrAnAirport()
        {
            CityData fromDistrict = _catalog.ResolveCity(WorldLocations.VermillionBayDistricts.SouthShore);
            CityData fromAirport = _catalog.ResolveCity(WorldLocations.VermillionBayInternational);

            Assert.AreEqual(WorldLocations.VermillionBay, fromDistrict.Id);
            Assert.AreEqual(WorldLocations.VermillionBay, fromAirport.Id);
        }

        [Test]
        public void FutureDestinationsExistButAreNotYetAvailable()
        {
            CityData dubai = _catalog.GetCity(WorldLocations.Dubai);

            Assert.IsNotNull(dubai, "Reserving the id from day one is what keeps Phase 7 content-only.");
            Assert.IsFalse(dubai.IsAvailable);
        }

        [Test]
        public void DistrictIdsAreScopedUnderTheirCity()
        {
            WorldLocationId marina = WorldLocations.VermillionBayDistricts.Marina;

            Assert.IsTrue(marina.IsChild);
            Assert.AreEqual(WorldLocations.VermillionBay, marina.Parent);
            Assert.AreEqual("loc:usa_vermillion_bay.marina", marina.Value);
        }

        [Test]
        public void EveryDistrictHasAStreamingAddress()
        {
            IReadOnlyList<DistrictData> districts = _catalog.GetDistrictsOf(WorldLocations.VermillionBay);

            Assert.AreEqual(9, districts.Count);
            for (int i = 0; i < districts.Count; i++)
            {
                Assert.IsNotEmpty(districts[i].SceneAddress,
                    districts[i].Id + " has no addressables scene key.");
            }
        }

        [Test]
        public void RegisteringTheSameLocationTwice_IsRejected()
        {
            WorldLocationCatalog catalog = new WorldLocationCatalog();
            CountryData country = new CountryData(
                WorldLocations.CountryUsa, "United States", "USA", "USD", -300, true, null);

            catalog.AddCountry(country);
            Assert.Throws<System.InvalidOperationException>(() => catalog.AddCountry(country));
        }
    }

    [TestFixture]
    public class WorldLocationConstantsTests
    {
        /// <summary>
        /// Every declared location id must be valid the moment it is read.
        /// </summary>
        /// <remarks>
        /// Guards a real bug this project already hit: the district constants were derived
        /// from the <c>VermillionBay</c> field, but a nested static class initialises on first
        /// touch of its own members, which can precede the outer class's field initialisers.
        /// Reading <c>VermillionBayDistricts.Downtown</c> before anything else therefore threw.
        /// The ids are now built from <c>const string</c> paths, which have no initialisation
        /// order; this test fails loudly if that is ever undone.
        /// </remarks>
        [Test]
        public void EveryDeclaredLocationIdIsValid()
        {
            AssertAllLocationIdsValid(typeof(WorldLocations));

            foreach (System.Type nested in typeof(WorldLocations).GetNestedTypes(
                System.Reflection.BindingFlags.Public))
            {
                AssertAllLocationIdsValid(nested);
            }
        }

        private static void AssertAllLocationIdsValid(System.Type type)
        {
            System.Reflection.FieldInfo[] fields = type.GetFields(
                System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Static);

            int checkedCount = 0;

            for (int i = 0; i < fields.Length; i++)
            {
                if (fields[i].FieldType != typeof(WorldLocationId)) continue;

                WorldLocationId id = (WorldLocationId)fields[i].GetValue(null);
                Assert.IsTrue(id.IsValid, type.Name + "." + fields[i].Name + " is not a valid location id.");
                checkedCount++;
            }

            Assert.Greater(checkedCount, 0, "Expected " + type.Name + " to declare location ids.");
        }
    }

    [TestFixture]
    public class GreatCircleTests
    {
        [Test]
        public void DistanceToSelfIsZero()
        {
            Assert.AreEqual(0.0, GreatCircle.DistanceKm(25.9, -80.4, 25.9, -80.4), 0.0001);
        }

        [Test]
        public void DistanceIsSymmetric()
        {
            double there = GreatCircle.DistanceKm(25.9, -80.4, 51.51, -0.13);
            double back = GreatCircle.DistanceKm(51.51, -0.13, 25.9, -80.4);

            Assert.AreEqual(there, back, 0.0001);
        }

        [Test]
        public void TransatlanticDistanceIsPlausible()
        {
            // Vermillion Bay to London is a little over 7,000 km.
            double km = GreatCircle.DistanceKm(25.9, -80.4, 51.51, -0.13);

            Assert.Greater(km, 6500.0);
            Assert.Less(km, 8000.0);
        }
    }

    [TestFixture]
    public class TravelTests
    {
        private EventBus _bus;
        private GameClock _clock;
        private WorldLocationCatalog _world;
        private PlayerProfile _player;
        private TravelService _travel;

        [SetUp]
        public void SetUp()
        {
            _bus = new EventBus();
            _clock = new GameClock(_bus);
            _world = DefaultWorldContent.Build();

            PlayerEconomy economy = new PlayerEconomy(_bus, _clock,
                new PlayerWallet(Money.FromDollars(5000L), Money.FromDollars(95000L)));

            _player = new PlayerProfile(_bus, economy, new SocialStatus(_bus), new RuntimeIdFactory(),
                WorldLocations.DefaultStartLocation);

            _travel = new TravelService(_world, _player, _clock, _bus);
        }

        private TravelQuote QuoteFor(TravelMode mode, WorldLocationId to)
        {
            IReadOnlyList<TravelQuote> quotes = _travel.GetQuotes(_player.CurrentLocation, to);
            for (int i = 0; i < quotes.Count; i++)
            {
                if (quotes[i].Mode == mode) return quotes[i];
            }

            Assert.Fail("No quote produced for " + mode);
            return default(TravelQuote);
        }

        [Test]
        public void GetQuotes_ReturnsEveryModeIncludingUnavailableOnes()
        {
            IReadOnlyList<TravelQuote> quotes = _travel.GetQuotes(
                WorldLocations.VermillionBay, WorldLocations.London);

            Assert.AreEqual(8, quotes.Count,
                "The travel app shows unavailable modes too, so the player learns what would unlock them.");
        }

        [Test]
        public void TravelToAnUnbuiltCity_IsQuotedButNotBookable()
        {
            TravelQuote quote = QuoteFor(TravelMode.CommercialEconomy, WorldLocations.Dubai);

            Assert.IsFalse(quote.IsAvailable);
            Assert.AreEqual(TravelUnavailableReason.DestinationNotAvailable, quote.UnavailableReason);
            Assert.IsTrue(_travel.Book(quote).IsFailure);
        }

        [Test]
        public void TravelWithinTheSameCity_IsNotATrip()
        {
            TravelQuote quote = QuoteFor(TravelMode.GroundTransfer, WorldLocations.VermillionBay);

            Assert.IsFalse(quote.IsAvailable);
            Assert.AreEqual(TravelUnavailableReason.SameLocation, quote.UnavailableReason);
        }

        [Test]
        public void OwnedJet_IsUnavailableUntilTheAviationSystemSaysOtherwise()
        {
            WorldLocationCatalog catalog = BuildTwoCityWorld();
            TravelService travel = BuildServiceFor(catalog);

            TravelQuote before = QuoteForMode(travel.GetQuotes(CityA, CityB), TravelMode.OwnedJet);
            Assert.IsFalse(before.IsAvailable);
            Assert.AreEqual(TravelUnavailableReason.RequiresOwnedAsset, before.UnavailableReason);

            travel.SetOwnedAircraftCheck(() => true);

            TravelQuote after = QuoteForMode(travel.GetQuotes(CityA, CityB), TravelMode.OwnedJet);
            Assert.IsTrue(after.IsAvailable, "Owning a jet is the only thing that gates this mode.");
        }

        [Test]
        public void OwnedJet_CostsLessToFlyThanCharteringOne()
        {
            WorldLocationCatalog catalog = BuildTwoCityWorld();
            TravelService travel = BuildServiceFor(catalog);
            travel.SetOwnedAircraftCheck(() => true);

            IReadOnlyList<TravelQuote> quotes = travel.GetQuotes(CityA, CityB);
            TravelQuote owned = QuoteForMode(quotes, TravelMode.OwnedJet);
            TravelQuote charter = QuoteForMode(quotes, TravelMode.PrivateJetCharter);

            Assert.IsTrue(owned.Cost < charter.Cost,
                "Owning removes the charter margin; only operating cost remains.");
        }

        [Test]
        public void ModesAreRefusedBeyondTheirRange()
        {
            // The test cities are about 1,000 km apart -- well past helicopter range.
            WorldLocationCatalog catalog = BuildTwoCityWorld();
            TravelService travel = BuildServiceFor(catalog);

            TravelQuote heli = QuoteForMode(travel.GetQuotes(CityA, CityB), TravelMode.Helicopter);
            Assert.AreEqual(TravelUnavailableReason.OutOfRange, heli.UnavailableReason);
        }

        [Test]
        public void AnUnbuiltDestinationOutranksEveryOtherReason()
        {
            // Deliberate precedence: "not in the game yet" is more useful to show the player
            // than "out of range", so it is reported first.
            TravelQuote heli = QuoteFor(TravelMode.Helicopter, WorldLocations.London);
            Assert.AreEqual(TravelUnavailableReason.DestinationNotAvailable, heli.UnavailableReason);
        }

        [Test]
        public void PricingRisesWithClassAndExclusivity()
        {
            // Priced against a real route, using an available destination.
            WorldLocationCatalog catalog = BuildTwoCityWorld();
            TravelService travel = BuildServiceFor(catalog);

            IReadOnlyList<TravelQuote> quotes = travel.GetQuotes(CityA, CityB);
            Money economy = Money.Zero, business = Money.Zero, first = Money.Zero, charter = Money.Zero;

            for (int i = 0; i < quotes.Count; i++)
            {
                if (quotes[i].Mode == TravelMode.CommercialEconomy) economy = quotes[i].Cost;
                if (quotes[i].Mode == TravelMode.CommercialBusiness) business = quotes[i].Cost;
                if (quotes[i].Mode == TravelMode.CommercialFirst) first = quotes[i].Cost;
                if (quotes[i].Mode == TravelMode.PrivateJetCharter) charter = quotes[i].Cost;
            }

            Assert.IsTrue(economy < business, "Business must cost more than economy.");
            Assert.IsTrue(business < first, "First must cost more than business.");
            Assert.IsTrue(first < charter, "A charter must cost more than a first-class seat.");
        }

        [Test]
        public void PrivateTravelIsFasterDespiteTheSameDistance()
        {
            WorldLocationCatalog catalog = BuildTwoCityWorld();
            TravelService travel = BuildServiceFor(catalog);

            IReadOnlyList<TravelQuote> quotes = travel.GetQuotes(CityA, CityB);
            int economyMinutes = 0, charterMinutes = 0;

            for (int i = 0; i < quotes.Count; i++)
            {
                if (quotes[i].Mode == TravelMode.CommercialEconomy) economyMinutes = quotes[i].DurationMinutes;
                if (quotes[i].Mode == TravelMode.PrivateJetCharter) charterMinutes = quotes[i].DurationMinutes;
            }

            Assert.Greater(economyMinutes, charterMinutes,
                "Skipping check-in and security is most of what the money buys.");
        }

        [Test]
        public void Booking_ChargesThePlayerAndIssuesATicket()
        {
            WorldLocationCatalog catalog = BuildTwoCityWorld();
            TravelService travel = BuildServiceFor(catalog);
            TravelQuote quote = FirstAvailable(travel.GetQuotes(CityA, CityB));

            Money before = _player.Economy.LiquidTotal;
            OperationResult<TravelTicket> booking = travel.Book(quote);

            Assert.IsTrue(booking.IsSuccess);
            Assert.IsTrue(booking.Value.IsValid);
            Assert.AreEqual(before - quote.Cost, _player.Economy.LiquidTotal);
            Assert.AreEqual(TransactionCategory.Travel, _player.Economy.Ledger.Records[0].Category);
        }

        [Test]
        public void BookingWithoutTheMoney_Fails()
        {
            WorldLocationCatalog catalog = BuildTwoCityWorld();
            TravelService travel = BuildServiceFor(catalog);
            TravelQuote charter = QuoteForMode(travel.GetQuotes(CityA, CityB), TravelMode.PrivateJetCharter);

            _player.Economy.TryPay(_player.Economy.LiquidTotal, TransactionCategory.Other, "drain");

            OperationResult<TravelTicket> booking = travel.Book(charter);

            Assert.IsTrue(booking.IsFailure);
            Assert.AreEqual(FailureReason.InsufficientFunds, booking.Reason);
        }

        [Test]
        public void Executing_AdvancesTheClockMovesThePlayerAndPublishesArrival()
        {
            WorldLocationCatalog catalog = BuildTwoCityWorld();
            TravelService travel = BuildServiceFor(catalog);
            TravelQuote quote = FirstAvailable(travel.GetQuotes(CityA, CityB));

            PlayerArrivedEvent arrival = default(PlayerArrivedEvent);
            int arrivals = 0;
            _bus.Subscribe<PlayerArrivedEvent>(e => { arrival = e; arrivals++; });

            long minutesBefore = _clock.Now.TotalMinutes;
            OperationResult<TravelTicket> ticket = travel.Book(quote);
            Assert.IsTrue(ticket.IsSuccess);
            Assert.IsTrue(travel.Execute(ticket.Value).IsSuccess);

            Assert.AreEqual(minutesBefore + quote.DurationMinutes, _clock.Now.TotalMinutes);
            Assert.AreEqual(CityB, _player.CurrentLocation);
            Assert.AreEqual(1, arrivals);
            Assert.AreEqual(CityB, arrival.To);
        }

        [Test]
        public void ArrivingByPrivateJet_GrantsMoreFameThanEconomy()
        {
            WorldLocationCatalog catalog = BuildTwoCityWorld();
            TravelService travel = BuildServiceFor(catalog);

            TravelQuote economy = QuoteForMode(travel.GetQuotes(CityA, CityB), TravelMode.CommercialEconomy);
            TravelQuote charter = QuoteForMode(travel.GetQuotes(CityA, CityB), TravelMode.PrivateJetCharter);

            Assert.AreEqual(0.0, economy.FameDelta, 0.0001);
            Assert.Greater(charter.FameDelta, 0.0);
        }

        [Test]
        public void TravelState_RecordsTheJourney()
        {
            WorldLocationCatalog catalog = BuildTwoCityWorld();
            TravelService travel = BuildServiceFor(catalog);

            using (PlayerTravelState state = new PlayerTravelState(_bus, CityA))
            {
                Assert.IsTrue(state.HasVisited(CityA));
                Assert.IsFalse(state.HasVisited(CityB));

                TravelQuote quote = FirstAvailable(travel.GetQuotes(CityA, CityB));
                travel.Travel(quote);

                Assert.AreEqual(1, state.TripCount);
                Assert.IsTrue(state.HasVisited(CityB));
                Assert.AreEqual(quote.DurationMinutes, state.TotalTravelMinutes);
            }
        }

        // --- helpers ------------------------------------------------------------

        private static readonly WorldLocationId CityA = WorldLocationId.FromPath("test_a");
        private static readonly WorldLocationId CityB = WorldLocationId.FromPath("test_b");
        private static readonly WorldLocationId TestCountry = WorldLocationId.FromPath("testland");

        /// <summary>Two available cities 1,000 km apart, so booking and execution can be exercised.</summary>
        private static WorldLocationCatalog BuildTwoCityWorld()
        {
            WorldLocationCatalog catalog = new WorldLocationCatalog();

            catalog.AddCountry(new CountryData(TestCountry, "Testland", "TST", "USD", 0, true,
                new List<WorldLocationId> { CityA, CityB }));

            TransportCapabilities all = TransportCapabilities.RoadLink
                                        | TransportCapabilities.CommercialAirline
                                        | TransportCapabilities.PrivateAviation
                                        | TransportCapabilities.Helipad
                                        | TransportCapabilities.Marina;

            catalog.AddCity(new CityData(CityA, TestCountry, "Alpha", 0.0, 0.0, 1.0, all, true, null, null));
            catalog.AddCity(new CityData(CityB, TestCountry, "Beta", 9.0, 0.0, 1.0, all, true, null, null));

            return catalog;
        }

        private TravelService BuildServiceFor(WorldLocationCatalog catalog)
        {
            _player.MoveTo(CityA);
            return new TravelService(catalog, _player, _clock, _bus);
        }

        private static TravelQuote FirstAvailable(IReadOnlyList<TravelQuote> quotes)
        {
            for (int i = 0; i < quotes.Count; i++)
            {
                if (quotes[i].IsAvailable) return quotes[i];
            }

            Assert.Fail("Expected at least one bookable quote.");
            return default(TravelQuote);
        }

        private static TravelQuote QuoteForMode(IReadOnlyList<TravelQuote> quotes, TravelMode mode)
        {
            for (int i = 0; i < quotes.Count; i++)
            {
                if (quotes[i].Mode == mode) return quotes[i];
            }

            Assert.Fail("No quote for " + mode);
            return default(TravelQuote);
        }
    }
}
