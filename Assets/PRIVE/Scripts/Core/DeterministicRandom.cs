using System;

namespace Prive.Core
{
    /// <summary>
    /// A small, fast, seeded pseudo-random generator whose sequence is stable forever.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <see cref="System.Random"/> is deliberately not used for anything the player can see or
    /// that is written to a save. Its algorithm is not contractually fixed across .NET
    /// versions or platforms, so the same seed can produce different results on a different
    /// runtime — which would mean a dealership's stock silently changing between an Editor
    /// session and a device build, or after a Unity upgrade.
    /// </para>
    /// <para>
    /// This is xorshift64*: a handful of shifts, no allocation, and a sequence defined
    /// entirely by the code below. Seeds are persisted, so restoring a save reproduces exactly
    /// the same generated content.
    /// </para>
    /// </remarks>
    public struct DeterministicRandom
    {
        private ulong _state;

        public DeterministicRandom(ulong seed)
        {
            // Zero is a fixed point of xorshift and would emit nothing but zeroes.
            _state = seed == 0 ? 0x9E3779B97F4A7C15UL : seed;
        }

        /// <summary>Creates a generator from an arbitrary string, e.g. a <see cref="StableId"/>.</summary>
        public static DeterministicRandom FromSeedText(string text)
        {
            return new DeterministicRandom(Hash(text));
        }

        /// <summary>Current internal state, for persistence.</summary>
        public ulong State { get { return _state; } }

        /// <summary>Restores a previously persisted state.</summary>
        public void RestoreState(ulong state)
        {
            _state = state == 0 ? 0x9E3779B97F4A7C15UL : state;
        }

        /// <summary>The next raw 64-bit value.</summary>
        public ulong NextUInt64()
        {
            ulong x = _state;
            x ^= x >> 12;
            x ^= x << 25;
            x ^= x >> 27;
            _state = x;
            return unchecked(x * 0x2545F4914F6CDD1DUL);
        }

        /// <summary>A value in [0, 1).</summary>
        public double NextDouble()
        {
            // Top 53 bits give a double with full mantissa precision and no bias.
            return (NextUInt64() >> 11) * (1.0 / 9007199254740992.0);
        }

        /// <summary>A value in [<paramref name="min"/>, <paramref name="max"/>).</summary>
        public double NextDouble(double min, double max)
        {
            if (max <= min) return min;
            return min + (NextDouble() * (max - min));
        }

        /// <summary>An integer in [<paramref name="minInclusive"/>, <paramref name="maxExclusive"/>).</summary>
        public int NextInt(int minInclusive, int maxExclusive)
        {
            if (maxExclusive <= minInclusive) return minInclusive;

            ulong range = (ulong)((long)maxExclusive - minInclusive);
            return (int)(minInclusive + (long)(NextUInt64() % range));
        }

        /// <summary>True with probability <paramref name="probability"/> (0–1).</summary>
        public bool NextChance(double probability)
        {
            if (probability <= 0.0) return false;
            if (probability >= 1.0) return true;
            return NextDouble() < probability;
        }

        /// <summary>FNV-1a, chosen because it is short and its result is stable across platforms.</summary>
        private static ulong Hash(string text)
        {
            if (string.IsNullOrEmpty(text)) return 0;

            ulong hash = 14695981039346656037UL;
            for (int i = 0; i < text.Length; i++)
            {
                hash ^= text[i];
                hash = unchecked(hash * 1099511628211UL);
            }
            return hash;
        }
    }
}
