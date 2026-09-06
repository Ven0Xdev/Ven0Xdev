using Prive.Core;

namespace Prive.Travel
{
    /// <summary>
    /// A booked and paid-for journey, not yet taken.
    /// </summary>
    /// <remarks>
    /// Booking and travelling are separate acts. The gap is where scheduled departures,
    /// missed flights and "you have a flight in three hours" pressure will live; Phase 1
    /// keeps the split without yet using it.
    /// </remarks>
    public readonly struct TravelTicket
    {
        public readonly StableId Id;
        public readonly TravelQuote Quote;
        public readonly GameTime BookedAt;
        public readonly Money PricePaid;

        public TravelTicket(StableId id, TravelQuote quote, GameTime bookedAt, Money pricePaid)
        {
            Id = id;
            Quote = quote;
            BookedAt = bookedAt;
            PricePaid = pricePaid;
        }

        public bool IsValid { get { return Id.IsValid; } }

        public override string ToString()
        {
            return Id + ": " + Quote + " booked " + BookedAt;
        }
    }
}
