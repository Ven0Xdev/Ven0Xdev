using System;
using Prive.Core;

namespace Prive.Vehicles
{
    /// <summary>
    /// Identifies a vehicle <em>model</em> — authored content shared by every example of it.
    /// </summary>
    /// <remarks>
    /// Distinct from <see cref="VehicleId"/> so the compiler rejects passing "the Aurelian
    /// Meridian" where "the specific Meridian the player owns" is required. The two are
    /// constantly adjacent in this system and confusing them would be easy and expensive.
    /// </remarks>
    public readonly struct VehicleDefinitionId : IEquatable<VehicleDefinitionId>
    {
        public static readonly VehicleDefinitionId None = default(VehicleDefinitionId);

        private readonly StableId _id;

        private VehicleDefinitionId(StableId id) { _id = id; }

        public StableId Id { get { return _id; } }
        public bool IsValid { get { return _id.IsValid; } }
        public string Value { get { return _id.Value; } }

        /// <summary>Builds an id from a model name, e.g. <c>aurelian_meridian</c>.</summary>
        public static VehicleDefinitionId FromName(string name)
        {
            return new VehicleDefinitionId(StableId.Create(IdDomains.VehicleModel, name));
        }

        public static bool TryParse(string text, out VehicleDefinitionId result)
        {
            StableId id;
            if (StableId.TryParse(text, out id) && id.IsInDomain(IdDomains.VehicleModel))
            {
                result = new VehicleDefinitionId(id);
                return true;
            }

            result = None;
            return false;
        }

        public bool Equals(VehicleDefinitionId other) { return _id.Equals(other._id); }
        public override bool Equals(object obj) { return obj is VehicleDefinitionId && Equals((VehicleDefinitionId)obj); }
        public override int GetHashCode() { return _id.GetHashCode(); }
        public override string ToString() { return _id.ToString(); }

        public static bool operator ==(VehicleDefinitionId a, VehicleDefinitionId b) { return a.Equals(b); }
        public static bool operator !=(VehicleDefinitionId a, VehicleDefinitionId b) { return !a.Equals(b); }
    }

    /// <summary>
    /// Identifies one specific owned vehicle — this car, with its own mileage, condition and
    /// history.
    /// </summary>
    /// <remarks>
    /// Minted once by <see cref="RuntimeIdFactory"/> and persisted. Everything that refers to a
    /// vehicle — garages, dealership consignments, insurance, saves — refers to it by this id,
    /// never by object reference, so nothing breaks when the instance is rebuilt on load.
    /// </remarks>
    public readonly struct VehicleId : IEquatable<VehicleId>
    {
        /// <summary>The <see cref="RuntimeIdFactory"/> kind used for vehicles.</summary>
        public const string InstanceKind = "vehicle";

        public static readonly VehicleId None = default(VehicleId);

        private readonly StableId _id;

        private VehicleId(StableId id) { _id = id; }

        public StableId Id { get { return _id; } }
        public bool IsValid { get { return _id.IsValid; } }
        public string Value { get { return _id.Value; } }

        /// <summary>Mints a new unique vehicle id.</summary>
        public static VehicleId Mint(RuntimeIdFactory factory)
        {
            if (factory == null) throw new ArgumentNullException("factory");
            return new VehicleId(factory.Next(InstanceKind));
        }

        /// <summary>Wraps an id read back from a save.</summary>
        public static bool TryParse(string text, out VehicleId result)
        {
            StableId id;
            if (StableId.TryParse(text, out id) && id.IsInDomain(IdDomains.Instance))
            {
                result = new VehicleId(id);
                return true;
            }

            result = None;
            return false;
        }

        public bool Equals(VehicleId other) { return _id.Equals(other._id); }
        public override bool Equals(object obj) { return obj is VehicleId && Equals((VehicleId)obj); }
        public override int GetHashCode() { return _id.GetHashCode(); }
        public override string ToString() { return _id.ToString(); }

        public static bool operator ==(VehicleId a, VehicleId b) { return a.Equals(b); }
        public static bool operator !=(VehicleId a, VehicleId b) { return !a.Equals(b); }
    }
}
