using System;
using NUnit.Framework;
using Prive.Core;

namespace Prive.Tests
{
    [TestFixture]
    public class MoneyTests
    {
        [Test]
        public void FromDollars_StoresExactMinorUnits()
        {
            Assert.AreEqual(100L, Money.FromDollars(1L).MinorUnits);
            Assert.AreEqual(100000000L, Money.FromDollars(1000000L).MinorUnits);
        }

        [Test]
        public void FromDollars_Double_RoundsHalfAwayFromZero()
        {
            Assert.AreEqual(1L, Money.FromDollars(0.005).MinorUnits);
            Assert.AreEqual(-1L, Money.FromDollars(-0.005).MinorUnits);
            Assert.AreEqual(1235L, Money.FromDollars(12.345).MinorUnits);
        }

        [Test]
        public void Arithmetic_IsExact()
        {
            Money a = Money.FromDollars(0.10);
            Money sum = Money.Zero;

            // The classic float failure: 0.1 added ten times. Integer cents cannot drift.
            for (int i = 0; i < 10; i++) sum += a;

            Assert.AreEqual(Money.FromDollars(1L), sum);
            Assert.AreEqual(100L, sum.MinorUnits);
        }

        [Test]
        public void Scale_RoundsOncePerOperation()
        {
            Money price = Money.FromDollars(19999L);
            Assert.AreEqual(Money.FromDollars(1499.93), price.Percent(7.5));
        }

        [Test]
        public void Scale_RepeatedDepreciation_StaysExactAndMonotonic()
        {
            Money value = Money.FromDollars(120000L);
            Money previous = value;

            for (int month = 0; month < 24; month++)
            {
                value = value.Scale(0.98);
                Assert.IsTrue(value < previous, "Depreciation must strictly reduce value.");
                Assert.IsTrue(value.IsPositive, "Depreciation must not cross zero.");
                previous = value;
            }

            // 0.98^24 of $120,000 is about $74,600 — never a fractional cent.
            Assert.IsTrue(value > Money.FromDollars(70000L));
            Assert.IsTrue(value < Money.FromDollars(80000L));
        }

        [Test]
        public void Comparison_AndClamp_Behave()
        {
            Money low = Money.FromDollars(10L);
            Money high = Money.FromDollars(100L);

            Assert.IsTrue(low < high);
            Assert.IsTrue(high >= Money.FromDollars(100L));
            Assert.AreEqual(high, Money.Max(low, high));
            Assert.AreEqual(low, Money.Min(low, high));
            Assert.AreEqual(high, Money.Clamp(Money.FromDollars(500L), low, high));
            Assert.AreEqual(low, Money.Clamp(Money.Zero, low, high));
        }

        [Test]
        public void Negative_RepresentsDebt()
        {
            Money debt = Money.Zero - Money.FromDollars(2500L);

            Assert.IsTrue(debt.IsNegative);
            Assert.AreEqual(Money.FromDollars(2500L), debt.Abs());
        }

        [Test]
        public void Addition_OverflowThrowsRatherThanWrapping()
        {
            Money huge = Money.FromMinorUnits(long.MaxValue - 5);
            Assert.Throws<OverflowException>(() =>
            {
                Money wrapped = huge + Money.FromMinorUnits(100);
                Assert.Fail("Overflow must throw, but produced " + wrapped + ".");
            });
        }

        [Test]
        public void CompactString_ScalesToWealthTier()
        {
            Assert.AreEqual("$940", Money.FromDollars(940L).ToCompactString());
            Assert.AreEqual("$12.5K", Money.FromDollars(12500L).ToCompactString());
            Assert.AreEqual("$8.4M", Money.FromDollars(8400000L).ToCompactString());
            Assert.AreEqual("$1.25B", Money.FromDollars(1250000000L).ToCompactString());
        }
    }

    [TestFixture]
    public class StableIdTests
    {
        [Test]
        public void Create_ParsesDomainAndName()
        {
            StableId id = StableId.Create("vehicle_model", "vx_aurora_gt");

            Assert.IsTrue(id.IsValid);
            Assert.AreEqual("vehicle_model", id.Domain);
            Assert.AreEqual("vx_aurora_gt", id.Name);
            Assert.AreEqual("vehicle_model:vx_aurora_gt", id.Value);
        }

        [TestCase("")]
        [TestCase("nodomain")]
        [TestCase(":noname")]
        [TestCase("domain:")]
        [TestCase("two:separators:here")]
        [TestCase("Upper:case")]
        [TestCase("domain:has space")]
        [TestCase("dotted.domain:name")]
        public void TryParse_RejectsMalformedIds(string candidate)
        {
            StableId parsed;
            Assert.IsFalse(StableId.TryParse(candidate, out parsed), "Should reject '" + candidate + "'");
            Assert.IsFalse(parsed.IsValid);
        }

