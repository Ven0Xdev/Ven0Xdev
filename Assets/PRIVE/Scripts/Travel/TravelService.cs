using System;
using System.Collections.Generic;
using Prive.Core;
using Prive.Economy;
using Prive.Player;
using Prive.World;

namespace Prive.Travel
{
    /// <summary>
    /// Default <see cref="ITravelService"/>.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Phase 1 implements the full quote → book → execute path for cities that exist in the
    /// world model. Destinations without playable content are quoted and shown, but refuse to
    /// be booked — so the travel UI, pricing and fame effects are all exercised and tested
    /// long before a second city is built.
    /// </para>
    /// <para>
    /// Owned aircraft are quoted as unavailable until Phase 7 registers an ownership check
    /// through <see cref="SetOwnedAircraftCheck"/>. The seam exists now so that phase adds no
    /// branches here.
    /// </para>
    /// </remarks>
    public sealed class TravelService : ITravelService
    {
        private static readonly TravelMode[] AllModes =
        {
            TravelMode.GroundTransfer,
            TravelMode.CommercialEconomy,
            TravelMode.CommercialBusiness,
            TravelMode.CommercialFirst,
            TravelMode.PrivateJetCharter,
            TravelMode.OwnedJet,
            TravelMode.Helicopter,
            TravelMode.Yacht
        };

        private readonly IWorldLocationCatalog _world;
        private readonly PlayerProfile _player;
        private readonly IGameClock _clock;
        private readonly IEventBus _bus;
        private readonly ITravelPricingModel _pricing;

        private Func<bool> _ownsAircraft = () => false;

        public TravelService(IWorldLocationCatalog world, PlayerProfile player, IGameClock clock,
                             IEventBus bus, ITravelPricingModel pricing = null)
        {
            if (world == null) throw new ArgumentNullException("world");
            if (player == null) throw new ArgumentNullException("player");
            if (clock == null) throw new ArgumentNullException("clock");
            if (bus == null) throw new ArgumentNullException("bus");

            _world = world;
            _player = player;
            _clock = clock;
            _bus = bus;
            _pricing = pricing ?? new DistanceTravelPricingModel();
        }

        /// <summary>
        /// Supplies the ownership test for <see cref="TravelMode.OwnedJet"/>. Called by the
        /// aviation system when it ships; until then the mode quotes as unavailable.
        /// </summary>
        public void SetOwnedAircraftCheck(Func<bool> ownsAircraft)
        {
            _ownsAircraft = ownsAircraft ?? (() => false);
        }

        public IReadOnlyList<TravelQuote> GetQuotes(WorldLocationId from, WorldLocationId to)
        {
            CityData origin = _world.ResolveCity(from);
            CityData destination = _world.ResolveCity(to);

            List<TravelQuote> quotes = new List<TravelQuote>(AllModes.Length);

            if (origin == null || destination == null)
            {
                return quotes;
            }

            TravelRoute route = new TravelRoute(origin.Id, destination.Id, GreatCircle.DistanceKm(origin, destination));

            for (int i = 0; i < AllModes.Length; i++)
            {
                quotes.Add(BuildQuote(route, AllModes[i], origin, destination));
            }

            return quotes;
        }

        /// <summary>The cheapest bookable option, or a failure when none is available.</summary>
        public OperationResult<TravelQuote> GetCheapestQuote(WorldLocationId from, WorldLocationId to)
        {
            IReadOnlyList<TravelQuote> quotes = GetQuotes(from, to);

            bool found = false;
            TravelQuote best = default(TravelQuote);

            for (int i = 0; i < quotes.Count; i++)
            {
                if (!quotes[i].IsAvailable) continue;
                if (!found || quotes[i].Cost < best.Cost)
                {
                    best = quotes[i];
                    found = true;
                }
            }

            return found
                ? OperationResult<TravelQuote>.Success(best)
                : OperationResult<TravelQuote>.Failure(FailureReason.NotFound, "No bookable route.");
        }

