using Prive.Core;
using Prive.World;

namespace Prive.Social
{
    /// <summary>Published whenever any status value moves.</summary>
    public readonly struct SocialStatusChangedEvent
    {
        public readonly double Fame;
        public readonly double Reputation;
        public readonly double Influence;
        public readonly double LifestyleScore;

        public SocialStatusChangedEvent(SocialStatus status)
        {
            Fame = status.Fame;
            Reputation = status.Reputation;
            Influence = status.Influence;
            LifestyleScore = status.LifestyleScore;
        }
    }

    /// <summary>Published when the player crosses into a different social class.</summary>
    public readonly struct SocialClassChangedEvent
    {
        public readonly SocialClass Previous;
        public readonly SocialClass Current;

        public SocialClassChangedEvent(SocialClass previous, SocialClass current)
        {
            Previous = previous;
            Current = current;
        }

        public bool IsPromotion { get { return Current > Previous; } }
    }

    /// <summary>Published when the wealth the world <em>perceives</em> changes materially.</summary>
    public readonly struct ObservedWealthChangedEvent
    {
        public readonly Money Previous;
        public readonly Money Current;

        public ObservedWealthChangedEvent(Money previous, Money current)
        {
            Previous = previous;
            Current = current;
        }
    }

    /// <summary>
    /// Published by any system whose contribution to the player's <em>visible</em> loadout has
    /// changed — a different car being driven, an outfit swapped, a watch put on.
    /// </summary>
    /// <remarks>
    /// This is the seam that lets content systems invalidate perception without knowing that
    /// <see cref="SocialPresenceService"/> exists. Without it, every new visible-wealth source
    /// would have to be wired into the presence service by hand, and forgetting one would
    /// silently leave the world reacting to a car the player is no longer driving.
    /// </remarks>
    public readonly struct VisibleLoadoutChangedEvent
    {
        /// <summary>What changed, for logging and debugging. Not used for logic.</summary>
        public readonly WealthSignalKind Kind;

        public VisibleLoadoutChangedEvent(WealthSignalKind kind) { Kind = kind; }
    }

    /// <summary>
    /// Published when the player becomes visible somewhere, carrying the presence score NPCs
    /// react to.
    /// </summary>
    public readonly struct PlayerPresenceEvaluatedEvent
    {
        public readonly WorldLocationId Location;
        public readonly double PresenceScore;
        public readonly Money ObservedWealth;

        public PlayerPresenceEvaluatedEvent(WorldLocationId location, double presenceScore, Money observedWealth)
        {
            Location = location;
            PresenceScore = presenceScore;
            ObservedWealth = observedWealth;
        }
    }
}
