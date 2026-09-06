using NUnit.Framework;
using Prive.Core;
using Prive.Social;
using Prive.World;

namespace Prive.Tests
{
    /// <summary>Stands in for a vehicle, watch or residence signal from a later phase.</summary>
    internal sealed class StubWealthSignal : IObservedWealthSignal
    {
        private readonly Money _implied;
        private readonly double _weight;
        private readonly double _confidence;

        public StubWealthSignal(WealthSignalKind kind, Money implied, double weight, double confidence)
        {
            Kind = kind;
            _implied = implied;
            _weight = weight;
            _confidence = confidence;
        }

        public WealthSignalKind Kind { get; private set; }

        public ObservedWealthContribution Evaluate(ObservedWealthContext context)
        {
            return new ObservedWealthContribution(Kind, _implied, _weight, _confidence);
        }
    }

    [TestFixture]
    public class SocialStatusTests
    {
        private EventBus _bus;
        private SocialStatus _status;

        [SetUp]
        public void SetUp()
        {
            _bus = new EventBus();
            _status = new SocialStatus(_bus);
        }

        [Test]
        public void NewStatus_StartsUnknown()
        {
            Assert.AreEqual(0.0, _status.Fame, 0.0001);
            Assert.AreEqual(SocialClass.Unknown, _status.Class);
        }

        [Test]
        public void ValuesAreClampedToTheirRanges()
        {
            _status.SetFame(99999.0);
            Assert.AreEqual(SocialStatus.MaxFame, _status.Fame, 0.0001);

            _status.SetFame(-50.0);
            Assert.AreEqual(0.0, _status.Fame, 0.0001);

            _status.SetReputation(-9999.0);
            Assert.AreEqual(SocialStatus.MinReputation, _status.Reputation, 0.0001);
        }

        [Test]
        public void ChangingAValue_PublishesOnce()
        {
            int changes = 0;
            _bus.Subscribe<SocialStatusChangedEvent>(e => changes++);

            _status.AddFame(10.0);
            Assert.AreEqual(1, changes);

            _status.AddFame(0.0);
            Assert.AreEqual(1, changes, "A no-op must not publish.");
        }

        [Test]
        public void CrossingAClassThreshold_PublishesAPromotion()
        {
            SocialClassChangedEvent captured = default(SocialClassChangedEvent);
            int events = 0;
            _bus.Subscribe<SocialClassChangedEvent>(e => { captured = e; events++; });

            _status.SetLifestyle(900.0);
            _status.SetFame(900.0);

            Assert.IsTrue(events > 0);
            Assert.IsTrue(captured.IsPromotion);
            Assert.AreEqual(SocialClass.Icon, _status.Class);
        }

        [Test]
        public void BadReputation_DragsSocialClassDown()
        {
            _status.SetLifestyle(600.0);
            _status.SetFame(400.0);
            SocialClass reputable = _status.Class;

            _status.SetReputation(-100.0);

            Assert.IsTrue(_status.Class < reputable,
                "Being widely disliked should cost standing, not just flavour text.");
        }

        [Test]
        public void FameDecays_WeeklyWithoutExposure()
        {
            _status.SetFame(500.0);
            SocialStatusDecay decay = new SocialStatusDecay(_status);

            decay.OnWeek(GameTime.Start);

            Assert.AreEqual(500.0 * (1.0 - SocialStatusDecay.WeeklyFameDecay), _status.Fame, 0.001);
        }

        [Test]
        public void LifestyleDecays_MonthlyWithoutSpending()
        {
            _status.SetLifestyle(800.0);
            SocialStatusDecay decay = new SocialStatusDecay(_status);

            decay.OnMonth(GameTime.Start);

            Assert.IsTrue(_status.LifestyleScore < 800.0);
            Assert.IsTrue(_status.LifestyleScore > 700.0);
        }

        [Test]
        public void InfluenceDoesNotDecay()
        {
            _status.SetInfluence(400.0);
            SocialStatusDecay decay = new SocialStatusDecay(_status);

            decay.OnWeek(GameTime.Start);
            decay.OnMonth(GameTime.Start);

            Assert.AreEqual(400.0, _status.Influence, 0.0001);
        }
    }