        [Test]
        public void Name_MayContainDotsForScoping()
        {
            StableId id = StableId.Parse("loc:usa_vermillion_bay.marina");

            Assert.AreEqual("loc", id.Domain);
            Assert.AreEqual("usa_vermillion_bay.marina", id.Name);
        }

        [Test]
        public void Child_AppendsScopedSegment()
        {
            StableId city = StableId.Create("loc", "usa_vermillion_bay");
            Assert.AreEqual("loc:usa_vermillion_bay.marina", city.Child("marina").Value);
        }

        [Test]
        public void Equality_IsOrdinalAndUsableAsDictionaryKey()
        {
            StableId a = StableId.Parse("npc:marina_dealer_01");
            StableId b = StableId.Parse("npc:marina_dealer_01");

            Assert.IsTrue(a == b);
            Assert.AreEqual(a.GetHashCode(), b.GetHashCode());
            Assert.IsTrue(StableId.None != a);
        }

        [Test]
        public void RuntimeIdFactory_MintsUniqueIdsAndRestoresCounter()
        {
            RuntimeIdFactory factory = new RuntimeIdFactory();

            StableId first = factory.Next("vehicle");
            StableId second = factory.Next("vehicle");

            Assert.AreNotEqual(first, second);
            Assert.AreEqual("inst", first.Domain);
            Assert.AreEqual("vehicle.1", first.Name);
            Assert.AreEqual(2L, factory.Counter);

            // Reloading a save must not re-issue ids that already exist in the world.
            RuntimeIdFactory reloaded = new RuntimeIdFactory();
            reloaded.RestoreCounter(factory.Counter);
            Assert.AreEqual("vehicle.3", reloaded.Next("vehicle").Name);
        }
    }

    [TestFixture]
    public class GameTimeTests
    {
        [Test]
        public void Start_IsTheEpoch()
        {
            GameTime start = GameTime.Start;

            Assert.AreEqual(0L, start.TotalMinutes);
            Assert.AreEqual(2025, start.Year);
            Assert.AreEqual(1, start.Month);
            Assert.AreEqual(1, start.Day);
            Assert.AreEqual(0, start.Hour);
        }

        [Test]
        public void CalendarFields_FollowTheRealGregorianCalendar()
        {
            // 2025 is not a leap year, so 31 Jan + 28 days lands on 28 February.
            GameTime endOfFebruary = GameTime.FromDate(2025, 2, 28, 23, 59);
            Assert.AreEqual(GameTime.FromDate(2025, 3, 1), endOfFebruary.AddMinutes(1));

            // 2028 is, so February has 29 days.
            GameTime leap = GameTime.FromDate(2028, 2, 28, 23, 59);
            Assert.AreEqual(2, leap.AddMinutes(1).Month);
            Assert.AreEqual(29, leap.AddMinutes(1).Day);
        }

        [Test]
        public void DerivedIndices_AreConsistent()
        {
            GameTime time = GameTime.Start.AddDays(10).AddHours(5).AddMinutes(30);

            Assert.AreEqual(10L, time.DayIndex);
            Assert.AreEqual(1L, time.WeekIndex);
            Assert.AreEqual((10 * 24) + 5, time.HourIndex);
            Assert.AreEqual((5 * 60) + 30, time.MinuteOfDay);
            Assert.AreEqual(5, time.Hour);
            Assert.AreEqual(30, time.Minute);
        }

        [Test]
        public void StartOfDay_TruncatesToMidnight()
        {
            GameTime evening = GameTime.FromDate(2025, 6, 15, 22, 41);
            GameTime midnight = evening.StartOfDay();

            Assert.AreEqual(0, midnight.MinuteOfDay);
            Assert.AreEqual(15, midnight.Day);
            Assert.AreEqual(evening.DayIndex, midnight.DayIndex);
        }

        [Test]
        public void IsNight_CoversTheNightlifeWindow()
        {
            Assert.IsTrue(GameTime.FromDate(2025, 5, 2, 23, 0).IsNight);
            Assert.IsTrue(GameTime.FromDate(2025, 5, 2, 3, 0).IsNight);
            Assert.IsFalse(GameTime.FromDate(2025, 5, 2, 13, 0).IsNight);
            Assert.IsFalse(GameTime.FromDate(2025, 5, 2, 19, 59).IsNight);
        }

        [Test]
        public void MinutesUntil_IsSignedAndSymmetric()
        {
            GameTime a = GameTime.FromDate(2025, 1, 1, 8, 0);
            GameTime b = GameTime.FromDate(2025, 1, 1, 12, 0);

            Assert.AreEqual(240L, a.MinutesUntil(b));
            Assert.AreEqual(-240L, b.MinutesUntil(a));
        }

        [Test]
        public void CannotPrecedeTheEpoch()
        {
            Assert.Throws<ArgumentOutOfRangeException>(() => GameTime.FromMinutes(-1));
            Assert.Throws<ArgumentOutOfRangeException>(() => GameTime.FromDate(2024, 12, 31));
        }
    }
}
