using System;
using System.Collections.Generic;

namespace Prive.Core
{
    /// <summary>
    /// A small typed service container populated once at the composition root.
    /// </summary>
    /// <remarks>
    /// Deliberately not a DI framework and deliberately not a singleton grab-bag.
    /// Pure simulation classes take their dependencies as constructor arguments; the
    /// registry exists because MonoBehaviours cannot have constructors and need
    /// <em>somewhere</em> to resolve from during <c>Awake</c>.
    /// </remarks>
    public sealed class ServiceRegistry
    {
        private readonly Dictionary<Type, object> _services = new Dictionary<Type, object>();

        /// <summary>Registers <paramref name="service"/> under <typeparamref name="TService"/>.</summary>
        /// <exception cref="InvalidOperationException">If the contract is already registered.</exception>
        public void Register<TService>(TService service) where TService : class
        {
            if (service == null) throw new ArgumentNullException("service");

            Type contract = typeof(TService);
            if (_services.ContainsKey(contract))
            {
                throw new InvalidOperationException(
                    "Service '" + contract.Name + "' is already registered. " +
                    "Registering twice usually means two composition roots are running.");
            }

            _services[contract] = service;
        }

        /// <summary>Registers or overwrites. Intended for tests and editor tooling.</summary>
        public void Replace<TService>(TService service) where TService : class
        {
            if (service == null) throw new ArgumentNullException("service");
            _services[typeof(TService)] = service;
        }

        /// <summary>Resolves a required service, failing loudly when the wiring is wrong.</summary>
        public TService Resolve<TService>() where TService : class
        {
            object service;
            if (!_services.TryGetValue(typeof(TService), out service))
            {
                throw new InvalidOperationException(
                    "Service '" + typeof(TService).Name + "' was not registered. " +
                    "Check GameBootstrap's installation order.");
            }
            return (TService)service;
        }

        public bool TryResolve<TService>(out TService service) where TService : class
        {
            object found;
            if (_services.TryGetValue(typeof(TService), out found))
            {
                service = (TService)found;
                return true;
            }

            service = null;
            return false;
        }

        public bool IsRegistered<TService>() where TService : class
        {
            return _services.ContainsKey(typeof(TService));
        }

        public int Count { get { return _services.Count; } }

        public void Clear()
        {
            _services.Clear();
        }
    }
}
