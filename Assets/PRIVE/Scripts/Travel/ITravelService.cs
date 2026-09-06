using System.Collections.Generic;
using Prive.Core;
using Prive.World;

namespace Prive.Travel
{
    /// <summary>
    /// Quote → book → execute. Adding a destination is content; it is never a change here.
    /// </summary>
    public interface ITravelService
    {
        /// <summary>
        /// Every travel option between two cities, including the ones that are not currently
        /// bookable — the phone shows those greyed out with a reason, which is how the player
        /// learns that owning a jet or a marina berth would change things.
        /// </summary>
        IReadOnlyList<TravelQuote> GetQuotes(WorldLocationId from, WorldLocationId to);

        /// <summary>Charges for a quote and issues a ticket.</summary>
        OperationResult<TravelTicket> Book(TravelQuote quote);

        /// <summary>Advances the clock, moves the player and publishes arrival.</summary>
        OperationResult Execute(TravelTicket ticket);

        /// <summary>Convenience for <see cref="Book"/> followed by <see cref="Execute"/>.</summary>
        OperationResult<TravelTicket> Travel(TravelQuote quote);
    }
}
