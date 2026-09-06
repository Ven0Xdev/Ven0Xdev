using System;
using System.Collections.Generic;
using Prive.Core;
using Prive.Economy;
using Prive.Save;
using Prive.Social;

namespace Prive.Vehicles
{
    /// <summary>
    /// The vehicles domain as one installable unit: catalogue, garage, ownership, valuation,
    /// and its integrations with net worth and observed wealth.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Bootstrap constructs this and calls <see cref="Install"/>. That single call is the whole
    /// integration — it registers an asset provider and a wealth signal with services that
    /// already existed, and registers one save node. No Phase 1 class is modified.
    /// </para>
    /// <para>
    /// Owning the domain's persistence here rather than in <see cref="VehicleRepository"/> keeps
    /// the garage contents and the active-vehicle selection in one node, so they cannot be
    /// restored out of step with each other.
    /// </para>
    /// </remarks>
    public sealed class VehicleModule : ISaveable, IDisposable
    {
        public const string SaveNodeKey = "vehicles";

        private readonly List<IDisposable> _registrations = new List<IDisposable>();

        public VehicleModule(IVehicleCatalog catalog,
                             PlayerEconomy economy,
                             IGameClock clock,
                             IEventBus bus,
                             RuntimeIdFactory idFactory,
                             IGarageCapacityProvider garage = null,
                             IVehicleValuationModel valuation = null)
        {
            if (catalog == null) throw new ArgumentNullException("catalog");
            if (economy == null) throw new ArgumentNullException("economy");
            if (clock == null) throw new ArgumentNullException("clock");
            if (bus == null) throw new ArgumentNullException("bus");
            if (idFactory == null) throw new ArgumentNullException("idFactory");

            Catalog = catalog;
            Valuation = valuation ?? new VehicleValuationModel();

            Repository = new VehicleRepository(catalog);

            Ownership = new VehicleOwnershipService(
                Repository, catalog, Valuation, economy, clock, bus, idFactory, garage);

            AssetProvider = new VehicleAssetProvider(Repository, catalog, Valuation, clock);
            WealthSignal = new ActiveVehicleWealthSignal(Ownership, catalog);
        }

        public IVehicleCatalog Catalog { get; private set; }
        public IVehicleValuationModel Valuation { get; private set; }
        public VehicleRepository Repository { get; private set; }
        public VehicleOwnershipService Ownership { get; private set; }
        public VehicleAssetProvider AssetProvider { get; private set; }
        public ActiveVehicleWealthSignal WealthSignal { get; private set; }

        /// <summary>
        /// Plugs the domain into the Phase 1 registries and the save system.
        /// </summary>
        public void Install(NetWorthService netWorth, ObservedWealthCalculator observedWealth, SaveManager saves)
        {
            if (netWorth == null) throw new ArgumentNullException("netWorth");
            if (observedWealth == null) throw new ArgumentNullException("observedWealth");

            _registrations.Add(netWorth.RegisterAssetProvider(AssetProvider));
            _registrations.Add(observedWealth.RegisterSignal(WealthSignal));

            if (saves != null) saves.Register(this);
        }

        // --- Persistence --------------------------------------------------------

        public string SaveKey { get { return SaveNodeKey; } }

        public SaveNode Capture()
        {
            SaveNode node = Repository.Capture();
            node.Set("active", Ownership.ActiveVehicleId.Id);
            return node;
        }

        public void Restore(SaveNode node)
        {
            if (node == null) return;

            Repository.Restore(node);

            VehicleId active;
            VehicleId.TryParse(node.GetString("active"), out active);

            // Restores without publishing a change event: loading a save is not the player
            // getting into a different car.
            Ownership.RestoreActiveVehicle(active);
        }

        public void Dispose()
        {
            for (int i = 0; i < _registrations.Count; i++) _registrations[i].Dispose();
            _registrations.Clear();
        }
    }
}