        private TravelQuote BuildQuote(TravelRoute route, TravelMode mode, CityData origin, CityData destination)
        {
            if (route.IsSameCity)
            {
                return TravelQuote.Unavailable(route, mode, TravelUnavailableReason.SameLocation);
            }

            if (!destination.IsAvailable)
            {
                return TravelQuote.Unavailable(route, mode, TravelUnavailableReason.DestinationNotAvailable);
            }

            TransportCapabilities required = RequiredCapability(mode);
            if (!origin.Supports(required) || !destination.Supports(required))
            {
                return TravelQuote.Unavailable(route, mode, TravelUnavailableReason.NoInfrastructure);
            }

            if (route.DistanceKm > _pricing.MaxRangeKm(mode))
            {
                return TravelQuote.Unavailable(route, mode, TravelUnavailableReason.OutOfRange);
            }

            if (mode == TravelMode.OwnedJet && !_ownsAircraft())
            {
                return TravelQuote.Unavailable(route, mode, TravelUnavailableReason.RequiresOwnedAsset);
            }

            TravelPricing pricing = _pricing.Price(new TravelPricingContext(
                route, mode, origin, destination, _clock.Now, _player.Status.Fame));

            return TravelQuote.Available(route, mode, pricing.Cost, pricing.DurationMinutes,
                                         pricing.Comfort, pricing.FameDelta);
        }

        private static TransportCapabilities RequiredCapability(TravelMode mode)
        {
            switch (mode)
            {
                case TravelMode.GroundTransfer:
                    return TransportCapabilities.RoadLink;

                case TravelMode.CommercialEconomy:
                case TravelMode.CommercialBusiness:
                case TravelMode.CommercialFirst:
                    return TransportCapabilities.CommercialAirline;

                case TravelMode.PrivateJetCharter:
                case TravelMode.OwnedJet:
                    return TransportCapabilities.PrivateAviation;

                case TravelMode.Helicopter:
                    return TransportCapabilities.Helipad;

                case TravelMode.Yacht:
                    return TransportCapabilities.Marina;

                default:
                    return TransportCapabilities.None;
            }
        }

        public OperationResult<TravelTicket> Book(TravelQuote quote)
        {
            if (!quote.IsAvailable)
            {
                return OperationResult<TravelTicket>.Failure(
                    FailureReason.RequirementNotMet, "That route is not bookable: " + quote.UnavailableReason + ".");
            }

            CityData destination = _world.GetCity(quote.Route.To);
            string description = "Travel to " + (destination != null ? destination.DisplayName : quote.Route.To.ToString());

            OperationResult payment = _player.Economy.TryPay(
                quote.Cost, TransactionCategory.Travel, description, PaymentSource.Any);

            if (payment.IsFailure)
            {
                return OperationResult<TravelTicket>.Failure(payment.Reason, payment.Message);
            }

            TravelTicket ticket = new TravelTicket(
                _player.IdFactory.Next("ticket"), quote, _clock.Now, quote.Cost);

            _bus.Publish(new TravelBookedEvent(ticket));
            return OperationResult<TravelTicket>.Success(ticket);
        }

        public OperationResult Execute(TravelTicket ticket)
        {
            if (!ticket.IsValid)
            {
                return OperationResult.Failure(FailureReason.InvalidArgument, "Ticket is not valid.");
            }

            WorldLocationId from = _player.CurrentLocation;
            TravelQuote quote = ticket.Quote;

            _clock.Skip(quote.DurationMinutes, "travel:" + quote.Mode);

            _player.MoveTo(quote.Route.To);
            _player.Status.AddFame(quote.FameDelta);

            _bus.Publish(new PlayerArrivedEvent(
                from, quote.Route.To, quote.Mode, _clock.Now, quote.DurationMinutes));

            return OperationResult.Success();
        }

        public OperationResult<TravelTicket> Travel(TravelQuote quote)
        {
            OperationResult<TravelTicket> booking = Book(quote);
            if (booking.IsFailure) return booking;

            OperationResult execution = Execute(booking.Value);
            return execution.IsSuccess
                ? booking
                : OperationResult<TravelTicket>.Failure(execution.Reason, execution.Message);
        }
    }
}
