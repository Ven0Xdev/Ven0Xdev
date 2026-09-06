using Prive.Core;

namespace Prive.Vehicles
{
    /// <summary>
    /// The shipping vehicle catalogue: fourteen fictional models spanning the whole
    /// progression, from a car the player can afford on day one to one they may never own.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>Every brand and model name here is invented.</b> No real manufacturer's marks appear
    /// anywhere in the project. The prestige and rarity bands are deliberately shaped so that
    /// licensed or fictional replacements can be slotted in later without re-tuning the
    /// economy — a model's tier is defined by its numbers, not by its name.
    /// </para>
    /// <para>
    /// The bottom of the ladder matters as much as the top. A new game starts with $5,000, so
    /// the two cheapest models exist specifically to make the trading loop reachable in the
    /// first few minutes rather than after a grind.
    /// </para>
    /// <para>
    /// Authored in code for Phase 2 for the same reason the world was: the economy needs real
    /// content to be tested against before Editor tooling exists. Phase 3 projects the same
    /// data from <c>ScriptableObject</c>s.
    /// </para>
    /// </remarks>
    public static class DefaultVehicleCatalog
    {
        // --- ids ----------------------------------------------------------------
        public static readonly VehicleDefinitionId CorvaneDart = VehicleDefinitionId.FromName("corvane_dart");
        public static readonly VehicleDefinitionId CorvanePilot = VehicleDefinitionId.FromName("corvane_pilot");
        public static readonly VehicleDefinitionId MarrowVector = VehicleDefinitionId.FromName("marrow_vector");
        public static readonly VehicleDefinitionId MarrowRidgeline = VehicleDefinitionId.FromName("marrow_ridgeline");
        public static readonly VehicleDefinitionId KestrelSirocco = VehicleDefinitionId.FromName("kestrel_sirocco");
        public static readonly VehicleDefinitionId AurelianMeridian = VehicleDefinitionId.FromName("aurelian_meridian");
        public static readonly VehicleDefinitionId AurelianSovereign = VehicleDefinitionId.FromName("aurelian_sovereign");
        public static readonly VehicleDefinitionId SableEstate = VehicleDefinitionId.FromName("sable_estate");
        public static readonly VehicleDefinitionId VeloceScuro = VehicleDefinitionId.FromName("veloce_scuro");
        public static readonly VehicleDefinitionId VeloceTempesta = VehicleDefinitionId.FromName("veloce_tempesta");
        public static readonly VehicleDefinitionId NyxAscendant = VehicleDefinitionId.FromName("nyx_ascendant");
        public static readonly VehicleDefinitionId HalcyonRegent = VehicleDefinitionId.FromName("halcyon_regent");
        public static readonly VehicleDefinitionId TessaroCoupe62 = VehicleDefinitionId.FromName("tessaro_coupe_62");
        public static readonly VehicleDefinitionId VeloceStradaGT = VehicleDefinitionId.FromName("veloce_strada_gt");

