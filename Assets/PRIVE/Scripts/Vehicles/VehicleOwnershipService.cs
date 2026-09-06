using System;
using Prive.Core;
using Prive.Economy;
using Prive.Social;
using Prive.World;

namespace Prive.Vehicles
{
    /// <summary>
    /// The only sanctioned way vehicles enter or leave the player's ownership.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Every purchase and sale moves money through <see cref="PlayerEconomy"/>. Nothing here —
    /// and nothing in the dealership or any future UI — touches a balance directly, so the
    /// ledger, the balance events and net worth can never disagree with the garage.
    /// </para>
    /// <para>
    /// <b>Ordering is the whole safety argument.</b> Every precondition is checked before any
    /// money moves, and the vehicle is added before the transaction is announced. If the add
    /// were to fail after payment the player would be charged for nothing, so that path
    /// refunds explicitly rather than trusting that it cannot happen.
    /// </para>
    /// </remarks>
    public sealed class VehicleOwnershipService
    {
        private readonly VehicleRepository _repository;
        private readonly IVehicleCatalog _catalog;
        private readonly IVehicleValuationModel _valuation;
        private readonly PlayerEconomy _economy;
        private readonly IGameClock _clock;
        private readonly IEventBus _bus;
        private readonly RuntimeIdFactory _idFactory;
        private readonly IGarageCapacityProvider _garage;

        private VehicleId _activeVehicle = VehicleId.None;

        public VehicleOwnershipService(VehicleRepository repository,
                                       IVehicleCatalog catalog,
                                       IVehicleValuationModel valuation,
                                       PlayerEconomy economy,
                                       IGameClock clock,
                                       IEventBus bus,
                                       RuntimeIdFactory idFactory,
                                       IGarageCapacityProvider garage = null)
        {
            if (repository == null) throw new ArgumentNullException("repository");
            if (catalog == null) throw new ArgumentNullException("catalog");
            if (valuation == null) throw new ArgumentNullException("valuation");
            if (economy == null) throw new ArgumentNullException("economy");
            if (clock == null) throw new ArgumentNullException("clock");
            if (bus == null) throw new ArgumentNullException("bus");
            if (idFactory == null) throw new ArgumentNullException("idFactory");

            _repository = repository;
            _catalog = catalog;
            _valuation = valuation;
            _economy = economy;
            _clock = clock;
            _bus = bus;
            _idFactory = idFactory;
            _garage = garage ?? new FlatGarageCapacity();
        }

        /// <summary>The vehicle the player is currently using, or <see cref="VehicleId.None"/>.</summary>
        public VehicleId ActiveVehicleId { get { return _activeVehicle; } }

        /// <summary>The active vehicle instance, or null when the player is on foot.</summary>
        public VehicleInstance ActiveVehicle
        {
            get { return _activeVehicle.IsValid ? _repository.Get(_activeVehicle) : null; }
        }

        /// <summary>Returns an owned vehicle, or null when the player does not own it.</summary>
        public VehicleInstance GetOwned(VehicleId id) { return _repository.Get(id); }

        /// <summary>Whether the player owns <paramref name="id"/>.</summary>
        public bool Owns(VehicleId id) { return _repository.Contains(id); }

        /// <summary>Current market value of one owned vehicle. Zero if not owned.</summary>
        public Money ValueOf(VehicleId id, double marketMultiplier = 1.0)
        {
            VehicleInstance instance = _repository.Get(id);
            if (instance == null) return Money.Zero;

            VehicleDefinition definition = _catalog.Get(instance.DefinitionId);
            if (definition == null) return Money.Zero;

            return _valuation.Value(new VehicleValuationContext(definition, instance, _clock.Now, marketMultiplier));
        }

        /// <summary>Slots still free at <paramref name="location"/>.</summary>
        public int FreeSlotsAt(WorldLocationId location)
        {
            return _garage.GetCapacity(location) - _repository.UsedSlotsAt(location);
        }

