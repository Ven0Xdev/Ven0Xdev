using Prive.Core;

namespace Prive.Vehicles
{
    /// <summary>Published when a vehicle enters the player's ownership.</summary>
    public readonly struct VehicleAcquiredEvent
    {
        public readonly VehicleId VehicleId;
        public readonly VehicleDefinitionId DefinitionId;
        public readonly Money PricePaid;

        public VehicleAcquiredEvent(VehicleId vehicleId, VehicleDefinitionId definitionId, Money pricePaid)
        {
            VehicleId = vehicleId;
            DefinitionId = definitionId;
            PricePaid = pricePaid;
        }
    }

    /// <summary>Published when a vehicle leaves the player's ownership.</summary>
    public readonly struct VehicleSoldEvent
    {
        public readonly VehicleId VehicleId;
        public readonly VehicleDefinitionId DefinitionId;
        public readonly Money PriceReceived;

        /// <summary>Profit or loss against what the player originally paid.</summary>
        public readonly Money ProfitOrLoss;

        public VehicleSoldEvent(VehicleId vehicleId, VehicleDefinitionId definitionId,
                                Money priceReceived, Money profitOrLoss)
        {
            VehicleId = vehicleId;
            DefinitionId = definitionId;
            PriceReceived = priceReceived;
            ProfitOrLoss = profitOrLoss;
        }
    }

    /// <summary>
    /// Published when the vehicle the player is using changes — including to "none".
    /// </summary>
    /// <remarks>
    /// The ownership service also publishes <c>VisibleLoadoutChangedEvent</c> alongside this,
    /// which is what actually refreshes the world's perception. This event is for systems that
    /// care about the vehicle specifically, such as spawning it.
    /// </remarks>
    public readonly struct ActiveVehicleChangedEvent
    {
        public readonly VehicleId Previous;
        public readonly VehicleId Current;

        public ActiveVehicleChangedEvent(VehicleId previous, VehicleId current)
        {
            Previous = previous;
            Current = current;
        }
    }
}