    [TestFixture]
    public class ObservedWealthTests
    {
        private EventBus _bus;
        private ObservedWealthCalculator _calculator;

        private static ObservedWealthContext Context(double fame = 0.0,
                                                     PrestigeTier prestige = PrestigeTier.Standard)
        {
            return new ObservedWealthContext(
                WorldLocations.VermillionBayDistricts.Downtown, prestige, GameTime.Start,
                fame, 0.0, 0.0);
        }

        [SetUp]
        public void SetUp()
        {
            _bus = new EventBus();
            _calculator = new ObservedWealthCalculator(_bus);
        }

        [Test]
        public void WithNoSignals_FallsBackToTheUnreadableBaseline()
        {
            Assert.AreEqual(ObservedWealthCalculator.UnreadableBaseline, _calculator.Evaluate(Context()));
        }

        [Test]
        public void ASingleSignal_SetsObservedWealthDirectly()
        {
            _calculator.RegisterSignal(new StubWealthSignal(
                WealthSignalKind.Vehicle, Money.FromDollars(250000L), 1.0, 1.0));

            Assert.AreEqual(Money.FromDollars(250000L), _calculator.Evaluate(Context()));
        }

        [Test]
        public void TheStrongestSignalPullsTheBlendAboveTheAverage()
        {
            // A hypercar parked next to a cheap watch should not average out to "mid".
            _calculator.RegisterSignal(new StubWealthSignal(
                WealthSignalKind.Vehicle, Money.FromDollars(2000000L), 1.0, 1.0));
            _calculator.RegisterSignal(new StubWealthSignal(
                WealthSignalKind.Watch, Money.FromDollars(200L), 1.0, 1.0));

            Money observed = _calculator.Evaluate(Context());
            Money mean = Money.FromDollars(1000100L);

            Assert.IsTrue(observed > mean, "The peak signal must pull the blend upward.");
            Assert.IsTrue(observed < Money.FromDollars(2000000L), "But it must not dominate entirely.");
        }

        [Test]
        public void LowConfidenceSignals_BarelyRegister()
        {
            // A discreet watch is expensive but almost nobody clocks it.
            _calculator.RegisterSignal(new StubWealthSignal(
                WealthSignalKind.Outfit, Money.FromDollars(20000L), 1.0, 1.0));
            _calculator.RegisterSignal(new StubWealthSignal(
                WealthSignalKind.Watch, Money.FromDollars(4000000L), 1.0, 0.02));

            Money observed = _calculator.Evaluate(Context());

            Assert.IsTrue(observed < Money.FromDollars(300000L),
                "A signal nobody notices should not transform how the player reads.");
        }

        [Test]
        public void ObservedWealthIsIndependentOfActualWealth()
        {
            // The signature behaviour: someone with very little who looks like a lot.
            _calculator.RegisterSignal(new StubWealthSignal(
                WealthSignalKind.Vehicle, Money.FromDollars(1800000L), 1.4, 1.0));
            _calculator.RegisterSignal(new StubWealthSignal(
                WealthSignalKind.Residence, Money.FromDollars(1200000L), 1.2, 0.9));

            Money observed = _calculator.Evaluate(Context());

            Assert.IsTrue(observed > Money.FromDollars(1000000L),
                "A leased supercar and a rented penthouse read as wealth regardless of the balance sheet.");
        }

        [Test]
        public void FameSignal_ScalesWithRecognition()
        {
            _calculator.RegisterSignal(new FameWealthSignal());

            Money unknown = _calculator.Evaluate(Context(fame: 0.0));
            Money local = _calculator.Evaluate(Context(fame: 200.0));
            Money famous = _calculator.Evaluate(Context(fame: 950.0));

            Assert.AreEqual(ObservedWealthCalculator.UnreadableBaseline, unknown);
            Assert.IsTrue(famous > local, "More fame must imply more perceived wealth.");
            Assert.IsTrue(famous > Money.FromDollars(10000000L));
        }

