namespace Prive.Vehicles
{
    /// <summary>
    /// What kind of vehicle this is. Drives valuation curves, dealership stocking rules and
    /// how strongly the vehicle reads as a wealth signal.
    /// </summary>
    public enum VehicleCategory
    {
        Economy = 0,
        Sports = 1,
        Luxury = 2,
        LuxurySuv = 3,
        Supercar = 4,
        Hypercar = 5,
        Limousine = 6,
        Classic = 7,
        RareCollector = 8
    }

    /// <summary>
    /// How hard a vehicle is to find. Rarity slows depreciation and, at the top, reverses it.
    /// </summary>
    public enum VehicleRarity
    {
        Common = 0,
        Uncommon = 1,
        Rare = 2,
        VeryRare = 3,
        Exotic = 4
    }

    /// <summary>
    /// A human-readable band derived from the continuous condition value. UI and dealership
    /// copy use this; valuation always uses the underlying number.
    /// </summary>
    public enum VehicleConditionGrade
    {
        Salvage = 0,
        Poor = 1,
        Fair = 2,
        Good = 3,
        Excellent = 4,
        Pristine = 5
    }

    /// <summary>Where an owned vehicle currently is, and therefore who can see it.</summary>
    public enum VehicleStorageState
    {
        /// <summary>Parked in a garage. Counts towards net worth; not visible to the world.</summary>
        Garaged = 0,

        /// <summary>The vehicle the player is currently using. This is the one the world sees.</summary>
        Active = 1,

        /// <summary>Listed with a dealership for sale. Still owned until it sells.</summary>
        Consigned = 2
    }
}
