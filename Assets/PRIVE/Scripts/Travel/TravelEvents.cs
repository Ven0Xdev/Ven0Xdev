using Prive.Core;
using Prive.World;

namespace Prive.Travel
{
    /// <summary>Published when a ticket is bought.</summary>
    public readonly struct TravelBookedEvent
    {
        public readonly TravelTicket Ticket;
        public TravelBookedEvent(TravelTicket ticket) { Ticket = ticket; }
    }

    /// <summary>Published the moment the player is somewhere new after travelling.</summary>
    /// <remarks>
    /// The hinge of the whole travel design. Markets, businesses, NPC pools, world events and
    /// streaming all subscribe here, and none of them know an aircraft exists.
    /// </remarks>
    public readonly struct PlayerArrivedEvent
    {
        public readonly WorldLocationId From;
        public readonly WorldLocationId To;
        public readonly TravelMode Mode;
        public readonly GameTime ArrivedAt;
        public readonly int DurationMinutes;

        public PlayerArrivedEvent(WorldLocationId from, WorldLocationId to, TravelMode mode,
                                  GameTime arrivedAt, int durationMinutes)
        {
            From = from;
            To = to;
            Mode = mode;
            ArrivedAt = arrivedAt;
            DurationMinutes = durationMinutes;
        }
    }
}
