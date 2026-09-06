using System;
using System.Collections.Generic;
using Prive.Core;

namespace Prive.Economy
{
    /// <summary>Net worth split by source, for the phone's wealth screen.</summary>
    public readonly struct NetWorthBreakdown
    {
        public readonly Money Liquid;
        public readonly Money Vehicles;
        public readonly Money Properties;
        public readonly Money Businesses;
        public readonly Money Investments;
        public readonly Money Collectibles;
        public readonly Money Liabilities;

        public NetWorthBreakdown(Money liquid, Money vehicles, Money properties, Money businesses,
                                 Money investments, Money collectibles, Money liabilities)
        {
            Liquid = liquid;
            Vehicles = vehicles;
            Properties = properties;
            Businesses = businesses;
            Investments = investments;
            Collectibles = collectibles;
            Liabilities = liabilities;
        }

        public Money TotalAssets
        {
            get { return Liquid + Vehicles + Properties + Businesses + Investments + Collectibles; }
        }

        public Money NetWorth { get { return TotalAssets - Liabilities; } }
    }

    /// <summary>
    /// The single source of truth for net worth.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <c>NetWorth = liquid + Σ assets − Σ liabilities</c>, and it is computed in exactly one
    /// place. Content systems contribute by registering an <see cref="IAssetValueProvider"/>
    /// or <see cref="ILiabilityProvider"/>; this class is never edited when a new asset type
    /// ships.
    /// </para>
    /// <para>
    /// The value is cached and only recomputed on demand, because valuing every vehicle,
    /// property and open market position is not something to do per frame on a phone.
    /// </para>
    /// </remarks>
    public sealed class NetWorthService
    {
        private readonly PlayerWallet _wallet;
        private readonly IEventBus _bus;
        private readonly List<IAssetValueProvider> _assetProviders = new List<IAssetValueProvider>();
        private readonly List<ILiabilityProvider> _liabilityProviders = new List<ILiabilityProvider>();

        private Money _cached;
        private bool _hasCached;

        public NetWorthService(PlayerWallet wallet, IEventBus bus)
        {
            if (wallet == null) throw new ArgumentNullException("wallet");
            if (bus == null) throw new ArgumentNullException("bus");

            _wallet = wallet;
            _bus = bus;
        }

        /// <summary>Last computed value. Call <see cref="Recalculate"/> to refresh.</summary>
        public Money Current { get { return _cached; } }

        public IDisposable RegisterAssetProvider(IAssetValueProvider provider)
        {
            if (provider == null) throw new ArgumentNullException("provider");
            _assetProviders.Add(provider);
            return new Unregister(() => _assetProviders.Remove(provider));
        }

        public IDisposable RegisterLiabilityProvider(ILiabilityProvider provider)
        {
            if (provider == null) throw new ArgumentNullException("provider");
            _liabilityProviders.Add(provider);
            return new Unregister(() => _liabilityProviders.Remove(provider));
        }

        /// <summary>
        /// Recomputes net worth and publishes <see cref="NetWorthChangedEvent"/> if it moved.
        /// </summary>
        public Money Recalculate()
        {
            Money previous = _cached;
            Money current = BuildBreakdown().NetWorth;

            _cached = current;

            if (!_hasCached || current != previous)
            {
                _hasCached = true;
                _bus.Publish(new NetWorthChangedEvent(previous, current));
            }

            return current;
        }

        /// <summary>Computes the full breakdown without touching the cache or publishing.</summary>
        public NetWorthBreakdown BuildBreakdown()
        {
            Money vehicles = Money.Zero;
            Money properties = Money.Zero;
            Money businesses = Money.Zero;
            Money investments = Money.Zero;
            Money collectibles = Money.Zero;

            for (int i = 0; i < _assetProviders.Count; i++)
            {
                IAssetValueProvider provider = _assetProviders[i];
                Money value = provider.GetTotalValue();

                switch (provider.Category)
                {
                    case AssetCategory.Vehicle: vehicles += value; break;
                    case AssetCategory.Property: properties += value; break;
                    case AssetCategory.Business: businesses += value; break;
                    case AssetCategory.Investment: investments += value; break;
                    case AssetCategory.Collectible: collectibles += value; break;
                }
            }

            Money liabilities = Money.Zero;
            for (int i = 0; i < _liabilityProviders.Count; i++)
            {
                liabilities += _liabilityProviders[i].GetOutstandingTotal();
            }

            return new NetWorthBreakdown(_wallet.Total, vehicles, properties, businesses,
                                         investments, collectibles, liabilities);
        }

        /// <summary>Every owned asset across all providers. For the asset list UI.</summary>
        public IReadOnlyList<AssetValuation> GetAllValuations()
        {
            List<AssetValuation> all = new List<AssetValuation>();

            for (int i = 0; i < _assetProviders.Count; i++)
            {
                IEnumerable<AssetValuation> valuations = _assetProviders[i].GetValuations();
                if (valuations == null) continue;

                foreach (AssetValuation valuation in valuations) all.Add(valuation);
            }

            return all;
        }

        /// <summary>Every outstanding liability across all providers.</summary>
        public IReadOnlyList<LiabilityRecord> GetAllLiabilities()
        {
            List<LiabilityRecord> all = new List<LiabilityRecord>();

            for (int i = 0; i < _liabilityProviders.Count; i++)
            {
                IEnumerable<LiabilityRecord> liabilities = _liabilityProviders[i].GetLiabilities();
                if (liabilities == null) continue;

                foreach (LiabilityRecord liability in liabilities) all.Add(liability);
            }

            return all;
        }

        private sealed class Unregister : IDisposable
        {
            private Action _action;

            public Unregister(Action action) { _action = action; }

            public void Dispose()
            {
                if (_action == null) return;
                _action();
                _action = null;
            }
        }
    }
}
