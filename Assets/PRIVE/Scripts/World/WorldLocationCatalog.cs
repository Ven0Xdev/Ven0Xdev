using System;
using System.Collections.Generic;

namespace Prive.World
{
    /// <summary>
    /// In-memory <see cref="IWorldLocationCatalog"/>, populated once at bootstrap from
    /// authored content.
    /// </summary>
    /// <remarks>
    /// <see cref="Validate"/> exists because a dangling location reference is the kind of
    /// content bug that otherwise surfaces as a null flight three hours into a playthrough.
    /// It is called at bootstrap and asserted in tests.
    /// </remarks>
    public sealed class WorldLocationCatalog : IWorldLocationCatalog
    {
        private readonly Dictionary<WorldLocationId, CountryData> _countries = new Dictionary<WorldLocationId, CountryData>();
        private readonly Dictionary<WorldLocationId, CityData> _cities = new Dictionary<WorldLocationId, CityData>();
        private readonly Dictionary<WorldLocationId, DistrictData> _districts = new Dictionary<WorldLocationId, DistrictData>();
        private readonly Dictionary<WorldLocationId, AirportData> _airports = new Dictionary<WorldLocationId, AirportData>();

        private readonly List<CountryData> _countryOrder = new List<CountryData>();
        private readonly List<CityData> _cityOrder = new List<CityData>();

        public IReadOnlyList<CountryData> Countries { get { return _countryOrder; } }
        public IReadOnlyList<CityData> Cities { get { return _cityOrder; } }

        public void AddCountry(CountryData country)
        {
            if (country == null) throw new ArgumentNullException("country");
            RequireUnique(country.Id);
            _countries.Add(country.Id, country);
            _countryOrder.Add(country);
        }

        public void AddCity(CityData city)
        {
            if (city == null) throw new ArgumentNullException("city");
            RequireUnique(city.Id);
            _cities.Add(city.Id, city);
            _cityOrder.Add(city);
        }

        public void AddDistrict(DistrictData district)
        {
            if (district == null) throw new ArgumentNullException("district");
            RequireUnique(district.Id);
            _districts.Add(district.Id, district);
        }

        public void AddAirport(AirportData airport)
        {
            if (airport == null) throw new ArgumentNullException("airport");
            RequireUnique(airport.Id);
            _airports.Add(airport.Id, airport);
        }

        public CountryData GetCountry(WorldLocationId id)
        {
            CountryData found;
            return _countries.TryGetValue(id, out found) ? found : null;
        }

        public CityData GetCity(WorldLocationId id)
        {
            CityData found;
            return _cities.TryGetValue(id, out found) ? found : null;
        }

        public DistrictData GetDistrict(WorldLocationId id)
        {
            DistrictData found;
            return _districts.TryGetValue(id, out found) ? found : null;
        }

        public AirportData GetAirport(WorldLocationId id)
        {
            AirportData found;
            return _airports.TryGetValue(id, out found) ? found : null;
        }

        public IReadOnlyList<DistrictData> GetDistrictsOf(WorldLocationId cityId)
        {
            CityData city = GetCity(cityId);
            if (city == null) return Array.Empty<DistrictData>();

            List<DistrictData> result = new List<DistrictData>(city.Districts.Count);
            for (int i = 0; i < city.Districts.Count; i++)
            {
                DistrictData district = GetDistrict(city.Districts[i]);
                if (district != null) result.Add(district);
            }

            return result;
        }

        public IReadOnlyList<AirportData> GetAirportsOf(WorldLocationId cityId)
        {
            CityData city = GetCity(cityId);
            if (city == null) return Array.Empty<AirportData>();

            List<AirportData> result = new List<AirportData>(city.Airports.Count);
            for (int i = 0; i < city.Airports.Count; i++)
            {
                AirportData airport = GetAirport(city.Airports[i]);
                if (airport != null) result.Add(airport);
            }

            return result;
        }

        public CityData ResolveCity(WorldLocationId anyLocationId)
        {
            if (!anyLocationId.IsValid) return null;

            CityData city = GetCity(anyLocationId);
            if (city != null) return city;

            DistrictData district = GetDistrict(anyLocationId);
            if (district != null) return GetCity(district.CityId);

            AirportData airport = GetAirport(anyLocationId);
            if (airport != null) return GetCity(airport.CityId);

            // Fall back to the id's own parent path, which covers districts that exist in
            // content but were not registered — better a city than nothing.
            WorldLocationId parent = anyLocationId.Parent;
            return parent.IsValid ? GetCity(parent) : null;
        }

        public bool IsKnown(WorldLocationId id)
        {
            return _countries.ContainsKey(id)
                   || _cities.ContainsKey(id)
                   || _districts.ContainsKey(id)
                   || _airports.ContainsKey(id);
        }

        /// <summary>
        /// Checks every cross-reference in the catalog. Returns the problems found;
        /// an empty list means the content graph is sound.
        /// </summary>
        public IReadOnlyList<string> Validate()
        {
            List<string> problems = new List<string>();

            foreach (CountryData country in _countryOrder)
            {
                for (int i = 0; i < country.Cities.Count; i++)
                {
                    if (!_cities.ContainsKey(country.Cities[i]))
                    {
                        problems.Add("Country '" + country.Id + "' lists unknown city '" + country.Cities[i] + "'.");
                    }
                }
            }

            foreach (CityData city in _cityOrder)
            {
                if (!_countries.ContainsKey(city.CountryId))
                {
                    problems.Add("City '" + city.Id + "' belongs to unknown country '" + city.CountryId + "'.");
                }

                for (int i = 0; i < city.Districts.Count; i++)
                {
                    if (!_districts.ContainsKey(city.Districts[i]))
                    {
                        problems.Add("City '" + city.Id + "' lists unknown district '" + city.Districts[i] + "'.");
                    }
                }

                for (int i = 0; i < city.Airports.Count; i++)
                {
                    if (!_airports.ContainsKey(city.Airports[i]))
                    {
                        problems.Add("City '" + city.Id + "' lists unknown airport '" + city.Airports[i] + "'.");
                    }
                }
            }

            foreach (KeyValuePair<WorldLocationId, DistrictData> kvp in _districts)
            {
                if (!_cities.ContainsKey(kvp.Value.CityId))
                {
                    problems.Add("District '" + kvp.Key + "' belongs to unknown city '" + kvp.Value.CityId + "'.");
                }
            }

            foreach (KeyValuePair<WorldLocationId, AirportData> kvp in _airports)
            {
                if (!_cities.ContainsKey(kvp.Value.CityId))
                {
                    problems.Add("Airport '" + kvp.Key + "' belongs to unknown city '" + kvp.Value.CityId + "'.");
                }
            }

            return problems;
        }

        private void RequireUnique(WorldLocationId id)
        {
            if (IsKnown(id))
            {
                throw new InvalidOperationException("Location '" + id + "' is already registered.");
            }
        }
    }
}
