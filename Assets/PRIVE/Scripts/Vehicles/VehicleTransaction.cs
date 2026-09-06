using Prive.Core;

namespace Prive.Vehicles
{
    /// <summary>What kind of ownership change was attempted.</summary>
    public enum VehicleTransactionKind
    {
        Purchase,
        Sale
    }

    /// <summary>
    /// A requested change of ownership, before it is attempted.
    /// </summary>
    /// <remarks>
    /// Separating the request from the act gives negotiation somewhere to live: Phase 2 builds
    /// a transaction at the asking price, while a later negotiation system will build the same
    /// transaction at an agreed price and nothing downstream changes.
    /// </remarks>
    public readonly struct VehicleTransaction
    {
        public readonly VehicleTransactionKind Kind;
        public readonly VehicleDefinitionId DefinitionId;

        /// <summary>The specific vehicle, for a sale. Not set for a purchase of new stock.</summary>
        public readonly VehicleId VehicleId;

        public readonly Money AgreedPrice;
        public readonly string Counterparty;

        private VehicleTransaction(VehicleTransactionKind kind, VehicleDefinitionId definitionId,
                                   VehicleId vehicleId, Money agreedPrice, string counterparty)
        {
            Kind = kind;
            DefinitionId = definitionId;
            VehicleId = vehicleId;
            AgreedPrice = agreedPrice;
            Counterparty = counterparty ?? string.Empty;
        }

        public static VehicleTransaction Purchase(VehicleDefinitionId definitionId, Money price, string counterparty)
        {
            return new VehicleTransaction(VehicleTransactionKind.Purchase, definitionId, VehicleId.None, price, counterparty);
        }

        public static VehicleTransaction Sale(VehicleId vehicleId, VehicleDefinitionId definitionId,
                                              Money price, string counterparty)
        {
            return new VehicleTransaction(VehicleTransactionKind.Sale, definitionId, vehicleId, price, counterparty);
        }

        public override string ToString()
        {
            return Kind + " " + DefinitionId.Id.Name + " @ " + AgreedPrice +
                   (string.IsNullOrEmpty(Counterparty) ? "" : " (" + Counterparty + ")");
        }
    }

    /// <summary>
    /// The outcome of a vehicle transaction.
    /// </summary>
    /// <remarks>
    /// Failure is a value, not an exception — being unable to afford a car, or a garage being
    /// full, are ordinary gameplay outcomes that UI has to render, not error conditions.
    /// </remarks>
    public readonly struct VehicleTransactionResult
    {
        public readonly bool IsSuccess;
        public readonly VehicleId VehicleId;
        public readonly Money Amount;
        public readonly FailureReason Reason;
        public readonly string Message;

        private VehicleTransactionResult(bool success, VehicleId vehicleId, Money amount,
                                         FailureReason reason, string message)
        {
            IsSuccess = success;
            VehicleId = vehicleId;
            Amount = amount;
            Reason = reason;
            Message = message;
        }

        public bool IsFailure { get { return !IsSuccess; } }

        public static VehicleTransactionResult Success(VehicleId vehicleId, Money amount)
        {
            return new VehicleTransactionResult(true, vehicleId, amount, FailureReason.None, null);
        }

        public static VehicleTransactionResult Failure(FailureReason reason, string message)
        {
            return new VehicleTransactionResult(false, VehicleId.None, Money.Zero, reason, message);
        }

        public override string ToString()
        {
            return IsSuccess
                ? "OK " + VehicleId + " for " + Amount
                : "Failed(" + Reason + "): " + Message;
        }
    }
}
