namespace Prive.Travel
{
    /// <summary>
    /// How the player can move between cities.
    /// </summary>
    /// <remarks>
    /// Ordered roughly by cost and exclusivity. Later phases add owned aircraft, crew, slots
    /// and customs; the mode list is where that content hangs, and nothing outside
    /// <c>Prive.Travel</c> needs to change to support it.
    /// </remarks>
    public enum TravelMode
    {
        /// <summary>Car or chauffeur between nearby cities. Cheap, slow, no prestige.</summary>
        GroundTransfer = 0,

        CommercialEconomy = 1,
        CommercialBusiness = 2,
        CommercialFirst = 3,

        /// <summary>Chartered jet. No ownership required, priced per trip.</summary>
        PrivateJetCharter = 4,

        /// <summary>The player's own aircraft. Requires ownership; only operating cost is charged.</summary>
        OwnedJet = 5,

        /// <summary>Short hops between cities with helipads.</summary>
        Helicopter = 6,

        /// <summary>Between coastal cities with marinas. Slow, expensive, extremely visible.</summary>
        Yacht = 7
    }

    /// <summary>Why a travel option is not currently bookable.</summary>
    public enum TravelUnavailableReason
    {
        None = 0,

        /// <summary>Origin or destination lacks the infrastructure — no marina, no helipad.</summary>
        NoInfrastructure,

        /// <summary>Beyond this mode's practical range.</summary>
        OutOfRange,

        /// <summary>Destination exists in the world model but has no playable content yet.</summary>
        DestinationNotAvailable,

        /// <summary>Requires an asset the player does not own, such as a jet.</summary>
        RequiresOwnedAsset,

        /// <summary>Origin and destination are the same place.</summary>
        SameLocation
    }
}
