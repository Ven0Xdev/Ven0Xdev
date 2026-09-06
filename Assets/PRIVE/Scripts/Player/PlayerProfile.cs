using System;
using Prive.Core;
using Prive.Economy;
using Prive.Save;
using Prive.Social;
using Prive.World;

namespace Prive.Player
{
    /// <summary>
    /// The player: who they are, where they are, what they have and how the world sees them.
    /// </summary>
    /// <remarks>
    /// <para>
    /// The aggregate root of a session. It owns no rules of its own — money rules live in
    /// <see cref="PlayerEconomy"/>, standing rules in <see cref="SocialStatus"/> — it binds
    /// them together and gives every other system one thing to depend on.
    /// </para>
    /// <para>
    /// Note that net worth and observed wealth are reached through different objects and are
    /// never reconciled. That separation is deliberate and load-bearing.
    /// </para>
    /// </remarks>
    public sealed class PlayerProfile : ISaveable
    {
        public const string SaveNodeKey = "player";
        public const string DefaultDisplayName = "Player";

        private readonly IEventBus _bus;
        private WorldLocationId _currentLocation;

        public PlayerProfile(IEventBus bus,
                             PlayerEconomy economy,
                             SocialStatus status,
                             RuntimeIdFactory idFactory,
                             WorldLocationId startLocation,
                             string displayName = DefaultDisplayName)
        {
            if (bus == null) throw new ArgumentNullException("bus");
            if (economy == null) throw new ArgumentNullException("economy");
            if (status == null) throw new ArgumentNullException("status");
            if (idFactory == null) throw new ArgumentNullException("idFactory");

            _bus = bus;
            Economy = economy;
            Status = status;
            IdFactory = idFactory;
            _currentLocation = startLocation;
            DisplayName = string.IsNullOrEmpty(displayName) ? DefaultDisplayName : displayName;
        }

        public string DisplayName { get; private set; }

        public PlayerEconomy Economy { get; private set; }

        public SocialStatus Status { get; private set; }

        /// <summary>
        /// Mints ids for things the player comes to own. Lives on the profile because its
        /// counter must be saved and restored with the player's assets, or a reloaded session
        /// would re-issue ids that already exist.
        /// </summary>
        public RuntimeIdFactory IdFactory { get; private set; }

        /// <summary>
        /// Where the player is, as a location id rather than a transform. The simulation runs
        /// identically whether that district is loaded, unloaded or on another continent.
        /// </summary>
        public WorldLocationId CurrentLocation { get { return _currentLocation; } }

        public void SetDisplayName(string displayName)
        {
            DisplayName = string.IsNullOrEmpty(displayName) ? DefaultDisplayName : displayName;
        }

        /// <summary>Moves the player and publishes <see cref="PlayerLocationChangedEvent"/>.</summary>
        public void MoveTo(WorldLocationId location)
        {
            if (location == _currentLocation) return;

            WorldLocationId previous = _currentLocation;
            _currentLocation = location;
            _bus.Publish(new PlayerLocationChangedEvent(previous, location));
        }

        // --- Persistence --------------------------------------------------------

        public string SaveKey { get { return SaveNodeKey; } }

        public SaveNode Capture()
        {
            SaveNode node = SaveNode.NewObject();
            node.Set("displayName", DisplayName);
            node.Set("location", _currentLocation.Id);
            node.Set("idCounter", IdFactory.Counter);
            return node;
        }

        public void Restore(SaveNode node)
        {
            if (node == null) return;

            DisplayName = node.GetString("displayName", DefaultDisplayName);
            IdFactory.RestoreCounter(node.GetLong("idCounter"));

            WorldLocationId restored;
            if (WorldLocationId.TryParse(node.GetString("location"), out restored))
            {
                MoveTo(restored);
            }
        }

        public override string ToString()
        {
            return DisplayName + " @ " + _currentLocation + " — " + Economy.LiquidTotal + ", " + Status;
        }
    }
}
