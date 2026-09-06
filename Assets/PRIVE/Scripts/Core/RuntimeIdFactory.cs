using System;
using System.Globalization;

namespace Prive.Core
{
    /// <summary>
    /// Mints unique <see cref="StableId"/>s for objects created during play — the
    /// specific car the player bought, a booked ticket, an open market position.
    /// </summary>
    /// <remarks>
    /// The counter is part of save data: restoring it prevents a reloaded session
    /// from re-issuing ids that already exist in the world.
    /// </remarks>
    public sealed class RuntimeIdFactory
    {
        private long _counter;

        public RuntimeIdFactory(long startCounter = 0)
        {
            if (startCounter < 0) throw new ArgumentOutOfRangeException("startCounter");
            _counter = startCounter;
        }

        /// <summary>Current counter value, for persistence.</summary>
        public long Counter
        {
            get { return _counter; }
        }

        /// <summary>
        /// Creates an id of the form <c>inst:{kind}.{n}</c>, e.g. <c>inst:vehicle.42</c>.
        /// </summary>
        /// <param name="kind">Lower-case category, e.g. "vehicle", "ticket", "position".</param>
        public StableId Next(string kind)
        {
            if (string.IsNullOrEmpty(kind)) throw new ArgumentException("kind is required", "kind");
            _counter++;
            return StableId.Create(IdDomains.Instance,
                kind + "." + _counter.ToString(CultureInfo.InvariantCulture));
        }

        /// <summary>Restores the counter when loading a save.</summary>
        public void RestoreCounter(long counter)
        {
            if (counter < 0) throw new ArgumentOutOfRangeException("counter");
            _counter = counter;
        }
    }
}