        public static VehicleCatalog Build()
        {
            VehicleCatalog catalog = new VehicleCatalog();

            // --- Economy: the entry point. Affordable on the starting balance. -----
            catalog.Add(new VehicleDefinition(
                CorvaneDart, "Corvane", "Dart",
                VehicleCategory.Economy, VehicleRarity.Common,
                Money.FromDollars(4200L), basePrestige: 4, expectedLifetimeKm: 260000,
                annualValueRate: -0.11, seatCount: 4, topSpeedKph: 175));

            catalog.Add(new VehicleDefinition(
                CorvanePilot, "Corvane", "Pilot",
                VehicleCategory.Economy, VehicleRarity.Common,
                Money.FromDollars(9800L), basePrestige: 8, expectedLifetimeKm: 280000,
                annualValueRate: -0.10, seatCount: 5, topSpeedKph: 190));

            catalog.Add(new VehicleDefinition(
                MarrowVector, "Marrow", "Vector",
                VehicleCategory.Economy, VehicleRarity.Common,
                Money.FromDollars(23500L), basePrestige: 14, expectedLifetimeKm: 300000,
                annualValueRate: -0.12, seatCount: 5, topSpeedKph: 210));

            // --- Sports -----------------------------------------------------------
            catalog.Add(new VehicleDefinition(
                KestrelSirocco, "Kestrel", "Sirocco",
                VehicleCategory.Sports, VehicleRarity.Uncommon,
                Money.FromDollars(58000L), basePrestige: 38, expectedLifetimeKm: 180000,
                annualValueRate: -0.10, seatCount: 2, topSpeedKph: 265));

            catalog.Add(new VehicleDefinition(
                VeloceScuro, "Veloce", "Scuro",
                VehicleCategory.Sports, VehicleRarity.Rare,
                Money.FromDollars(142000L), basePrestige: 55, expectedLifetimeKm: 150000,
                annualValueRate: -0.08, seatCount: 2, topSpeedKph: 305));

            // --- Luxury -----------------------------------------------------------
            catalog.Add(new VehicleDefinition(
                AurelianMeridian, "Aurelian", "Meridian",
                VehicleCategory.Luxury, VehicleRarity.Uncommon,
                Money.FromDollars(96000L), basePrestige: 48, expectedLifetimeKm: 200000,
                annualValueRate: -0.14, seatCount: 5, topSpeedKph: 250));

            catalog.Add(new VehicleDefinition(
                AurelianSovereign, "Aurelian", "Sovereign",
                VehicleCategory.Luxury, VehicleRarity.Rare,
                Money.FromDollars(340000L), basePrestige: 74, expectedLifetimeKm: 160000,
                annualValueRate: -0.12, seatCount: 5, topSpeedKph: 260));

            // --- Luxury SUV -------------------------------------------------------
            catalog.Add(new VehicleDefinition(
                MarrowRidgeline, "Marrow", "Ridgeline",
                VehicleCategory.LuxurySuv, VehicleRarity.Uncommon,
                Money.FromDollars(128000L), basePrestige: 45, expectedLifetimeKm: 240000,
                annualValueRate: -0.13, garageSlots: 1, seatCount: 7, topSpeedKph: 230));

            catalog.Add(new VehicleDefinition(
                SableEstate, "Sable", "Estate",
                VehicleCategory.LuxurySuv, VehicleRarity.Rare,
                Money.FromDollars(312000L), basePrestige: 72, expectedLifetimeKm: 200000,
                annualValueRate: -0.11, garageSlots: 1, seatCount: 5, topSpeedKph: 250));

            // --- Limousine --------------------------------------------------------
            catalog.Add(new VehicleDefinition(
                HalcyonRegent, "Halcyon", "Regent",
                VehicleCategory.Limousine, VehicleRarity.Rare,
                Money.FromDollars(196000L), basePrestige: 62, expectedLifetimeKm: 220000,
                annualValueRate: -0.13, garageSlots: 2, seatCount: 8, topSpeedKph: 210));

            // --- Supercar ---------------------------------------------------------
            catalog.Add(new VehicleDefinition(
                VeloceTempesta, "Veloce", "Tempesta",
                VehicleCategory.Supercar, VehicleRarity.VeryRare,
                Money.FromDollars(485000L), basePrestige: 86, expectedLifetimeKm: 90000,
                annualValueRate: -0.06, seatCount: 2, topSpeedKph: 340));

            // --- Hypercar ---------------------------------------------------------
            catalog.Add(new VehicleDefinition(
                NyxAscendant, "Nyx", "Ascendant",
                VehicleCategory.Hypercar, VehicleRarity.Exotic,
                Money.FromDollars(2400000L), basePrestige: 98, expectedLifetimeKm: 45000,
                annualValueRate: 0.01, seatCount: 2, topSpeedKph: 410));

            // --- Classic and collector: these appreciate ---------------------------
            catalog.Add(new VehicleDefinition(
                TessaroCoupe62, "Tessaro", "Coupé 62",
                VehicleCategory.Classic, VehicleRarity.Rare,
                Money.FromDollars(184000L), basePrestige: 68, expectedLifetimeKm: 70000,
                annualValueRate: 0.05, seatCount: 2, topSpeedKph: 195));

            catalog.Add(new VehicleDefinition(
                VeloceStradaGT, "Veloce", "Strada GT",
                VehicleCategory.RareCollector, VehicleRarity.Exotic,
                Money.FromDollars(1650000L), basePrestige: 94, expectedLifetimeKm: 40000,
                annualValueRate: 0.08, seatCount: 2, topSpeedKph: 290));

            return catalog;
        }
    }
}