        [Test]
        public void Evaluate_PublishesOnlyOnMaterialChange()
        {
            _calculator.RegisterSignal(new StubWealthSignal(
                WealthSignalKind.Vehicle, Money.FromDollars(100000L), 1.0, 1.0));

            int changes = 0;
            _bus.Subscribe<ObservedWealthChangedEvent>(e => changes++);

            _calculator.Evaluate(Context());
            int afterFirst = changes;

            _calculator.Evaluate(Context());

            Assert.AreEqual(afterFirst, changes, "Re-evaluating an unchanged loadout must not churn UI.");
        }

        [Test]
        public void Contributions_AreExposedForDebugging()
        {
            _calculator.RegisterSignal(new StubWealthSignal(
                WealthSignalKind.Vehicle, Money.FromDollars(90000L), 1.0, 0.8));
            _calculator.Evaluate(Context());

            Assert.AreEqual(1, _calculator.LastContributions.Count);
            Assert.AreEqual(WealthSignalKind.Vehicle, _calculator.LastContributions[0].Kind);
        }
    }

    [TestFixture]
    public class SocialPresenceServiceTests
    {
        private EventBus _bus;
        private GameClock _clock;
        private SocialStatus _status;
        private ObservedWealthCalculator _observedWealth;
        private SocialPresenceService _presence;

        [SetUp]
        public void SetUp()
        {
            _bus = new EventBus();
            _clock = new GameClock(_bus);
            _status = new SocialStatus(_bus);
            _observedWealth = new ObservedWealthCalculator(_bus);
            _presence = new SocialPresenceService(
                _status, _observedWealth, DefaultWorldContent.Build(), _clock, _bus);
        }

        [TearDown]
        public void TearDown()
        {
            _presence.Dispose();
        }

        [Test]
        public void EvaluatePublishesPresenceAndRemembersTheLocation()
        {
            int evaluations = 0;
            _bus.Subscribe<PlayerPresenceEvaluatedEvent>(e => evaluations++);

            _presence.Evaluate(WorldLocations.VermillionBayDistricts.Marina);

            Assert.AreEqual(1, evaluations);
            Assert.AreEqual(WorldLocations.VermillionBayDistricts.Marina, _presence.CurrentLocation);
        }

        [Test]
        public void AVisibleLoadoutChangeReEvaluatesPresence()
        {
            // The seam a content module uses to say "the player is driving something else now"
            // without knowing this service exists.
            _presence.Evaluate(WorldLocations.VermillionBayDistricts.Downtown);

            int evaluations = 0;
            _bus.Subscribe<PlayerPresenceEvaluatedEvent>(e => evaluations++);

            _bus.Publish(new VisibleLoadoutChangedEvent(WealthSignalKind.Vehicle));

            Assert.AreEqual(1, evaluations);
        }

        [Test]
        public void ALoadoutChangeBeforeThePlayerIsPlacedIsIgnored()
        {
            int evaluations = 0;
            _bus.Subscribe<PlayerPresenceEvaluatedEvent>(e => evaluations++);

            _bus.Publish(new VisibleLoadoutChangedEvent(WealthSignalKind.Vehicle));

            Assert.AreEqual(0, evaluations, "There is no location to evaluate against yet.");
        }

        [Test]
        public void RefreshPicksUpANewlyRegisteredSignal()
        {
            _presence.Evaluate(WorldLocations.VermillionBayDistricts.Downtown);
            Money before = _presence.CurrentObservedWealth;

            _observedWealth.RegisterSignal(new StubWealthSignal(
                WealthSignalKind.Vehicle, Money.FromDollars(900000L), 1.5, 1.0));
            _presence.Refresh();

            Assert.IsTrue(_presence.CurrentObservedWealth > before,
                "A newly visible asset must change how the player reads.");
        }

        [Test]
        public void DisposingStopsRespondingToLoadoutChanges()
        {
            _presence.Evaluate(WorldLocations.VermillionBayDistricts.Downtown);
            _presence.Dispose();

            int evaluations = 0;
            _bus.Subscribe<PlayerPresenceEvaluatedEvent>(e => evaluations++);
            _bus.Publish(new VisibleLoadoutChangedEvent(WealthSignalKind.Vehicle));

            Assert.AreEqual(0, evaluations);
        }
    }

