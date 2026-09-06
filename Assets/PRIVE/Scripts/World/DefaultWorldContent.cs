using System.Collections.Generic;

namespace Prive.World
{
    /// <summary>
    /// Builds the shipping world catalog in code.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Phase 1 authors world content here so the simulation has a real world to run against
    /// before any Editor tooling exists. From Phase 3 the Unity layer builds the same catalog
    /// from <c>ScriptableObject</c> assets; this class then becomes the fallback and the
    /// reference for what a valid catalog looks like.
    /// </para>
    /// <para>
    /// Vermillion Bay is an original fictional city. Its districts are inspired by the feel
    /// of a Florida coastal metropolis — a financial spine, a beach strip, a design quarter,
    /// a marina, island mansions — without reproducing any real place.
    /// </para>
    /// </remarks>
    public static class DefaultWorldContent
    {
        public static WorldLocationCatalog Build()
        {
            WorldLocationCatalog catalog = new WorldLocationCatalog();

            AddVermillionBay(catalog);
            AddReservedDestinations(catalog);

            return catalog;
        }

        private static void AddVermillionBay(WorldLocationCatalog catalog)
        {
            WorldLocationId city = WorldLocations.VermillionBay;

            catalog.AddCountry(new CountryData(
                WorldLocations.CountryUsa,
                "United States", "USA", "USD",
                utcOffsetMinutes: -300,
                isAvailable: true,
                cities: new List<WorldLocationId> { city }));

            AddDistrict(catalog, WorldLocations.VermillionBayDistricts.Downtown, city,
                "Downtown", DistrictKind.Commercial, PrestigeTier.Standard);
            AddDistrict(catalog, WorldLocations.VermillionBayDistricts.FinancialDistrict, city,
                "Aurelia Heights", DistrictKind.Financial, PrestigeTier.Affluent);
            AddDistrict(catalog, WorldLocations.VermillionBayDistricts.SouthShore, city,
                "South Shore", DistrictKind.Nightlife, PrestigeTier.Affluent);
            AddDistrict(catalog, WorldLocations.VermillionBayDistricts.LuxuryDistrict, city,
                "The Design Quarter", DistrictKind.Luxury, PrestigeTier.Elite);
            AddDistrict(catalog, WorldLocations.VermillionBayDistricts.Marina, city,
                "Vermillion Marina", DistrictKind.Waterfront, PrestigeTier.Elite);
            AddDistrict(catalog, WorldLocations.VermillionBayDistricts.MansionIsles, city,
                "Coral Isles", DistrictKind.Residential, PrestigeTier.Elite);
            AddDistrict(catalog, WorldLocations.VermillionBayDistricts.AirportDistrict, city,
                "Airport District", DistrictKind.Transport, PrestigeTier.Modest);
            AddDistrict(catalog, WorldLocations.VermillionBayDistricts.Industrial, city,
                "Port Vermillion", DistrictKind.Industrial, PrestigeTier.Industrial);
            AddDistrict(catalog, WorldLocations.VermillionBayDistricts.Suburbs, city,
                "Palmetto Reach", DistrictKind.Residential, PrestigeTier.Modest);

            catalog.AddAirport(new AirportData(
                WorldLocations.VermillionBayInternational, city,
                "Vermillion Bay International", "KVBA",
                TransportCapabilities.CommercialAirline | TransportCapabilities.PrivateAviation | TransportCapabilities.Helipad,
                groundHandlingMinutes: 45));

            catalog.AddCity(new CityData(
                city, WorldLocations.CountryUsa, "Vermillion Bay",
                latitudeDeg: 25.9, longitudeDeg: -80.4,
                marketMultiplier: 1.0,
                transport: TransportCapabilities.RoadLink
                           | TransportCapabilities.CommercialAirline
                           | TransportCapabilities.PrivateAviation
                           | TransportCapabilities.Helipad
                           | TransportCapabilities.Marina,
                isAvailable: true,
                districts: new List<WorldLocationId>
                {
                    WorldLocations.VermillionBayDistricts.Downtown,
                    WorldLocations.VermillionBayDistricts.FinancialDistrict,
                    WorldLocations.VermillionBayDistricts.SouthShore,
                    WorldLocations.VermillionBayDistricts.LuxuryDistrict,
                    WorldLocations.VermillionBayDistricts.Marina,
                    WorldLocations.VermillionBayDistricts.MansionIsles,
                    WorldLocations.VermillionBayDistricts.AirportDistrict,
                    WorldLocations.VermillionBayDistricts.Industrial,
                    WorldLocations.VermillionBayDistricts.Suburbs
                },
                airports: new List<WorldLocationId> { WorldLocations.VermillionBayInternational }));
        }

