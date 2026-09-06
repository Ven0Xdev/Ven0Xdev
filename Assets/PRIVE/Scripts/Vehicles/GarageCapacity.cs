using Prive.World;

namespace Prive.Vehicles
{
    /// <summary>
    /// How many garage slots the player has at a given location.
    /// </summary>
    /// <remarks>
    /// An interface from day one because capacity is a <em>property</em> concern, not a vehicle
    /// one. Phase 4's property system will supply a real implementation that sums the garages
    /// of everything the player owns there; until then a flat allowance stands in, and no
    /// vehicle code has to change when it arrives.
    /// </remarks>
    public interface IGarageCapacityProvider
    {
        /// <summary>Total slots available at <paramref name="location"/>.</summary>
        int GetCapacity(WorldLocationId location);
    }

    /// <summary>
    /// A flat allowance everywhere — the starting apartment's parking space.
    /// </summary>
    public sealed class FlatGarageCapacity : IGarageCapacityProvider
    {
        /// <summary>What a new game starts with: enough to trade, not enough to hoard.</summary>
        public const int DefaultSlots = 4;

        private readonly int _slots;

        public FlatGarageCapacity(int slots = DefaultSlots)
        {
            _slots = slots < 0 ? 0 : slots;
        }

        public int GetCapacity(WorldLocationId location) { return _slots; }
    }
}
