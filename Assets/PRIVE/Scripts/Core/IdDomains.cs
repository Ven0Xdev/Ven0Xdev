namespace Prive.Core
{
    /// <summary>
    /// The canonical <see cref="StableId"/> domains used across the project.
    /// Keeping them in one place stops the same concept being spelled two ways
    /// (<c>vehicle:</c> vs <c>car:</c>) in different systems.
    /// </summary>
    public static class IdDomains
    {
        // --- Content (authored, shipped with the build) ---
        public const string Location = "loc";
        public const string Country = "country";
        public const string City = "city";
        public const string District = "district";
        public const string Airport = "airport";
        public const string Venue = "venue";
        public const string VehicleModel = "vehicle_model";
        public const string PropertyModel = "property_model";
        public const string BusinessType = "business_type";
        public const string MarketAsset = "market_asset";
        public const string PhoneApp = "phone_app";
        public const string Npc = "npc";

        // --- Runtime (minted during play, persisted in saves) ---
        /// <summary>Domain for concrete owned instances — this car, this ticket, this position.</summary>
        public const string Instance = "inst";
    }
}
