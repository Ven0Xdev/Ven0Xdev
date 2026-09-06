using System;
using System.Collections.Generic;
using Prive.Core;
using Prive.Vehicles;

namespace Prive.Dealership
{
    /// <summary>Produces the stock a dealership offers.</summary>
    /// <remarks>
    /// An interface so that later phases can replace generation wholesale — rare-vehicle
    /// opportunities driven by the Game Director, consignment from other players' trade-ins,
    /// or auction stock — without touching <see cref="DealershipService"/>.
    /// </remarks>
    public interface IDealershipInventoryGenerator
    {
        /// <summary>
        /// Fills <paramref name="inventory"/> up to the definition's capacity.
        /// </summary>
        void Restock(DealershipDefinition definition, DealershipInventory inventory,
                     GameTime now, ref DeterministicRandom random);
    }

    /// <summary>
    /// Default stock generation: pick models the dealership handles, then vary each example's
    /// age, mileage and condition.
    /// </summary>
    /// <remarks>
    /// <para>
    /// The variation is the point. If every example were pristine, price would be a pure
    /// function of model and there would be no reason to look at the forecourt. Because
    /// condition and mileage move independently, some cars on the lot are genuinely better buys
    /// than others, and noticing that is the Phase 2 skill.
    /// </para>
    /// <para>
    /// Generation is seeded and deterministic, so a save reloaded shows the same forecourt.
    /// </para>
    /// </remarks>
    public sealed class DealershipInventoryGenerator : IDealershipInventoryGenerator
    {
        /// <summary>Chance a given stock item is brand new rather than pre-owned.</summary>
        public const double NewVehicleChance = 0.35;

        private readonly IVehicleCatalog _catalog;
        private readonly IVehicleValuationModel _valuation;
        private readonly RuntimeIdFactory _idFactory;

        public DealershipInventoryGenerator(IVehicleCatalog catalog, IVehicleValuationModel valuation,
                                            RuntimeIdFactory idFactory)
        {
            if (catalog == null) throw new ArgumentNullException("catalog");
            if (valuation == null) throw new ArgumentNullException("valuation");
            if (idFactory == null) throw new ArgumentNullException("idFactory");

            _catalog = catalog;
            _valuation = valuation;
            _idFactory = idFactory;
        }

        public void Restock(DealershipDefinition definition, DealershipInventory inventory,
                            GameTime now, ref DeterministicRandom random)
        {
            if (definition == null) throw new ArgumentNullException("definition");
            if (inventory == null) throw new ArgumentNullException("inventory");

            List<VehicleDefinition> candidates = Candidates(definition);
            if (candidates.Count == 0) return;

            while (inventory.Count < definition.StockCapacity)
            {
                VehicleDefinition model = candidates[random.NextInt(0, candidates.Count)];
                inventory.Add(BuildStockItem(definition, model, now, ref random));
            }

            inventory.LastRestockedDay = now.DayIndex;
        }

        private List<VehicleDefinition> Candidates(DealershipDefinition definition)
        {
            List<VehicleDefinition> candidates = new List<VehicleDefinition>();
            IReadOnlyList<VehicleDefinition> all = _catalog.Definitions;

            for (int i = 0; i < all.Count; i++)
            {
                if (definition.Handles(all[i].Category)) candidates.Add(all[i]);
            }

            return candidates;
        }

        private DealershipStockItem BuildStockItem(DealershipDefinition definition, VehicleDefinition model,
                                                   GameTime now, ref DeterministicRandom random)
        {
            bool isNew = random.NextChance(NewVehicleChance);

            int odometerKm;
            VehicleCondition condition;
            GameTime firstRegistered;

            if (isNew)
            {
                odometerKm = random.NextInt(0, 120);
                condition = VehicleCondition.Pristine;
                firstRegistered = now;
            }
            else
            {
                // Age is expressed as a fraction of the model's expected lifetime, so a used
                // hypercar has plausible mileage rather than a hatchback's.
                double used = random.NextDouble(0.05, 0.75);
                odometerKm = (int)(model.ExpectedLifetimeKm * used);

                // Condition correlates with use but is not determined by it — a cherished
                // high-mileage car beats a neglected low-mileage one, and that is where the
                // bargains hide.
                double baseline = 1.0 - (used * 0.55);
                condition = new VehicleCondition(baseline + random.NextDouble(-0.12, 0.12));

                int ageDays = (int)(used * 6.0 * 365.0);
                long registeredMinutes = Math.Max(0L, now.TotalMinutes - ((long)ageDays * GameTime.MinutesPerDay));
                firstRegistered = GameTime.FromMinutes(registeredMinutes);
            }

            VehicleInstance vehicle = new VehicleInstance(
                VehicleId.Mint(_idFactory), model.Id,
                purchasePrice: Money.Zero,
                purchasedAt: firstRegistered,
                storedAt: definition.Location,
                condition: condition,
                odometerKm: odometerKm);

            Money marketValue = _valuation.Value(new VehicleValuationContext(model, vehicle, now));

            return new DealershipStockItem(vehicle, definition.AskingPrice(marketValue));
        }
    }
}
