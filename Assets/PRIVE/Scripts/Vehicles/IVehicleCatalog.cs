using System;
using System.Collections.Generic;

namespace Prive.Vehicles
{
    /// <summary>Read-only lookup for every vehicle model in the game.</summary>
    public interface IVehicleCatalog
    {
        IReadOnlyList<VehicleDefinition> Definitions { get; }

        /// <summary>Returns the definition, or null when unknown.</summary>
        VehicleDefinition Get(VehicleDefinitionId id);

        bool Contains(VehicleDefinitionId id);

        /// <summary>Definitions in <paramref name="category"/>, in authored order.</summary>
        IReadOnlyList<VehicleDefinition> InCategory(VehicleCategory category);
    }

    /// <summary>In-memory <see cref="IVehicleCatalog"/>, populated once at bootstrap.</summary>
    public sealed class VehicleCatalog : IVehicleCatalog
    {
        private readonly Dictionary<VehicleDefinitionId, VehicleDefinition> _byId =
            new Dictionary<VehicleDefinitionId, VehicleDefinition>();

        private readonly List<VehicleDefinition> _order = new List<VehicleDefinition>();

        public IReadOnlyList<VehicleDefinition> Definitions { get { return _order; } }

        public void Add(VehicleDefinition definition)
        {
            if (definition == null) throw new ArgumentNullException("definition");

            if (_byId.ContainsKey(definition.Id))
            {
                throw new InvalidOperationException("Vehicle definition '" + definition.Id + "' is already registered.");
            }

            _byId.Add(definition.Id, definition);
            _order.Add(definition);
        }

        public VehicleDefinition Get(VehicleDefinitionId id)
        {
            VehicleDefinition found;
            return _byId.TryGetValue(id, out found) ? found : null;
        }

        public bool Contains(VehicleDefinitionId id) { return _byId.ContainsKey(id); }

        public IReadOnlyList<VehicleDefinition> InCategory(VehicleCategory category)
        {
            List<VehicleDefinition> result = new List<VehicleDefinition>();
            for (int i = 0; i < _order.Count; i++)
            {
                if (_order[i].Category == category) result.Add(_order[i]);
            }
            return result;
        }

        /// <summary>Definitions whose category appears in <paramref name="categories"/>.</summary>
        public IReadOnlyList<VehicleDefinition> InCategories(IReadOnlyList<VehicleCategory> categories)
        {
            List<VehicleDefinition> result = new List<VehicleDefinition>();
            if (categories == null || categories.Count == 0) return result;

            for (int i = 0; i < _order.Count; i++)
            {
                for (int c = 0; c < categories.Count; c++)
                {
                    if (_order[i].Category == categories[c])
                    {
                        result.Add(_order[i]);
                        break;
                    }
                }
            }
            return result;
        }
    }
}
