namespace Prive.Social
{
    /// <summary>
    /// How the world reads the player's standing. Derived, never set directly.
    /// </summary>
    /// <remarks>
    /// Computed from <em>observed</em> wealth, fame and lifestyle — not from the bank
    /// balance. A quiet billionaire and a leveraged show-off can occupy the same class.
    /// </remarks>
    public enum SocialClass
    {
        Unknown = 0,
        Working,
        MiddleClass,
        UpperMiddle,
        Affluent,
        Wealthy,
        Elite,
        Icon
    }

    /// <summary>What kind of signal an observed-wealth contributor represents.</summary>
    public enum WealthSignalKind
    {
        Vehicle,
        Outfit,
        Watch,
        Jewellery,
        Residence,
        Neighbourhood,
        Fame,
        SocialMedia,
        Business,
        VenueAccess,
        Reputation,
        Entourage
    }
}
