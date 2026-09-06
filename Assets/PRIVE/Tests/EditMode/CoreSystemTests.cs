using System;
using System.Collections.Generic;
using NUnit.Framework;
using Prive.Core;

namespace Prive.Tests
{
    [TestFixture]
    public class EventBusTests
    {
        private struct Ping
        {
            public int Value;
            public Ping(int value) { Value = value; }
        }

        private struct Pong
        {
        }

        private sealed class CountingErrorSink : IEventBusErrorSink
        {
            public int Failures;
            public Type LastType;

            public void OnHandlerFailed(Type messageType, Exception exception)
            {
                Failures++;
                LastType = messageType;
            }
        }

        private EventBus _bus;

        [SetUp]
        public void SetUp()
        {
            _bus = new EventBus();
        }

        [Test]
        public void Publish_ReachesEverySubscriberInOrder()
        {
            List<string> order = new List<string>();

            _bus.Subscribe<Ping>(p => order.Add("a" + p.Value));
            _bus.Subscribe<Ping>(p => order.Add("b" + p.Value));

            _bus.Publish(new Ping(7));

            Assert.AreEqual(2, order.Count);
            Assert.AreEqual("a7", order[0]);
            Assert.AreEqual("b7", order[1]);
        }

        [Test]
        public void Publish_OnlyReachesMatchingMessageType()
        {
            int pings = 0;
            _bus.Subscribe<Ping>(p => pings++);

            _bus.Publish(new Pong());

            Assert.AreEqual(0, pings);
        }

        [Test]
        public void DisposingSubscription_Unsubscribes()
        {
            int received = 0;
            IDisposable subscription = _bus.Subscribe<Ping>(p => received++);

            _bus.Publish(new Ping(1));
            subscription.Dispose();
            _bus.Publish(new Ping(2));

            Assert.AreEqual(1, received);
            Assert.AreEqual(0, _bus.SubscriberCount<Ping>());
        }

        [Test]
        public void SubscribingDuringDispatch_DoesNotCorruptIteration()
        {
            int outerCalls = 0;
            int innerCalls = 0;

            _bus.Subscribe<Ping>(p =>
            {
                outerCalls++;
                if (outerCalls == 1) _bus.Subscribe<Ping>(q => innerCalls++);
            });

            _bus.Publish(new Ping(1));

            // The handler added mid-dispatch must not run for the message already in flight.
            Assert.AreEqual(1, outerCalls);
            Assert.AreEqual(0, innerCalls);

            _bus.Publish(new Ping(2));
            Assert.AreEqual(1, innerCalls);
        }

        [Test]
        public void UnsubscribingDuringDispatch_StopsThatHandlerImmediately()
        {
            // A despawning NPC or a closed screen must not receive the rest of the dispatch.
            int secondCalls = 0;
            IDisposable second = null;

            _bus.Subscribe<Ping>(p => second.Dispose());
            second = _bus.Subscribe<Ping>(p => secondCalls++);

            _bus.Publish(new Ping(1));

            Assert.AreEqual(0, secondCalls);
        }

        [Test]
        public void HandlerException_IsIsolatedFromOtherHandlers()
        {
            CountingErrorSink sink = new CountingErrorSink();
            EventBus bus = new EventBus(sink);

            int afterFailure = 0;
            bus.Subscribe<Ping>(p => { throw new InvalidOperationException("broken widget"); });
            bus.Subscribe<Ping>(p => afterFailure++);

            bus.Publish(new Ping(1));

            Assert.AreEqual(1, sink.Failures, "The failure should be reported.");
            Assert.AreEqual(1, afterFailure, "A broken handler must not stop the ones after it.");
        }

        [Test]
        public void ReentrantPublish_IsSafe()
        {
            int pongs = 0;

            _bus.Subscribe<Ping>(p => _bus.Publish(new Pong()));
            _bus.Subscribe<Pong>(p => pongs++);

            Assert.DoesNotThrow(() => _bus.Publish(new Ping(1)));
            Assert.AreEqual(1, pongs);
        }
    }

    [TestFixture]
    public class GameClockTests
    {
        private sealed class TickCounter : ClockTickable
        {
            public int Minutes;
            public int Hours;
            public int Days;
            public int Weeks;
            public int Months;
            public int Years;

            public override void OnMinute(GameTime now) { Minutes++; }
            public override void OnHour(GameTime now) { Hours++; }
            public override void OnDay(GameTime now) { Days++; }
            public override void OnWeek(GameTime now) { Weeks++; }
            public override void OnMonth(GameTime now) { Months++; }
            public override void OnYear(GameTime now) { Years++; }
        }

        private EventBus _bus;
        private GameClock _clock;
        private TickCounter _counter;

        [SetUp]
        public void SetUp()
        {
            _bus = new EventBus();
            _clock = new GameClock(_bus);
            _counter = new TickCounter();
            _clock.Register(_counter);
        }

        [Test]
        public void Tick_AccumulatesUntilAWholeMinutePasses()
        {
            _clock.MinutesPerRealSecond = 1.0;

            _clock.Tick(0.4);
            Assert.AreEqual(0, _counter.Minutes, "Partial minutes must not tick.");

            _clock.Tick(0.7);
            Assert.AreEqual(1, _counter.Minutes, "The accumulated remainder must carry over.");
            Assert.AreEqual(1L, _clock.Now.TotalMinutes);
        }

