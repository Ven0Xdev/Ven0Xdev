using System;

namespace Prive.World
{
    /// <summary>How exclusive a place reads to the world. Drives pricing, NPC mix and access rules.</summary>
    public enum PrestigeTier
    {
        Industrial = 1,
        Modest = 2,
        Standard = 3,
        Affluent = 4,
        Elite = 5
    }

    /// <summary>
    /// Transport infrastructure a place physically has.
    /// </summary>
    /// <remarks>
    /// Deliberately describes <em>infrastructure</em>, not travel modes. <c>Prive.World</c>
    /// owns what exists on the ground; <c>Prive.Travel</c> owns what the player can book and
    /// maps between the two. Without this split the two assemblies would reference each
    /// other.
    /// </remarks>
    [Flags]
    public enum TransportCapabilities
    {
        None = 0,
        RoadLink = 1 << 0,
        CommercialAirline = 1 << 1,
        PrivateAviation = 1 << 2,
        Helipad = 1 << 3,
        Marina = 1 << 4
    }

    /// <summary>What a district is mostly for. Used by content, NPC mix and opportunity generation.</summary>
    public enum DistrictKind
    {
        Residential,
        Commercial,
        Financial,
        Nightlife,
        Luxury,
        Waterfront,
        Industrial,
        Transport
    }
}
