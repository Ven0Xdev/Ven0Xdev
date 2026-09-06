using Prive.World;

namespace Prive.Player
{
    /// <summary>Published when the player's world location changes, however they got there.</summary>
    /// <remarks>
    /// Systems react to <em>being somewhere</em>, not to the means of arrival. Streaming,
    /// markets, NPC pools and venue access all subscribe here and none of them need to know
    /// whether the player drove, flew or fast-travelled.
    /// </remarks>
    public readonly struct PlayerLocationChangedEvent
    {
        public readonly WorldLocationId Previous;
        public readonly WorldLocationId Current;

        public PlayerLocationChangedEvent(WorldLocationId previous, WorldLocationId current)
        {
            Previous = previous;
            Current = current;
        }
    }

    /// <summary>Published once at the start of a session, after the profile is built or loaded.</summary>
    public readonly struct PlayerProfileReadyEvent
    {
        public readonly PlayerProfile Profile;
        public PlayerProfileReadyEvent(PlayerProfile profile) { Profile = profile; }
    }
}