        [Test]
        public void Tick_EmitsEveryCrossedBoundaryExactlyOnce()
        {
            _clock.MinutesPerRealSecond = 1.0;
            _clock.Tick(GameTime.MinutesPerDay);

            Assert.AreEqual(GameTime.MinutesPerDay, _counter.Minutes);
            Assert.AreEqual(24, _counter.Hours);
            Assert.AreEqual(1, _counter.Days);
            Assert.AreEqual(0, _counter.Weeks, "Epoch day 1 is not a week boundary.");
        }

        [Test]
        public void Tick_RespectsTimeScale()
        {
            _clock.MinutesPerRealSecond = 10.0;
            _clock.Tick(6.0);

            Assert.AreEqual(60L, _clock.Now.TotalMinutes);
            Assert.AreEqual(1, _counter.Hours);
        }

        [Test]
        public void Paused_ClockDoesNotAdvance()
        {
            _clock.IsPaused = true;
            _clock.Tick(600.0);

            Assert.AreEqual(0L, _clock.Now.TotalMinutes);
            Assert.AreEqual(0, _counter.Minutes);
        }

        [Test]
        public void Skip_EmitsCoarseBoundariesButNoMinuteTicks()
        {
            int skipped = 0;
            _bus.Subscribe<TimeSkippedEvent>(e => skipped++);

            _clock.Skip(GameTime.MinutesPerDay, "test");

            Assert.AreEqual(0, _counter.Minutes, "A skip must not emit 1440 minute ticks.");
            Assert.AreEqual(24, _counter.Hours);
            Assert.AreEqual(1, _counter.Days);
            Assert.AreEqual(1, skipped);
            Assert.AreEqual((long)GameTime.MinutesPerDay, _clock.Now.TotalMinutes);
        }

        [Test]
        public void Skip_AcrossAMonthEmitsMonthAndWeekBoundaries()
        {
            // Epoch is 1 January 2025; 31 days lands exactly on 1 February.
            _clock.Skip(31L * GameTime.MinutesPerDay, "test");

            Assert.AreEqual(31, _counter.Days);
            Assert.AreEqual(1, _counter.Months);
            Assert.AreEqual(4, _counter.Weeks);
            Assert.AreEqual(0, _counter.Years);
            Assert.AreEqual(2, _clock.Now.Month);
        }

        [Test]
        public void Skip_ShorterThanAnHourStillMovesTime()
        {
            _clock.Skip(30, "nap");

            Assert.AreEqual(30L, _clock.Now.TotalMinutes);
            Assert.AreEqual(0, _counter.Hours);
        }

        [Test]
        public void TickEvents_AreAlsoPublishedOnTheBus()
        {
            int dayEvents = 0;
            _bus.Subscribe<DayTickEvent>(e => dayEvents++);

            _clock.MinutesPerRealSecond = 1.0;
            _clock.Tick(GameTime.MinutesPerDay);

            Assert.AreEqual(1, dayEvents);
        }

        [Test]
        public void Unregistering_StopsTicks()
        {
            IDisposable registration = _clock.Register(new TickCounter());
            registration.Dispose();

            _clock.MinutesPerRealSecond = 1.0;
            Assert.DoesNotThrow(() => _clock.Tick(5.0));
        }

        [Test]
        public void RestoreTime_SetsTheClockWithoutEmitting()
        {
            _clock.RestoreTime(GameTime.FromDate(2026, 6, 1, 9, 30));

            Assert.AreEqual(2026, _clock.Now.Year);
            Assert.AreEqual(0, _counter.Days, "Loading a save must not replay a year of rent.");
        }
    }

    [TestFixture]
    public class ServiceRegistryTests
    {
        private interface IThing { }

        private sealed class Thing : IThing { }

        [Test]
        public void RegisterAndResolve_RoundTrips()
        {
            ServiceRegistry registry = new ServiceRegistry();
            Thing thing = new Thing();

            registry.Register<IThing>(thing);

            Assert.AreSame(thing, registry.Resolve<IThing>());
            Assert.IsTrue(registry.IsRegistered<IThing>());
        }

        [Test]
        public void Resolve_MissingService_ThrowsWithAHelpfulMessage()
        {
            ServiceRegistry registry = new ServiceRegistry();

            InvalidOperationException error = Assert.Throws<InvalidOperationException>(
                () => registry.Resolve<IThing>());

            Assert.IsTrue(error.Message.Contains("IThing"));
        }

        [Test]
        public void RegisteringTwice_IsRejected()
        {
            ServiceRegistry registry = new ServiceRegistry();
            registry.Register<IThing>(new Thing());

            Assert.Throws<InvalidOperationException>(() => registry.Register<IThing>(new Thing()));
        }

        [Test]
        public void Replace_OverwritesForTests()
        {
            ServiceRegistry registry = new ServiceRegistry();
            registry.Register<IThing>(new Thing());

            Thing replacement = new Thing();
            registry.Replace<IThing>(replacement);

            Assert.AreSame(replacement, registry.Resolve<IThing>());
        }

        [Test]
        public void TryResolve_ReportsAbsenceWithoutThrowing()
        {
            ServiceRegistry registry = new ServiceRegistry();

            IThing resolved;
            Assert.IsFalse(registry.TryResolve<IThing>(out resolved));
            Assert.IsNull(resolved);
        }
    }
}
