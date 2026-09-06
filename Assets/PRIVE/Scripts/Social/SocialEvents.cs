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
