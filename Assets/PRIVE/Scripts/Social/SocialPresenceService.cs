using System;
using Prive.Core;
using Prive.World;

namespace Prive.Social
{
    /// <summary>
    /// Ties status, observed wealth and location together into the presence figure NPCs read.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Re-evaluated when the player arrives somewhere or their visible loadout changes — never
    /// per frame. Phase 5's NPC reaction system subscribes to
    /// <see cref="PlayerPresenceEvaluatedEvent"/> rather than recomputing this itself.
    /// </para>
    /// <para>
    /// The service subscribes to <see cref="VisibleLoadoutChangedEvent"/> so that swapping a
    /// car or an outfit refreshes perception on its own. Content systems publish that event;
    /// they never need to know this class exists.
    /// </para>
    /// </remarks>
    public sealed class SocialPresenceService : IDisposable
    {
        private readonly SocialStatus _status;
        private readonly ObservedWealthCalculator _observedWealth;
        private readonly IWorldLocationCatalog _world;
        private readonly IGameClock _clock;
        private readonly IEventBus _bus;
        private readonly IDisposable _loadoutSubscription;

        private bool _hasLocation;

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

            _loadoutSubscription = bus.Subscribe<VisibleLoadoutChangedEvent>(OnVisibleLoadoutChanged);
        }

        /// <summary>Presence from the most recent evaluation.</summary>
        public double CurrentScore { get; private set; }

        /// <summary>Observed wealth from the most recent evaluation.</summary>
        public Money CurrentObservedWealth { get { return _observedWealth.Current; } }

        /// <summary>Where the last evaluation was made.</summary>
        public WorldLocationId CurrentLocation { get; private set; }

        /// <summary>
        /// Recomputes observed wealth and presence for <paramref name="location"/>, and
        /// publishes the result.
        /// </summary>
        public double Evaluate(WorldLocationId location)
        {
            CurrentLocation = location;
            _hasLocation = true;

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

        /// <summary>
        /// Re-evaluates at the last known location. No-op until <see cref="Evaluate"/> has
        /// established one, so a loadout change before the session is placed in the world
        /// cannot evaluate against a nonexistent location.
        /// </summary>
        public double Refresh()
        {
            return _hasLocation ? Evaluate(CurrentLocation) : CurrentScore;
        }

        private void OnVisibleLoadoutChanged(VisibleLoadoutChangedEvent message)
        {
            Refresh();
        }

        private PrestigeTier ResolvePrestige(WorldLocationId location)
        {
            DistrictData district = _world.GetDistrict(location);
            if (district != null) return district.Prestige;

            // A city id, an airport, or somewhere not yet authored: assume neutral ground
            // rather than guessing high and inflating every reaction.
            return PrestigeTier.Standard;
        }

        public void Dispose()
        {
            if (_loadoutSubscription != null) _loadoutSubscription.Dispose();
        }
    }
}
