using System.Collections.Generic;
using Prive.Core;
using Prive.Economy;

namespace Prive.Vehicles
{
    /// <summary>
    /// Reports the player's vehicles to <see cref="NetWorthService"/>.
    /// </summary>
    /// <remarks>
    /// <para>
    /// This class is the entire net-worth integration. It implements the contract that already
    /// existed, registers itself, and <see cref="NetWorthService"/> never learns what a car is
    /// — no vehicle-shaped branch was added to it, and none was needed.
    /// </para>
    /// <para>
    /// <b>Every</b> owned vehicle counts here, garaged or not. Ownership is ownership; whether
    /// anyone can see the car is a separate question answered by
    /// <see cref="ActiveVehicleWealthSignal"/>.
    /// </para>
    /// </remarks>
    public sealed class VehicleAssetProvider : IAssetValueProvider
    {
        private readonly VehicleRepository _repository;
        private readonly IVehicleCatalog _catalog;
        private readonly IVehicleValuationModel _valuation;
        private readonly IGameClock _clock;

        public VehicleAssetProvider(VehicleRepository repository, IVehicleCatalog catalog,
                                    IVehicleValuationModel valuation, IGameClock clock)
        {
            _repository = repository;
            _catalog = catalog;
            _valuation = valuation;
            _clock = clock;
        }

        /// <summary>Local market multiplier applied to valuations. Set when the player relocates.</summary>
        public double MarketMultiplier { get; set; }

        public AssetCategory Category { get { return AssetCategory.Vehicle; } }

        public Money GetTotalValue()
        {
            Money total = Money.Zero;
            IReadOnlyList<VehicleInstance> owned = _repository.All;

            for (int i = 0; i < owned.Count; i++)
            {
                total += ValueOf(owned[i]);
            }

            return total;
        }

        public IEnumerable<AssetValuation> GetValuations()
        {
            IReadOnlyList<VehicleInstance> owned = _repository.All;
            List<AssetValuation> valuations = new List<AssetValuation>(owned.Count);

            for (int i = 0; i < owned.Count; i++)
            {
                VehicleInstance instance = owned[i];
                VehicleDefinition definition = _catalog.Get(instance.DefinitionId);
                string name = definition != null ? definition.DisplayName : instance.DefinitionId.Id.Name;

                valuations.Add(new AssetValuation(instance.Id.Id, AssetCategory.Vehicle, name, ValueOf(instance)));
            }

            return valuations;
        }

        private Money ValueOf(VehicleInstance instance)
        {
            VehicleDefinition definition = _catalog.Get(instance.DefinitionId);
            if (definition == null) return Money.Zero;

            double market = MarketMultiplier <= 0.0 ? 1.0 : MarketMultiplier;
            return _valuation.Value(new VehicleValuationContext(definition, instance, _clock.Now, market));
        }
    }
}
