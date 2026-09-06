using System;
using System.Globalization;

namespace Prive.Core
{
    /// <summary>
    /// Currency amount stored as a whole number of minor units (cents).
    /// </summary>
    /// <remarks>
    /// <para>
    /// Floating-point currency is banned in PRIVÉ. A game whose entire progression is
    /// money — with compounding interest, daily revenue, depreciation and percentage
    /// negotiation — accumulates visible drift within minutes of play if balances are
    /// <c>float</c>. <see cref="Money"/> keeps an exact <see cref="long"/> of cents.
    /// </para>
    /// <para>
    /// Range is roughly ±$92 quadrillion, comfortably beyond the $1B+ endgame. Add and
    /// subtract are <c>checked</c>: an overflow is a bug and must fail loudly rather
    /// than wrap a fortune into a debt.
    /// </para>
    /// </remarks>
    public readonly struct Money : IEquatable<Money>, IComparable<Money>
    {
        public const long MinorUnitsPerMajor = 100;

        public static readonly Money Zero = default(Money);

        private readonly long _minorUnits;

        private Money(long minorUnits)
        {
            _minorUnits = minorUnits;
        }

        /// <summary>Exact amount in cents.</summary>
        public long MinorUnits
        {
            get { return _minorUnits; }
        }

        /// <summary>Approximate amount in dollars. For display and pricing maths only — never for storage.</summary>
        public double ToDouble()
        {
            return _minorUnits / (double)MinorUnitsPerMajor;
        }

        public bool IsZero { get { return _minorUnits == 0; } }
        public bool IsPositive { get { return _minorUnits > 0; } }
        public bool IsNegative { get { return _minorUnits < 0; } }

        public static Money FromMinorUnits(long minorUnits)
        {
            return new Money(minorUnits);
        }

        /// <summary>Exact construction from whole dollars.</summary>
        public static Money FromDollars(long dollars)
        {
            return new Money(checked(dollars * MinorUnitsPerMajor));
        }

        /// <summary>
        /// Construction from a fractional dollar amount, rounded half-away-from-zero to
        /// the nearest cent. Use for authored content and pricing model output.
        /// </summary>
        public static Money FromDollars(double dollars)
        {
            return new Money(RoundToMinorUnits(dollars * MinorUnitsPerMajor));
        }

        /// <summary>
        /// Multiplies by a factor and rounds <em>once</em>, half-away-from-zero.
        /// All percentage maths (interest, depreciation, commission, tax) goes through
        /// here so repeated application cannot drift.
        /// </summary>
        public Money Scale(double factor)
        {
            return new Money(RoundToMinorUnits(_minorUnits * factor));
        }

        /// <summary>Returns <paramref name="percent"/>% of this amount (e.g. 7.5 for 7.5%).</summary>
        public Money Percent(double percent)
        {
            return Scale(percent / 100.0);
        }

        public Money Abs()
        {
            return new Money(Math.Abs(_minorUnits));
        }

        /// <summary>The larger of two amounts.</summary>
        public static Money Max(Money a, Money b)
        {
            return a._minorUnits >= b._minorUnits ? a : b;
        }

        /// <summary>The smaller of two amounts.</summary>
        public static Money Min(Money a, Money b)
        {
            return a._minorUnits <= b._minorUnits ? a : b;
        }

        /// <summary>Clamps into the inclusive range [<paramref name="min"/>, <paramref name="max"/>].</summary>
        public static Money Clamp(Money value, Money min, Money max)
        {
            if (min > max) throw new ArgumentException("min must not exceed max");
            return Max(min, Min(max, value));
        }

        private static long RoundToMinorUnits(double minorUnits)
        {
            if (double.IsNaN(minorUnits) || double.IsInfinity(minorUnits))
            {
                throw new ArgumentOutOfRangeException("minorUnits", "Money cannot represent NaN or Infinity.");
            }

            double rounded = Math.Round(minorUnits, MidpointRounding.AwayFromZero);

            if (rounded > long.MaxValue || rounded < long.MinValue)
            {
                throw new OverflowException("Money value out of range: " + rounded.ToString(CultureInfo.InvariantCulture));
            }

            return (long)rounded;
        }

        public static Money operator +(Money a, Money b)
        {
            return new Money(checked(a._minorUnits + b._minorUnits));
        }

        public static Money operator -(Money a, Money b)
        {
            return new Money(checked(a._minorUnits - b._minorUnits));
        }

        public static Money operator -(Money value)
        {
            return new Money(checked(-value._minorUnits));
        }

        public static Money operator *(Money value, long multiplier)
        {
            return new Money(checked(value._minorUnits * multiplier));
        }

        public static Money operator *(long multiplier, Money value)
        {
            return value * multiplier;
        }

        public static bool operator >(Money a, Money b) { return a._minorUnits > b._minorUnits; }
        public static bool operator <(Money a, Money b) { return a._minorUnits < b._minorUnits; }
        public static bool operator >=(Money a, Money b) { return a._minorUnits >= b._minorUnits; }
        public static bool operator <=(Money a, Money b) { return a._minorUnits <= b._minorUnits; }
        public static bool operator ==(Money a, Money b) { return a._minorUnits == b._minorUnits; }
        public static bool operator !=(Money a, Money b) { return a._minorUnits != b._minorUnits; }

        public bool Equals(Money other) { return _minorUnits == other._minorUnits; }

        public override bool Equals(object obj) { return obj is Money && Equals((Money)obj); }

        public override int GetHashCode() { return _minorUnits.GetHashCode(); }

        public int CompareTo(Money other) { return _minorUnits.CompareTo(other._minorUnits); }

        /// <summary>Full precision, e.g. <c>$1,250,000.00</c>.</summary>
        public override string ToString()
        {
            return (_minorUnits < 0 ? "-$" : "$") +
                   (Math.Abs(_minorUnits) / (double)MinorUnitsPerMajor)
                       .ToString("N2", CultureInfo.InvariantCulture);
        }

        /// <summary>
        /// Compact form for HUD and phone UI: <c>$8.4M</c>, <c>$12.5K</c>, <c>$940</c>.
        /// </summary>
        public string ToCompactString()
        {
            long abs = Math.Abs(_minorUnits);
            string sign = _minorUnits < 0 ? "-$" : "$";
            double dollars = abs / (double)MinorUnitsPerMajor;

            if (dollars >= 1000000000000d) return sign + (dollars / 1000000000000d).ToString("0.##", CultureInfo.InvariantCulture) + "T";
            if (dollars >= 1000000000d) return sign + (dollars / 1000000000d).ToString("0.##", CultureInfo.InvariantCulture) + "B";
            if (dollars >= 1000000d) return sign + (dollars / 1000000d).ToString("0.##", CultureInfo.InvariantCulture) + "M";
            if (dollars >= 1000d) return sign + (dollars / 1000d).ToString("0.#", CultureInfo.InvariantCulture) + "K";
            return sign + dollars.ToString("0.##", CultureInfo.InvariantCulture);
        }
    }
}
