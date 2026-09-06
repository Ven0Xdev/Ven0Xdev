using System;

namespace Prive.Core
{
    /// <summary>
    /// Static access point to the installed <see cref="ServiceRegistry"/>.
    /// </summary>
    /// <remarks>
    /// <b>For the Unity layer only.</b> MonoBehaviours resolve here once in
    /// <c>Awake</c>/<c>Start</c> and cache what they need. Pure simulation code must take
    /// its dependencies through constructors — reaching for <see cref="Services"/> from a
    /// pure assembly makes that code untestable and is a review failure.
    /// </remarks>
    public static class GameContext
    {
        private static ServiceRegistry _services;

        /// <summary>True once <see cref="Install"/> has run.</summary>
        public static bool IsInstalled { get { return _services != null; } }

        public static ServiceRegistry Services
        {
            get
            {
                if (_services == null)
                {
                    throw new InvalidOperationException(
                        "GameContext is not installed. The Bootstrap scene must run GameBootstrap " +
                        "before any other scene resolves services.");
                }
                return _services;
            }
        }

        public static void Install(ServiceRegistry services)
        {
            if (services == null) throw new ArgumentNullException("services");
            _services = services;
        }

        /// <summary>Tears the context down — session end, returning to the main menu, and tests.</summary>
        public static void Uninstall()
        {
            _services = null;
        }
    }
}