    [TestFixture]
    public class PresenceScoreTests
    {
        [Test]
        public void NormalizeWealth_IsLogarithmicAndBounded()
        {
            Assert.AreEqual(0.0, PresenceScore.NormalizeWealth(Money.FromDollars(500L)), 0.0001);
            Assert.AreEqual(1.0, PresenceScore.NormalizeWealth(Money.FromDollars(500000000L)), 0.0001);

            double tenK = PresenceScore.NormalizeWealth(Money.FromDollars(10000L));
            double hundredK = PresenceScore.NormalizeWealth(Money.FromDollars(100000L));
            double oneM = PresenceScore.NormalizeWealth(Money.FromDollars(1000000L));

            // Equal ratios should produce equal steps.
            Assert.AreEqual(hundredK - tenK, oneM - hundredK, 0.0001);
        }

        [Test]
        public void MoreObservedWealth_MeansMorePresence()
        {
            double modest = PresenceScore.Evaluate(Money.FromDollars(20000L), 0, 0, 0, PrestigeTier.Standard);
            double serious = PresenceScore.Evaluate(Money.FromDollars(5000000L), 0, 0, 0, PrestigeTier.Standard);

            Assert.Greater(serious, modest);
        }

        [Test]
        public void BeingUnderdressedForTheRoom_ReducesPresence()
        {
            Money modest = Money.FromDollars(30000L);

            double inSuburbs = PresenceScore.Evaluate(modest, 0, 0, 0, PrestigeTier.Modest);
            double atEliteMarina = PresenceScore.Evaluate(modest, 0, 0, 0, PrestigeTier.Elite);

            Assert.Greater(inSuburbs, atEliteMarina,
                "The same car should command less attention where everything is more expensive.");
        }

        [Test]
        public void StandingOutUpward_IncreasesPresence()
        {
            Money serious = Money.FromDollars(4000000L);

            double atElite = PresenceScore.Evaluate(serious, 0, 0, 0, PrestigeTier.Elite);
            double inIndustrial = PresenceScore.Evaluate(serious, 0, 0, 0, PrestigeTier.Industrial);

            Assert.Greater(inIndustrial, atElite,
                "A hypercar at the port turns more heads than the same car among its peers.");
        }

        [Test]
        public void ContextFit_StaysWithinItsDesignedBand()
        {
            for (int tier = 1; tier <= 5; tier++)
            {
                for (double wealth = 0.0; wealth <= 1.0; wealth += 0.1)
                {
                    double fit = PresenceScore.ContextFit(wealth, (PrestigeTier)tier);
                    Assert.GreaterOrEqual(fit, 0.75);
                    Assert.LessOrEqual(fit, 1.15);
                }
            }
        }

        [Test]
        public void GoodReputation_LiftsPresenceAndBadReputationLowersIt()
        {
            Money wealth = Money.FromDollars(500000L);

            double liked = PresenceScore.Evaluate(wealth, 300, 80, 200, PrestigeTier.Affluent);
            double neutral = PresenceScore.Evaluate(wealth, 300, 0, 200, PrestigeTier.Affluent);
            double disliked = PresenceScore.Evaluate(wealth, 300, -80, 200, PrestigeTier.Affluent);

            Assert.Greater(liked, neutral);
            Assert.Greater(neutral, disliked);
        }

        [Test]
        public void ScoreIsAlwaysWithinRange()
        {
            double max = PresenceScore.Evaluate(Money.FromDollars(900000000L),
                SocialStatus.MaxFame, SocialStatus.MaxReputation, SocialStatus.MaxLifestyle, PrestigeTier.Industrial);
            double min = PresenceScore.Evaluate(Money.Zero,
                0, SocialStatus.MinReputation, 0, PrestigeTier.Elite);

            Assert.LessOrEqual(max, PresenceScore.MaxScore);
            Assert.GreaterOrEqual(min, 0.0);
        }
    }
}
