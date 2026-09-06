using System;
using System.Collections.Generic;
using Prive.Core;
using Prive.Save;
using Prive.World;

namespace Prive.Vehicles
{
    /// <summary>
    /// Every vehicle the player owns, and the only place they are stored.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Holds no rules about money — buying and selling live in
    /// <see cref="VehicleOwnershipService"/>. This class guarantees only that the collection
    /// stays coherent: unique ids, no duplicates, no dangling active vehicle, and capacity
    /// respected.
    /// </para>
    /// <para>
    /// Restores tolerantly. A vehicle whose model no longer ships is reported and skipped
    /// rather than throwing, so removing a car from the catalogue costs a player that car and
    /// not their whole garage.
    /// </para>
    /// </remarks>
    public sealed class VehicleRepository
    {
        private readonly Dictionary<VehicleId, VehicleInstance> _byId = new Dictionary<VehicleId, VehicleInstance>();
        private readonly List<VehicleInstance> _order = new List<VehicleInstance>();
        private readonly IVehicleCatalog _catalog;

        public VehicleRepository(IVehicleCatalog catalog)
        {
            if (catalog == null) throw new ArgumentNullException("catalog");
            _catalog = catalog;
        }

        /// <summary>Owned vehicles, in acquisition order.</summary>
        public IReadOnlyList<VehicleInstance> All { get { return _order; } }

        public int Count { get { return _order.Count; } }

        /// <summary>Problems encountered by the last <see cref="Restore"/>. Empty on a clean load.</summary>
        public IReadOnlyList<string> LastRestoreProblems { get { return _restoreProblems; } }

        private readonly List<string> _restoreProblems = new List<string>();

        public bool Contains(VehicleId id) { return _byId.ContainsKey(id); }

        /// <summary>Returns the vehicle, or null when the player does not own it.</summary>
        public VehicleInstance Get(VehicleId id)
        {
            VehicleInstance found;
            return _byId.TryGetValue(id, out found) ? found : null;
        }

        /// <summary>The definition behind an owned vehicle, or null if either is unknown.</summary>
        public VehicleDefinition GetDefinition(VehicleId id)
        {
            VehicleInstance instance = Get(id);
            return instance == null ? null : _catalog.Get(instance.DefinitionId);
        }

        /// <summary>
        /// Adds a vehicle. Rejects a duplicate id rather than overwriting, because a silent
        /// overwrite would destroy an owned vehicle and its history.
        /// </summary>
        public void Add(VehicleInstance instance)
        {
            if (instance == null) throw new ArgumentNullException("instance");

            if (_byId.ContainsKey(instance.Id))
            {
                throw new InvalidOperationException(
                    "Vehicle '" + instance.Id + "' is already owned. Ids must be minted, never reused.");
            }

            _byId.Add(instance.Id, instance);
            _order.Add(instance);
        }

        public bool Remove(VehicleId id)
        {
            VehicleInstance instance;
            if (!_byId.TryGetValue(id, out instance)) return false;

            _byId.Remove(id);
            _order.Remove(instance);
            return true;
        }

        /// <summary>Vehicles currently stored at <paramref name="location"/>.</summary>
        public IReadOnlyList<VehicleInstance> AtLocation(WorldLocationId location)
        {
            List<VehicleInstance> result = new List<VehicleInstance>();
            for (int i = 0; i < _order.Count; i++)
            {
                if (_order[i].StoredAt == location) result.Add(_order[i]);
            }
            return result;
        }

        /// <summary>
        /// Garage slots consumed at <paramref name="location"/>. Larger vehicles take more room,
        /// so this is not simply a count.
        /// </summary>
        public int UsedSlotsAt(WorldLocationId location)
        {
            int used = 0;
            for (int i = 0; i < _order.Count; i++)
            {
                VehicleInstance instance = _order[i];
                if (instance.StoredAt != location) continue;

                VehicleDefinition definition = _catalog.Get(instance.DefinitionId);
                used += definition != null ? definition.GarageSlots : 1;
            }
            return used;
        }

        public void Clear()
        {
            _byId.Clear();
            _order.Clear();
        }

        // --- Persistence --------------------------------------------------------
        // Not an ISaveable itself: VehicleModule owns the domain's single save node and
        // composes this with the active-vehicle selection.

        public SaveNode Capture()
        {
            SaveNode node = SaveNode.NewObject();
            SaveNode list = SaveNode.NewArray();

            for (int i = 0; i < _order.Count; i++) list.Add(_order[i].Capture());

            node.Set("owned", list);
            return node;
        }

        public void Restore(SaveNode node)
        {
            Clear();
            _restoreProblems.Clear();

            if (node == null) return;

            SaveNode list = node.GetNode("owned");
            if (list == null || !list.IsArray) return;

            for (int i = 0; i < list.Count; i++)
            {
                string problem;
                VehicleInstance instance = VehicleInstance.TryRestore(list[i], out problem);

                if (instance == null)
                {
                    _restoreProblems.Add(problem ?? "unreadable vehicle entry");
                    continue;
                }

                if (!_catalog.Contains(instance.DefinitionId))
                {
                    _restoreProblems.Add(
                        "vehicle " + instance.Id + " refers to model '" + instance.DefinitionId +
                        "', which this build does not ship");
                    continue;
                }

                if (_byId.ContainsKey(instance.Id))
                {
                    _restoreProblems.Add("duplicate vehicle id " + instance.Id + " in save; keeping the first");
                    continue;
                }

                _byId.Add(instance.Id, instance);
                _order.Add(instance);
            }
        }
    }
}
