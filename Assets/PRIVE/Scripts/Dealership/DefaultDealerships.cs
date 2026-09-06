using System.Collections.Generic;
using Prive.Core;
using Prive.Vehicles;
using Prive.World;

namespace Prive.Dealership
{
    /// <summary>
    /// The dealerships trading in Vermillion Bay.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>This file is content, not system.</b> Nothing in <c>Prive.Dealership</c> knows these
    /// exist; it is handed definitions and works with whatever it is given. A second city ships
    /// as another file like this one, with different ids and locations, and no code changes.
    /// </para>
    /// <para>
    /// The tiers are placed to create a deliberate geography of trade. The budget lot in the
    /// industrial port undervalues anything exotic, and the collector house in the design
    /// quarter pays properly for it — so the profitable move is to buy where a car is
    /// misunderstood and sell where it is wanted. That loop is the Phase 2 game.
    /// </para>
    /// </remarks>
    public static class DefaultDealerships
    {
        public static readonly StableId PortAuto = StableId.Create("dealership", "vb_port_auto");
        public static readonly StableId MeridianMotors = StableId.Create("dealership", "vb_meridian_motors");
        public static readonly StableId AurelianBay = StableId.Create("dealership", "vb_aurelian_bay");
        public static readonly StableId ScuderiaVermillion = StableId.Create("dealership", "vb_scuderia");
        public static readonly StableId TheCarriageHouse = StableId.Create("dealership", "vb_carriage_house");

        public static IReadOnlyList<DealershipDefinition> Build()
        {
            List<DealershipDefinition> dealerships = new List<DealershipDefinition>();

            // Budget lot: cheap stock, poor prices, and no idea what a supercar is worth.
            dealerships.Add(new DealershipDefinition(
                PortAuto, "Port Auto", WorldLocations.VermillionBayDistricts.Industrial,
                DealershipTier.Budget,
                new List<VehicleCategory> { VehicleCategory.Economy },
                markup: 0.20, buyBackRate: 0.68,
                stockCapacity: 8, restockIntervalDays: 3));

            // Standard: the everyday middle of the market.
            dealerships.Add(new DealershipDefinition(
                MeridianMotors, "Meridian Motors", WorldLocations.VermillionBayDistricts.Suburbs,
                DealershipTier.Standard,
                new List<VehicleCategory> { VehicleCategory.Economy, VehicleCategory.Sports },
                markup: 0.16, buyBackRate: 0.74,
                stockCapacity: 8, restockIntervalDays: 4));

            // Luxury: saloons and SUVs, better spread, slower turnover.
            dealerships.Add(new DealershipDefinition(
                AurelianBay, "Aurelian of Vermillion Bay", WorldLocations.VermillionBayDistricts.LuxuryDistrict,
                DealershipTier.Luxury,
                new List<VehicleCategory> { VehicleCategory.Luxury, VehicleCategory.LuxurySuv, VehicleCategory.Limousine },
                markup: 0.13, buyBackRate: 0.80,
                stockCapacity: 6, restockIntervalDays: 6));

            // Exotic: where a supercar is actually understood.
            dealerships.Add(new DealershipDefinition(
                ScuderiaVermillion, "Scuderia Vermillion", WorldLocations.VermillionBayDistricts.LuxuryDistrict,
                DealershipTier.Exotic,
                new List<VehicleCategory> { VehicleCategory.Sports, VehicleCategory.Supercar, VehicleCategory.Hypercar },
                markup: 0.11, buyBackRate: 0.85,
                stockCapacity: 5, restockIntervalDays: 8));

            // Collector: rare stock, thin margins, patient money.
            dealerships.Add(new DealershipDefinition(
                TheCarriageHouse, "The Carriage House", WorldLocations.VermillionBayDistricts.MansionIsles,
                DealershipTier.Collector,
                new List<VehicleCategory> { VehicleCategory.Classic, VehicleCategory.RareCollector },
                markup: 0.09, buyBackRate: 0.88,
                stockCapacity: 4, restockIntervalDays: 12));

            return dealerships;
        }
    }
}
