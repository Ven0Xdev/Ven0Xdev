using System;
using System.Collections.Generic;

namespace Prive.World
{
    /// <summary>An immutable country record.</summary>
    /// <remarks>
    /// Authored as a <c>ScriptableObject</c> in the Unity layer and projected into this
    /// engine-free form at load, so the simulation never holds an asset reference.
    /// </remarks>
    public sealed class CountryData
    {
        public WorldLocationId Id { get; private set; }
        public string DisplayName { get; private set; }

        /// <summary>ISO-style code for display, e.g. "USA". Fictional locations may use invented codes.</summary>
        public string Code { get; private set; }

        public string CurrencyCode { get; private set; }
        public int UtcOffsetMinutes { get; private set; }

        /// <summary>False for countries reserved for later phases; travel to them is refused until unlocked.</summary>
        public bool IsAvailable { get; private set; }

        public IReadOnlyList<WorldLocationId> Cities { get; private set; }

        public CountryData(WorldLocationId id, string displayName, string code, string currencyCode,
                           int utcOffsetMinutes, bool isAvailable, IReadOnlyList<WorldLocationId> cities)
        {
            if (!id.IsValid) throw new ArgumentException("Country id is required", "id");

            Id = id;
            DisplayName = displayName;
            Code = code;
            CurrencyCode = currencyCode;
            UtcOffsetMinutes = utcOffsetMinutes;
            IsAvailable = isAvailable;
            Cities = cities ?? Array.Empty<WorldLocationId>();
        }

        public override string ToString() { return DisplayName + " (" + Id + ")"; }
    }

    /// <summary>An immutable city record. The unit of world streaming and of travel.</summary>
    public sealed class CityData
    {
        public WorldLocationId Id { get; private set; }
        public WorldLocationId CountryId { get; private set; }
        public string DisplayName { get; private set; }

        /// <summary>Geographic position, used for great-circle travel distance.</summary>
        public double LatitudeDeg { get; private set; }
        public double LongitudeDeg { get; private set; }

        /// <summary>Overall cost-of-living / luxury market multiplier. 1.0 is the baseline.</summary>
        public double MarketMultiplier { get; private set; }

        public TransportCapabilities Transport { get; private set; }

        /// <summary>False for cities reserved for later phases.</summary>
        public bool IsAvailable { get; private set; }

        public IReadOnlyList<WorldLocationId> Districts { get; private set; }
        public IReadOnlyList<WorldLocationId> Airports { get; private set; }

        public CityData(WorldLocationId id, WorldLocationId countryId, string displayName,
                        double latitudeDeg, double longitudeDeg, double marketMultiplier,
                        TransportCapabilities transport, bool isAvailable,
                        IReadOnlyList<WorldLocationId> districts, IReadOnlyList<WorldLocationId> airports)
        {
            if (!id.IsValid) throw new ArgumentException("City id is required", "id");
            if (latitudeDeg < -90.0 || latitudeDeg > 90.0) throw new ArgumentOutOfRangeException("latitudeDeg");
            if (longitudeDeg < -180.0 || longitudeDeg > 180.0) throw new ArgumentOutOfRangeException("longitudeDeg");
            if (marketMultiplier <= 0.0) throw new ArgumentOutOfRangeException("marketMultiplier");

            Id = id;
            CountryId = countryId;
            DisplayName = displayName;
            LatitudeDeg = latitudeDeg;
            LongitudeDeg = longitudeDeg;
            MarketMultiplier = marketMultiplier;
            Transport = transport;
            IsAvailable = isAvailable;
            Districts = districts ?? Array.Empty<WorldLocationId>();
            Airports = airports ?? Array.Empty<WorldLocationId>();
        }

        public bool Supports(TransportCapabilities capability)
        {
            return (Transport & capability) == capability;
        }

        public override string ToString() { return DisplayName + " (" + Id + ")"; }
    }

    /// <summary>An immutable district record — the unit of scene streaming.</summary>
    public sealed class DistrictData
    {
        public WorldLocationId Id { get; private set; }
        public WorldLocationId CityId { get; private set; }
        public string DisplayName { get; private set; }
        public DistrictKind Kind { get; private set; }
        public PrestigeTier Prestige { get; private set; }

        /// <summary>
        /// Addressables key for this district's additive scene. Never a scene <em>name</em>:
        /// scene names are a build-settings detail and hardcoding them is how streaming code
        /// ends up coupled to editor state.
        /// </summary>
        public string SceneAddress { get; private set; }

        public DistrictData(WorldLocationId id, WorldLocationId cityId, string displayName,
                            DistrictKind kind, PrestigeTier prestige, string sceneAddress)
        {
            if (!id.IsValid) throw new ArgumentException("District id is required", "id");

            Id = id;
            CityId = cityId;
            DisplayName = displayName;
            Kind = kind;
            Prestige = prestige;
            SceneAddress = sceneAddress ?? string.Empty;
        }

        public override string ToString() { return DisplayName + " (" + Id + ")"; }
    }

    /// <summary>An immutable airport record.</summary>
    public sealed class AirportData
    {
        public WorldLocationId Id { get; private set; }
        public WorldLocationId CityId { get; private set; }
        public string DisplayName { get; private set; }

        /// <summary>Four-letter fictional code, e.g. "KVBA".</summary>
        public string Code { get; private set; }

        public TransportCapabilities Transport { get; private set; }

        /// <summary>Minutes between landing and being free to act — customs, baggage, transfer.</summary>
        public int GroundHandlingMinutes { get; private set; }

        public AirportData(WorldLocationId id, WorldLocationId cityId, string displayName, string code,
                           TransportCapabilities transport, int groundHandlingMinutes)
        {
            if (!id.IsValid) throw new ArgumentException("Airport id is required", "id");
            if (groundHandlingMinutes < 0) throw new ArgumentOutOfRangeException("groundHandlingMinutes");

            Id = id;
            CityId = cityId;
            DisplayName = displayName;
            Code = code;
            Transport = transport;
            GroundHandlingMinutes = groundHandlingMinutes;
        }

        public bool Supports(TransportCapabilities capability)
        {
            return (Transport & capability) == capability;
        }

        public override string ToString() { return DisplayName + " [" + Code + "]"; }
    }
}
