using System;
using System.Collections.Generic;
using Prive.Core;
using Prive.Save;
using Prive.Vehicles;
using Prive.World;

namespace Prive.Dealership
{
    /// <summary>Published when the player buys from, or sells to, a dealership.</summary>
    public readonly struct DealershipTradeEvent
    {
        public readonly StableId DealershipId;
        public readonly VehicleId VehicleId;
        public readonly Money Amount;
        public readonly bool PlayerBought;

        public DealershipTradeEvent(StableId dealershipId, VehicleId vehicleId, Money amount, bool playerBought)
        {
            DealershipId = dealershipId;
            VehicleId = vehicleId;
            Amount = amount;
            PlayerBought = playerBought;
        }
    }

    /// <summary>
    /// Browsing, buying and selling across every dealership in the world.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Reusable anywhere: the service holds no knowledge of a particular city. Dealerships are
    /// content, keyed by <see cref="WorldLocationId"/>, so opening Dubai is a matter of adding
    /// definitions.
    /// </para>
    /// <para>
    /// It never moves money itself. Every transaction is delegated to
    /// <see cref="VehicleOwnershipService"/>, which is the only thing allowed to charge or pay
    /// the player. This class decides prices and manages stock; it does not own the wallet.
    /// </para>
    /// </remarks>
    public sealed class DealershipService : ISaveable
    {
        public const string SaveNodeKey = "dealerships";

        private readonly Dictionary<StableId, DealershipDefinition> _definitions =
            new Dictionary<StableId, DealershipDefinition>();

        private readonly Dictionary<StableId, DealershipInventory> _inventories =
            new Dictionary<StableId, DealershipInventory>();

        private readonly List<DealershipDefinition> _order = new List<DealershipDefinition>();
        private readonly List<string> _restoreProblems = new List<string>();

        private readonly VehicleOwnershipService _ownership;
        private readonly IVehicleCatalog _catalog;
        private readonly IVehicleValuationModel _valuation;
        private readonly IDealershipInventoryGenerator _generator;
        private readonly IGameClock _clock;
        private readonly IEventBus _bus;

        private DeterministicRandom _random;

        public DealershipService(VehicleOwnershipService ownership,
                                 IVehicleCatalog catalog,
                                 IVehicleValuationModel valuation,
                                 IDealershipInventoryGenerator generator,
                                 IGameClock clock,
                                 IEventBus bus,
                                 ulong seed = 20250101UL)
        {
            if (ownership == null) throw new ArgumentNullException("ownership");
            if (catalog == null) throw new ArgumentNullException("catalog");
            if (valuation == null) throw new ArgumentNullException("valuation");
            if (generator == null) throw new ArgumentNullException("generator");
            if (clock == null) throw new ArgumentNullException("clock");
            if (bus == null) throw new ArgumentNullException("bus");

            _ownership = ownership;
            _catalog = catalog;
            _valuation = valuation;
            _generator = generator;
            _clock = clock;
            _bus = bus;
            _random = new DeterministicRandom(seed);
        }

        public IReadOnlyList<DealershipDefinition> Dealerships { get { return _order; } }

        public IReadOnlyList<string> LastRestoreProblems { get { return _restoreProblems; } }

        public void Register(DealershipDefinition definition)
        {
            if (definition == null) throw new ArgumentNullException("definition");

            if (_definitions.ContainsKey(definition.Id))
            {
                throw new InvalidOperationException("Dealership '" + definition.Id + "' is already registered.");
            }

            _definitions.Add(definition.Id, definition);
            _inventories.Add(definition.Id, new DealershipInventory(definition.Id));
            _order.Add(definition);
        }

        /// <summary>Returns the dealership, or null when unknown.</summary>
        public DealershipDefinition Get(StableId dealershipId)
        {
            DealershipDefinition found;
            return _definitions.TryGetValue(dealershipId, out found) ? found : null;
        }

        /// <summary>Dealerships standing at <paramref name="location"/>.</summary>
        public IReadOnlyList<DealershipDefinition> At(WorldLocationId location)
        {
            List<DealershipDefinition> result = new List<DealershipDefinition>();
            for (int i = 0; i < _order.Count; i++)
            {
                if (_order[i].Location == location) result.Add(_order[i]);
            }
            return result;
        }

        /// <summary>The forecourt, or null when the dealership is unknown.</summary>
        public DealershipInventory GetInventory(StableId dealershipId)
        {
            DealershipInventory found;
            return _inventories.TryGetValue(dealershipId, out found) ? found : null;
        }

        /// <summary>Generates stock for every dealership that has none yet.</summary>
        public void StockAll()
        {
            for (int i = 0; i < _order.Count; i++)
            {
                DealershipInventory inventory = _inventories[_order[i].Id];
                if (inventory.Count == 0) Restock(_order[i].Id);
            }
        }

        /// <summary>Tops a dealership back up to capacity.</summary>
        public void Restock(StableId dealershipId)
        {
            DealershipDefinition definition = Get(dealershipId);
            if (definition == null) return;

            _generator.Restock(definition, _inventories[dealershipId], _clock.Now, ref _random);
        }

        /// <summary>
        /// Refreshes any dealership whose restock interval has elapsed. Called on the day tick.
        /// </summary>
        public void RestockDue()
        {
            long today = _clock.Now.DayIndex;

            for (int i = 0; i < _order.Count; i++)
            {
                DealershipDefinition definition = _order[i];
                DealershipInventory inventory = _inventories[definition.Id];

                if (today - inventory.LastRestockedDay < definition.RestockIntervalDays) continue;

                // Clearing first is what makes stock actually turn over rather than only ever
                // growing back to capacity with the same cars.
                inventory.Clear();
                _generator.Restock(definition, inventory, _clock.Now, ref _random);
            }
        }

