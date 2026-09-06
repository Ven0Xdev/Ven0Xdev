using System;
using Prive.Core;
using Prive.Save;
using Prive.World;

namespace Prive.Vehicles
{
    /// <summary>
    /// One specific vehicle the player owns, with its own history and state.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Deliberately a plain mutable C# object, not a <c>ScriptableObject</c>. A
    /// <c>ScriptableObject</c> per owned vehicle would mean an asset per runtime object, no
    /// clean way to persist per-instance state, and edits in play mode leaking into the
    /// project. Definitions are assets; instances are data.
    /// </para>
    /// <para>
    /// Fields for customisation, insurance and registration exist now and are persisted, but
    /// carry no behaviour yet — they are the hooks Phase 2's successors attach to. Nothing
    /// reads them, so nothing depends on their shape prematurely.
    /// </para>
    /// </remarks>
    public sealed class VehicleInstance
    {
        public VehicleInstance(VehicleId id, VehicleDefinitionId definitionId, Money purchasePrice,
                               GameTime purchasedAt, WorldLocationId storedAt,
                               VehicleCondition condition, int odometerKm = 0)
        {
            if (!id.IsValid) throw new ArgumentException("Vehicle instance id is required", "id");
            if (!definitionId.IsValid) throw new ArgumentException("Vehicle definition id is required", "definitionId");
            if (purchasePrice.IsNegative) throw new ArgumentException("Purchase price cannot be negative", "purchasePrice");
            if (odometerKm < 0) throw new ArgumentOutOfRangeException("odometerKm");

            Id = id;
            DefinitionId = definitionId;
            PurchasePrice = purchasePrice;
            PurchasedAt = purchasedAt;
            StoredAt = storedAt;
            Condition = condition;
            OdometerKm = odometerKm;
            StorageState = VehicleStorageState.Garaged;
            PlateNumber = string.Empty;
        }

        public VehicleId Id { get; private set; }
        public VehicleDefinitionId DefinitionId { get; private set; }

        /// <summary>What the player paid. Kept for profit-and-loss reporting, never for valuation.</summary>
        public Money PurchasePrice { get; private set; }

        public GameTime PurchasedAt { get; private set; }

        /// <summary>Where the vehicle physically is — the garage, district or city holding it.</summary>
        public WorldLocationId StoredAt { get; private set; }

        public VehicleCondition Condition { get; private set; }

        public int OdometerKm { get; private set; }

        /// <summary>Garaged, active, or consigned to a dealership.</summary>
        public VehicleStorageState StorageState { get; private set; }

        /// <summary>Registration plate. Cosmetic for now; the hook for registration rules later.</summary>
        public string PlateNumber { get; private set; }

        // --- Reserved for later phases, persisted from day one so saves stay compatible ---

        /// <summary>Customisation state. Phase 2 stores it; nothing writes it yet.</summary>
        public string CustomisationState { get; private set; }

        /// <summary>Insurance policy id, or empty when uninsured.</summary>
        public string InsurancePolicyId { get; private set; }

        public bool IsActive { get { return StorageState == VehicleStorageState.Active; } }

        public void SetStorageState(VehicleStorageState state) { StorageState = state; }

        public void MoveTo(WorldLocationId location) { StoredAt = location; }

        public void SetPlate(string plate) { PlateNumber = plate ?? string.Empty; }

        public void SetCustomisationState(string state) { CustomisationState = state; }

        public void SetInsurancePolicy(string policyId) { InsurancePolicyId = policyId; }

        /// <summary>Adds distance and the wear that comes with it.</summary>
        public void AddDistance(int kilometres, double wearPerKm)
        {
            if (kilometres <= 0) return;

            OdometerKm += kilometres;
            if (wearPerKm > 0.0) Condition = Condition.Worn(kilometres * wearPerKm);
        }

        public void SetCondition(VehicleCondition condition) { Condition = condition; }

        // --- Persistence --------------------------------------------------------

        public SaveNode Capture()
        {
            SaveNode node = SaveNode.NewObject();
            node.Set("id", Id.Id);
            node.Set("definition", DefinitionId.Id);
            node.Set("purchasePrice", PurchasePrice);
            node.Set("purchasedAt", PurchasedAt);
            node.Set("storedAt", StoredAt.Id);
            node.Set("condition", Condition.Value);
            node.Set("odometerKm", OdometerKm);
            node.Set("storageState", (int)StorageState);
            node.Set("plate", PlateNumber);
            node.Set("customisation", CustomisationState);
            node.Set("insurance", InsurancePolicyId);
            return node;
        }

        /// <summary>
        /// Rebuilds an instance from a save node, or returns null when the node is unusable —
        /// a missing id, or a model this build no longer ships.
        /// </summary>
        /// <remarks>
        /// Returning null rather than throwing is deliberate: one unreadable vehicle should
        /// cost the player that vehicle, not their entire garage. The caller reports it.
        /// </remarks>
        public static VehicleInstance TryRestore(SaveNode node, out string problem)
        {
            problem = null;
            if (node == null) { problem = "empty node"; return null; }

            VehicleId id;
            if (!VehicleId.TryParse(node.GetString("id"), out id))
            {
                problem = "missing or malformed vehicle id";
                return null;
            }

            VehicleDefinitionId definitionId;
            if (!VehicleDefinitionId.TryParse(node.GetString("definition"), out definitionId))
            {
                problem = "vehicle " + id + " has a missing or malformed definition id";
                return null;
            }

            WorldLocationId storedAt;
            WorldLocationId.TryParse(node.GetString("storedAt"), out storedAt);

            VehicleInstance instance = new VehicleInstance(
                id, definitionId,
                node.GetMoney("purchasePrice"),
                node.GetTime("purchasedAt"),
                storedAt,
                new VehicleCondition(node.GetDouble("condition", 1.0)),
                node.GetInt("odometerKm"));

            instance.StorageState = (VehicleStorageState)node.GetInt("storageState");
            instance.PlateNumber = node.GetString("plate", string.Empty);
            instance.CustomisationState = node.GetString("customisation");
            instance.InsurancePolicyId = node.GetString("insurance");

            return instance;
        }

        public override string ToString()
        {
            return Id + " [" + DefinitionId.Id.Name + "] " + Condition + ", " + OdometerKm + " km";
        }
    }
}