        /// <summary>
        /// Destinations that exist in the world model but have no playable content yet.
        /// They are registered so travel routing, the phone's map and the fame system can be
        /// built and tested against a genuinely multi-city world from Phase 1.
        /// </summary>
        private static void AddReservedDestinations(WorldLocationCatalog catalog)
        {
            AddReserved(catalog, WorldLocations.CountryUae, "United Arab Emirates", "UAE", "AED", 240,
                WorldLocations.Dubai, "Dubai", 25.20, 55.27, 1.35);

            AddReserved(catalog, WorldLocations.CountryMonaco, "Monaco", "MCO", "EUR", 60,
                WorldLocations.MonteCarlo, "Monte Carlo", 43.74, 7.43, 1.80);

            AddReserved(catalog, WorldLocations.CountryUnitedKingdom, "United Kingdom", "GBR", "GBP", 0,
                WorldLocations.London, "London", 51.51, -0.13, 1.40);

            AddReserved(catalog, WorldLocations.CountryFrance, "France", "FRA", "EUR", 60,
                WorldLocations.Paris, "Paris", 48.86, 2.35, 1.25);

            AddReserved(catalog, WorldLocations.CountryItaly, "Italy", "ITA", "EUR", 60,
                WorldLocations.Milan, "Milan", 45.46, 9.19, 1.20);
        }

        private static void AddReserved(WorldLocationCatalog catalog,
                                        WorldLocationId countryId, string countryName, string countryCode,
                                        string currency, int utcOffsetMinutes,
                                        WorldLocationId cityId, string cityName,
                                        double lat, double lon, double marketMultiplier)
        {
            catalog.AddCountry(new CountryData(
                countryId, countryName, countryCode, currency, utcOffsetMinutes,
                isAvailable: false,
                cities: new List<WorldLocationId> { cityId }));

            WorldLocationId airportId = cityId.Child("airport_int");

            catalog.AddAirport(new AirportData(
                airportId, cityId, cityName + " International", BuildAirportCode(cityName),
                TransportCapabilities.CommercialAirline | TransportCapabilities.PrivateAviation | TransportCapabilities.Helipad,
                groundHandlingMinutes: 60));

            catalog.AddCity(new CityData(
                cityId, countryId, cityName, lat, lon, marketMultiplier,
                TransportCapabilities.RoadLink
                | TransportCapabilities.CommercialAirline
                | TransportCapabilities.PrivateAviation
                | TransportCapabilities.Helipad
                | TransportCapabilities.Marina,
                isAvailable: false,
                districts: new List<WorldLocationId>(),
                airports: new List<WorldLocationId> { airportId }));
        }

        private static string BuildAirportCode(string cityName)
        {
            string cleaned = cityName.Replace(" ", string.Empty).ToUpperInvariant();
            return cleaned.Length >= 3 ? "X" + cleaned.Substring(0, 3) : "XXXX";
        }

        private static void AddDistrict(WorldLocationCatalog catalog, WorldLocationId id, WorldLocationId cityId,
                                        string displayName, DistrictKind kind, PrestigeTier prestige)
        {
            catalog.AddDistrict(new DistrictData(id, cityId, displayName, kind, prestige,
                sceneAddress: "world/" + id.Path.Replace('.', '/')));
        }
    }
}
