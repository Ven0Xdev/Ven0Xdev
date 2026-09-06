using System;
using Prive.Core;
using Prive.World;

namespace Prive.Social
{
    /// <summary>
    /// Ties status, observed wealth and location together into the presence figure NPCs read.
    /// </summary>
    /// <remarks>
    /// Re-evaluated when the player arrives somewhere or their visible loadout changes —
    /// never per frame. Phase 5's NPC reaction system subscribes to
    /// <see cref="PlayerPresenceEvaluatedEvent"/> rather than recomputing this itself.
    /// </remarks>
    public sealed class SocialPresenceService
    {
        private readonly SocialStatus _status;
        private readonly ObservedWealthCalculator _observedWealth;
        private readonly IWorldLocationCatalog _world;
        private readonly IGameClock _clock;
        private readonly IEventBus _bus;

        public SocialPresenceService(SocialStatus status, ObservedWealthCalculator observedWealth,
                                     IWorldLocationCatalog world, IGameClock clock, IEventBus bus)
        {
            if (status == null) throw new ArgumentNullException("status");
            if (observedWealth == null) throw new ArgumentNullException("observedWealth");
            if (world == null) throw new ArgumentNullException("world");
            if (clock == null) throw new ArgumentNullException("clock");
            if (bus == null) throw new ArgumentNullException("bus");

            _status = status;
            _observedWealth = observedWealth;
            _world = world;
            _clock = clock;
            _bus = bus;
        }

        /// <summary>Presence from the most recent evaluation.</summary>
        public double CurrentScore { get; private set; }

        /// <summary>Observed wealth from the most recent evaluation.</summary>
        public Money CurrentObservedWealth { get { return _observedWealth.Current; } }

        /// <summary>
        /// Recomputes observed wealth and presence for <paramref name="location"/>, and
        /// publishes the result.
        /// </summary>
        public double Evaluate(WorldLocationId location)
        {
            PrestigeTier prestige = ResolvePrestige(location);

            ObservedWealthContext context = new ObservedWealthContext(
                location, prestige, _clock.Now,
                _status.Fame, _status.Reputation, _status.LifestyleScore);

            Money observed = _observedWealth.Evaluate(context);

            CurrentScore = PresenceScore.Evaluate(
                observed, _status.Fame, _status.Reputation, _status.LifestyleScore, prestige);

            _bus.Publish(new PlayerPresenceEvaluatedEvent(location, CurrentScore, observed));
            return CurrentScore;
        }

        private PrestigeTier ResolvePrestige(WorldLocationId location)
        {
            DistrictData district = _world.GetDistrict(location);
            if (district != null) return district.Prestige;

            // A city id, an airport, or somewhere not yet authored: assume neutral ground
            // rather than guessing high and inflating every reaction.
            return PrestigeTier.Standard;
        }
    }
}