        /// <summary>
        /// Buys a vehicle of <paramref name="definitionId"/> at <paramref name="price"/>.
        /// </summary>
        /// <remarks>
        /// The caller decides the price — asking price today, negotiated price once negotiation
        /// exists. This method's job is to make the exchange safe, not to set the number.
        /// </remarks>
        public VehicleTransactionResult Buy(VehicleDefinitionId definitionId, Money price,
                                            WorldLocationId storeAt, string counterparty = "",
                                            VehicleCondition condition = default(VehicleCondition),
                                            int odometerKm = 0)
        {
            // --- validate everything before a single cent moves -------------------
            VehicleDefinition definition = _catalog.Get(definitionId);
            if (definition == null)
            {
                return VehicleTransactionResult.Failure(FailureReason.NotFound,
                    "No such vehicle model: '" + definitionId + "'.");
            }

            if (price.IsNegative)
            {
                return VehicleTransactionResult.Failure(FailureReason.InvalidArgument,
                    "A purchase price cannot be negative.");
            }

            if (odometerKm < 0)
            {
                return VehicleTransactionResult.Failure(FailureReason.InvalidArgument,
                    "Odometer reading cannot be negative.");
            }

            if (definition.GarageSlots > FreeSlotsAt(storeAt))
            {
                return VehicleTransactionResult.Failure(FailureReason.AtCapacity,
                    "No room at " + storeAt + " for a " + definition.DisplayName + ".");
            }

            if (!_economy.CanAfford(price))
            {
                return VehicleTransactionResult.Failure(FailureReason.InsufficientFunds,
                    "Needs " + price + " but only " + _economy.LiquidTotal + " is available.");
            }

            // --- commit -----------------------------------------------------------
            OperationResult payment = _economy.TryPay(
                price, TransactionCategory.VehiclePurchase,
                "Bought " + definition.DisplayName + (string.IsNullOrEmpty(counterparty) ? "" : " from " + counterparty));

            if (payment.IsFailure)
            {
                return VehicleTransactionResult.Failure(payment.Reason, payment.Message);
            }

            VehicleInstance instance = new VehicleInstance(
                VehicleId.Mint(_idFactory), definitionId, price, _clock.Now, storeAt,
                condition.Value <= 0.0 ? VehicleCondition.Pristine : condition,
                odometerKm);

            try
            {
                _repository.Add(instance);
            }
            catch (Exception e)
            {
                // Should be unreachable — the id was just minted and capacity was checked. If it
                // ever happens, the player must not be left paying for a vehicle they do not own.
                _economy.Receive(price, TransactionCategory.VehiclePurchase,
                    "Refund: " + definition.DisplayName + " could not be delivered");

                return VehicleTransactionResult.Failure(FailureReason.InvalidState,
                    "Could not take delivery, payment refunded: " + e.Message);
            }

            _bus.Publish(new VehicleAcquiredEvent(instance.Id, definitionId, price));
            return VehicleTransactionResult.Success(instance.Id, price);
        }

        /// <summary>Sells an owned vehicle for <paramref name="price"/>.</summary>
        public VehicleTransactionResult Sell(VehicleId vehicleId, Money price, string counterparty = "")
        {
            VehicleInstance instance = _repository.Get(vehicleId);
            if (instance == null)
            {
                return VehicleTransactionResult.Failure(FailureReason.NotOwned,
                    "The player does not own vehicle '" + vehicleId + "'.");
            }

            if (price.IsNegative)
            {
                return VehicleTransactionResult.Failure(FailureReason.InvalidArgument,
                    "A sale price cannot be negative.");
            }

            VehicleDefinition definition = _catalog.Get(instance.DefinitionId);
            string name = definition != null ? definition.DisplayName : instance.DefinitionId.Id.Name;

            bool wasActive = _activeVehicle == vehicleId;

            if (!_repository.Remove(vehicleId))
            {
                return VehicleTransactionResult.Failure(FailureReason.InvalidState,
                    "Vehicle '" + vehicleId + "' could not be released.");
            }

            // Clear the active slot before the money lands, so nothing can observe the player
            // driving a car they no longer own.
            if (wasActive) SetActiveVehicle(VehicleId.None);

            _economy.Receive(price, TransactionCategory.VehicleSale,
                "Sold " + name + (string.IsNullOrEmpty(counterparty) ? "" : " to " + counterparty));

            Money profit = price - instance.PurchasePrice;
            _bus.Publish(new VehicleSoldEvent(vehicleId, instance.DefinitionId, price, profit));

            return VehicleTransactionResult.Success(vehicleId, price);
        }

        /// <summary>
        /// Sets which vehicle the player is using. Pass <see cref="VehicleId.None"/> for on foot.
        /// </summary>
        /// <remarks>
        /// Publishes <see cref="VisibleLoadoutChangedEvent"/>, which is what makes the world
        /// re-read the player. Without it, swapping cars would change net worth but not how
        /// anyone treats them.
        /// </remarks>
        public OperationResult SetActiveVehicle(VehicleId vehicleId)
        {
            if (vehicleId == _activeVehicle) return OperationResult.Success();

            if (vehicleId.IsValid && !_repository.Contains(vehicleId))
            {
                return OperationResult.Failure(FailureReason.NotOwned,
                    "Cannot drive '" + vehicleId + "': the player does not own it.");
            }

            VehicleId previous = _activeVehicle;

            VehicleInstance previousInstance = previous.IsValid ? _repository.Get(previous) : null;
            if (previousInstance != null) previousInstance.SetStorageState(VehicleStorageState.Garaged);

            _activeVehicle = vehicleId;

            VehicleInstance current = vehicleId.IsValid ? _repository.Get(vehicleId) : null;
            if (current != null) current.SetStorageState(VehicleStorageState.Active);

            _bus.Publish(new ActiveVehicleChangedEvent(previous, vehicleId));
            _bus.Publish(new VisibleLoadoutChangedEvent(WealthSignalKind.Vehicle));

            return OperationResult.Success();
        }

        /// <summary>Restores the active vehicle after a load, without re-announcing a change.</summary>
        public void RestoreActiveVehicle(VehicleId vehicleId)
        {
            _activeVehicle = _repository.Contains(vehicleId) ? vehicleId : VehicleId.None;

            VehicleInstance current = _activeVehicle.IsValid ? _repository.Get(_activeVehicle) : null;
            if (current != null) current.SetStorageState(VehicleStorageState.Active);
        }
    }
}
