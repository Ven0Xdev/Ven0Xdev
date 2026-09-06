using System.Collections.Generic;

namespace Prive.World
{
    /// <summary>
    /// Read-only lookup for every place in the world.
    /// </summary>
    /// <remarks>
    /// Every system that needs to know about a location goes through here rather than
    /// holding scene references, so the simulation behaves identically whether a district is
    /// loaded, unloaded, or the player is mid-flight between continents.
    /// </remarks>
    public interface IWorldLocationCatalog
    {
        IReadOnlyList<CountryData> Countries { get; }
        IReadOnlyList<CityData> Cities { get; }

        /// <summary>Returns the country, or null when unknown.</summary>
        CountryData GetCountry(WorldLocationId id);

        /// <summary>Returns the city, or null when unknown.</summary>
        CityData GetCity(WorldLocationId id);

        /// <summary>Returns the district, or null when unknown.</summary>
        DistrictData GetDistrict(WorldLocationId id);

        /// <summary>Returns the airport, or null when unknown.</summary>
        AirportData GetAirport(WorldLocationId id);

        /// <summary>Districts belonging to <paramref name="cityId"/>, in authored order.</summary>
        IReadOnlyList<DistrictData> GetDistrictsOf(WorldLocationId cityId);

        /// <summary>Airports serving <paramref name="cityId"/>.</summary>
        IReadOnlyList<AirportData> GetAirportsOf(WorldLocationId cityId);

        /// <summary>
        /// Resolves any location id to the city that contains it — the city itself for a city
        /// id, the owning city for a district or airport id.
        /// </summary>
        CityData ResolveCity(WorldLocationId anyLocationId);

        bool IsKnown(WorldLocationId id);
    }
}
