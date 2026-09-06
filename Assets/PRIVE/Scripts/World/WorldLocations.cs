namespace Prive.World
{
    /// <summary>
    /// Canonical location ids. Referencing a place through these constants rather than a
    /// string literal means a typo is a compile error.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Future destinations are declared here from day one — reserving the ids costs nothing
    /// and guarantees that adding Dubai later is content work, not an id migration.
    /// </para>
    /// <para>
    /// <b>Every id is built from a <c>const string</c> path, never from another static field.</b>
    /// A nested static class is initialised on first touch of one of <em>its own</em> members,
    /// which can happen before the outer class's field initialisers have run. Deriving
    /// <c>VermillionBayDistricts.Downtown</c> from the <c>VermillionBay</c> field therefore
    /// threw or silently produced an invalid id depending on which member the game happened
    /// to touch first. Compile-time constants have no initialisation order at all.
    /// </para>
    /// </remarks>
    public static class WorldLocations
    {
        // --- path constants (compile-time; order-independent) --------------------
        private const string UsaPath = "usa";
        private const string UaePath = "uae";
        private const string MonacoPath = "monaco";
        private const string UnitedKingdomPath = "uk";
        private const string FrancePath = "france";
        private const string ItalyPath = "italy";

        private const string VermillionBayPath = "usa_vermillion_bay";
        private const string DubaiPath = "uae_dubai";
        private const string MonteCarloPath = "monaco_monte_carlo";
        private const string LondonPath = "uk_london";
        private const string ParisPath = "france_paris";
        private const string MilanPath = "italy_milan";

        /// <summary>Suffix used for every city's primary international airport.</summary>
        public const string InternationalAirportSegment = "airport_int";

        // ---------------------------------------------------------------- countries
        public static readonly WorldLocationId CountryUsa = WorldLocationId.FromPath(UsaPath);
        public static readonly WorldLocationId CountryUae = WorldLocationId.FromPath(UaePath);
        public static readonly WorldLocationId CountryMonaco = WorldLocationId.FromPath(MonacoPath);
        public static readonly WorldLocationId CountryUnitedKingdom = WorldLocationId.FromPath(UnitedKingdomPath);
        public static readonly WorldLocationId CountryFrance = WorldLocationId.FromPath(FrancePath);
        public static readonly WorldLocationId CountryItaly = WorldLocationId.FromPath(ItalyPath);

        // ------------------------------------------------------------------- cities
        /// <summary>The first playable city: an original fictional luxury coastal city.</summary>
        public static readonly WorldLocationId VermillionBay = WorldLocationId.FromPath(VermillionBayPath);

        public static readonly WorldLocationId Dubai = WorldLocationId.FromPath(DubaiPath);
        public static readonly WorldLocationId MonteCarlo = WorldLocationId.FromPath(MonteCarloPath);
        public static readonly WorldLocationId London = WorldLocationId.FromPath(LondonPath);
        public static readonly WorldLocationId Paris = WorldLocationId.FromPath(ParisPath);
        public static readonly WorldLocationId Milan = WorldLocationId.FromPath(MilanPath);

        // -------------------------------------------------- Vermillion Bay districts
        public static class VermillionBayDistricts
        {
            public static readonly WorldLocationId Downtown = WorldLocationId.FromPath(VermillionBayPath + ".downtown");
            public static readonly WorldLocationId FinancialDistrict = WorldLocationId.FromPath(VermillionBayPath + ".financial_district");
            public static readonly WorldLocationId SouthShore = WorldLocationId.FromPath(VermillionBayPath + ".south_shore");
            public static readonly WorldLocationId LuxuryDistrict = WorldLocationId.FromPath(VermillionBayPath + ".luxury_district");
            public static readonly WorldLocationId Marina = WorldLocationId.FromPath(VermillionBayPath + ".marina");
            public static readonly WorldLocationId MansionIsles = WorldLocationId.FromPath(VermillionBayPath + ".mansion_isles");
            public static readonly WorldLocationId AirportDistrict = WorldLocationId.FromPath(VermillionBayPath + ".airport");
            public static readonly WorldLocationId Industrial = WorldLocationId.FromPath(VermillionBayPath + ".industrial");
            public static readonly WorldLocationId Suburbs = WorldLocationId.FromPath(VermillionBayPath + ".suburbs");
        }

        // --------------------------------------------------------------- airports
        public static readonly WorldLocationId VermillionBayInternational =
            WorldLocationId.FromPath(VermillionBayPath + "." + InternationalAirportSegment);

        /// <summary>Where a new game begins: a modest apartment in Downtown.</summary>
        public static readonly WorldLocationId DefaultStartLocation =
            WorldLocationId.FromPath(VermillionBayPath + ".downtown");
    }
}