        /// <summary>What the dealership would pay the player for one of their vehicles.</summary>
        public Money QuoteTradeIn(StableId dealershipId, VehicleId vehicleId)
        {
            DealershipDefinition definition = Get(dealershipId);
            if (definition == null) return Money.Zero;

            VehicleInstance instance = _ownership.GetOwned(vehicleId);
            if (instance == null) return Money.Zero;

            VehicleDefinition model = _catalog.Get(instance.DefinitionId);
            if (model == null) return Money.Zero;

            return definition.OfferPrice(_ownership.ValueOf(vehicleId), model.Category);
        }

        /// <summary>Buys a vehicle from a dealership's forecourt at its asking price.</summary>
        public VehicleTransactionResult Buy(StableId dealershipId, VehicleId stockVehicleId,
                                            WorldLocationId storeAt)
        {
            DealershipDefinition definition = Get(dealershipId);
            if (definition == null)
            {
                return VehicleTransactionResult.Failure(FailureReason.NotFound,
                    "No such dealership: '" + dealershipId + "'.");
            }

            DealershipInventory inventory = _inventories[dealershipId];
            DealershipStockItem item = inventory.Find(stockVehicleId);

            if (item == null)
            {
                return VehicleTransactionResult.Failure(FailureReason.NotFound,
                    "That vehicle is not on " + definition.DisplayName + "'s forecourt.");
            }

            // The ownership service performs every check and moves the money. Stock is only
            // released once it reports success, so a failed purchase cannot consume inventory.
            VehicleTransactionResult result = _ownership.Buy(
                item.Vehicle.DefinitionId,
                item.AskingPrice,
                storeAt,
                definition.DisplayName,
                item.Vehicle.Condition,
                item.Vehicle.OdometerKm);

            if (result.IsFailure) return result;

            inventory.Remove(stockVehicleId);
            _bus.Publish(new DealershipTradeEvent(dealershipId, result.VehicleId, item.AskingPrice, true));

            return result;
        }

        /// <summary>Sells one of the player's vehicles to a dealership at its offer price.</summary>
        public VehicleTransactionResult Sell(StableId dealershipId, VehicleId vehicleId)
        {
            DealershipDefinition definition = Get(dealershipId);
            if (definition == null)
            {
                return VehicleTransactionResult.Failure(FailureReason.NotFound,
                    "No such dealership: '" + dealershipId + "'.");
            }

            VehicleInstance instance = _ownership.GetOwned(vehicleId);
            if (instance == null)
            {
                return VehicleTransactionResult.Failure(FailureReason.NotOwned,
                    "The player does not own vehicle '" + vehicleId + "'.");
            }

            VehicleDefinition model = _catalog.Get(instance.DefinitionId);
            if (model == null)
            {
                return VehicleTransactionResult.Failure(FailureReason.NotFound,
                    "Unknown vehicle model '" + instance.DefinitionId + "'.");
            }

            Money offer = definition.OfferPrice(_ownership.ValueOf(vehicleId), model.Category);

            // Snapshot before the sale: the ownership service removes the instance.
            VehicleCondition condition = instance.Condition;
            int odometer = instance.OdometerKm;
            VehicleDefinitionId modelId = instance.DefinitionId;

            VehicleTransactionResult result = _ownership.Sell(vehicleId, offer, definition.DisplayName);
            if (result.IsFailure) return result;

            // The dealership now has it to sell on, provided there is room on the forecourt.
            DealershipInventory inventory = _inventories[dealershipId];
            if (inventory.Count < definition.StockCapacity)
            {
                VehicleInstance resale = new VehicleInstance(
                    vehicleId, modelId, offer, _clock.Now, definition.Location, condition, odometer);

                Money marketValue = _valuation.Value(
                    new VehicleValuationContext(model, resale, _clock.Now));

                inventory.Add(new DealershipStockItem(resale, definition.AskingPrice(marketValue)));
            }

            _bus.Publish(new DealershipTradeEvent(dealershipId, vehicleId, offer, false));
            return result;
        }

        // --- Persistence --------------------------------------------------------

        public string SaveKey { get { return SaveNodeKey; } }

        public SaveNode Capture()
        {
            SaveNode node = SaveNode.NewObject();
            node.Set("seed", (long)_random.State);

            SaveNode lots = SaveNode.NewObject();
            for (int i = 0; i < _order.Count; i++)
            {
                StableId id = _order[i].Id;
                lots.Set(id.Value, _inventories[id].Capture());
            }

            node.Set("lots", lots);
            return node;
        }

        public void Restore(SaveNode node)
        {
            _restoreProblems.Clear();
            if (node == null) return;

            _random.RestoreState((ulong)node.GetLong("seed"));

            SaveNode lots = node.GetNode("lots");
            if (lots == null || !lots.IsObject) return;

            for (int i = 0; i < _order.Count; i++)
            {
                StableId id = _order[i].Id;
                SaveNode lot = lots.GetNode(id.Value);

                if (lot == null)
                {
                    // A dealership added since the save was written: stock it fresh rather
                    // than leaving an empty forecourt.
                    _inventories[id].Clear();
                    Restock(id);
                    continue;
                }

                _inventories[id].Restore(lot, _restoreProblems);
            }
        }
    }
}
