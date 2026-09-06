using UnityEngine;
using Prive.Core;
using Prive.Economy;
using Prive.Player;
using Prive.Save;
using Prive.Social;
using Prive.Travel;
using Prive.World;

namespace Prive.Unity
{
    /// <summary>
    /// The composition root. The one place in PRIVÉ where concrete types are wired together.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Lives on a single object in the Bootstrap scene and survives every scene load. Nothing
    /// else constructs a service; everything else resolves what it needs from
    /// <see cref="GameContext"/> once, in <c>Awake</c>, and caches it.
    /// </para>
    /// <para>
    /// Registration order matters and is deliberate: the clock's ordered tickables run in the
    /// sequence they are registered here, so recurring cashflow is applied before status decay
    /// on the same day boundary.
    /// </para>
    /// </remarks>
    [DefaultExecutionOrder(-1000)]
    public sealed class GameBootstrap : MonoBehaviour
    {
        private const string ClockSaveKey = "clock";

        [SerializeField] private GameStartupConfig config;

        private ServiceRegistry _registry;
        private EventBus _bus;
        private GameClock _clock;
        private SaveManager _saves;
        private PlayerProfile _player;
        private PlayerTravelState _travelState;
        private SocialPresenceService _presence;

        private float _autosaveTimer;
        private bool _installed;

        /// <summary>Raised once everything is wired and the session state is loaded.</summary>
        public bool IsReady { get { return _installed; } }

        private void Awake()
        {
            if (GameContext.IsInstalled)
            {
                // A second Bootstrap scene load would otherwise install a rival service graph.
                Destroy(gameObject);
                return;
            }

            DontDestroyOnLoad(gameObject);
            Install();
        }

        private void Install()
        {
            _registry = new ServiceRegistry();

            _bus = new EventBus(new UnityLogErrorSink());
            _clock = new GameClock(_bus);
            _clock.MinutesPerRealSecond = config != null
                ? config.MinutesPerRealSecond
                : GameClock.DefaultMinutesPerRealSecond;

            WorldLocationCatalog world = DefaultWorldContent.Build();
            ReportWorldContentProblems(world);

            PlayerEconomy economy = new PlayerEconomy(_bus, _clock);
            SocialStatus status = new SocialStatus(_bus);

            _player = new PlayerProfile(_bus, economy, status, new RuntimeIdFactory(),
                WorldLocations.DefaultStartLocation,
                config != null ? config.PlayerDisplayName : PlayerProfile.DefaultDisplayName);

            ObservedWealthCalculator observedWealth = new ObservedWealthCalculator(_bus);
            observedWealth.RegisterSignal(new FameWealthSignal());

            _presence = new SocialPresenceService(status, observedWealth, world, _clock, _bus);

            TravelService travel = new TravelService(world, _player, _clock, _bus);
            _travelState = new PlayerTravelState(_bus, WorldLocations.VermillionBay);

            RecurringCashflow cashflow = new RecurringCashflow(economy);
            InstallBaselineCashflows(cashflow);

            // Ordered ticks: money moves first, then standing reacts to the day that passed.
            _clock.Register(cashflow);
            _clock.Register(new SocialStatusDecay(status));

            _saves = BuildSaveManager();
            _saves.Register(_player);
            _saves.Register(economy);
            _saves.Register(status);
            _saves.Register(_travelState);
            _saves.Register(new DelegateSaveable(ClockSaveKey, CaptureClock, RestoreClock));

            _registry.Register<IEventBus>(_bus);
            _registry.Register<IGameClock>(_clock);
            _registry.Register<IWorldLocationCatalog>(world);
            _registry.Register(_player);
            _registry.Register(economy);
            _registry.Register(status);
            _registry.Register(observedWealth);
            _registry.Register(_presence);
            _registry.Register<ITravelService>(travel);
            _registry.Register(_travelState);
            _registry.Register(cashflow);
            _registry.Register(_saves);

            GameContext.Install(_registry);
            _installed = true;

            LoadOrStartNewGame();

            _bus.Publish(new PlayerProfileReadyEvent(_player));
            _presence.Evaluate(_player.CurrentLocation);
        }

        private SaveManager BuildSaveManager()
        {
            ISaveStorage storage = (config != null && config.UseInMemorySaves)
                ? (ISaveStorage)new InMemorySaveStorage()
                : new FileSaveStorage();

            // Migrations are registered here as the save format evolves:
            //   migrator.Register(new SaveMigration_1_to_2());
            SaveMigrator migrator = new SaveMigrator();

            return new SaveManager(new JsonSaveSerializer(pretty: Debug.isDebugBuild),
                                   storage, migrator, Application.version);
        }

        private void LoadOrStartNewGame()
        {
            string slot = config != null ? config.SaveSlot : SaveManager.DefaultSlot;

            if (config != null && config.AlwaysStartNewGame)
            {
                Debug.Log("[PRIVE] Starting a new game (AlwaysStartNewGame is set).");
                return;
            }

            LoadOutcome outcome = _saves.Load(slot);

            if (outcome.Success)
            {
                Debug.Log("[PRIVE] Loaded '" + slot + "'. " + outcome.Report);
                return;
            }

            if (outcome.IsMissing)
            {
                Debug.Log("[PRIVE] No save in '" + slot + "'; starting a new game.");
                return;
            }

            // A corrupt save must never be silently overwritten by the next autosave.
            Debug.LogError("[PRIVE] Save '" + slot + "' could not be read: " + outcome.Error +
                           ". Starting a new game; the existing file has been left untouched.");
        }

        private void InstallBaselineCashflows(RecurringCashflow cashflow)
        {
            cashflow.Add(new CashflowEntry(
                StableId.Create("cashflow", "living_costs"),
                "Living costs",
                Money.Zero - EconomyTuning.DefaultDailyLivingCost,
                CashflowCadence.Daily,
                TransactionCategory.Lifestyle));
        }

        private static void ReportWorldContentProblems(WorldLocationCatalog world)
        {
            var problems = world.Validate();
            for (int i = 0; i < problems.Count; i++)
            {
                Debug.LogError("[PRIVE] World content: " + problems[i]);
            }
        }

        private SaveNode CaptureClock()
        {
            SaveNode node = SaveNode.NewObject();
            node.Set("time", _clock.Now);
            return node;
        }

        private void RestoreClock(SaveNode node)
        {
            _clock.RestoreTime(node.GetTime("time"));
        }

        private void Update()
        {
            if (!_installed) return;

            // The single Update() that drives the simulation. Everything else ticks.
            _clock.Tick(Time.unscaledDeltaTime);
            TickAutosave(Time.unscaledDeltaTime);
        }

        private void TickAutosave(float deltaSeconds)
        {
            float interval = config != null ? config.AutosaveIntervalSeconds : 0f;
            if (interval <= 0f) return;

            _autosaveTimer += deltaSeconds;
            if (_autosaveTimer < interval) return;

            _autosaveTimer = 0f;
            SaveNow();
        }

        /// <summary>Writes the current session to the configured slot.</summary>
        public void SaveNow()
        {
            if (!_installed) return;

            _saves.Save(config != null ? config.SaveSlot : SaveManager.DefaultSlot);
        }

        private void OnApplicationPause(bool paused)
        {
            // On mobile this is the reliable "the player is leaving" signal; OnApplicationQuit
            // is not guaranteed to run on iOS or Android.
            if (paused) SaveNow();
        }

        private void OnApplicationQuit()
        {
            SaveNow();
        }

        private void OnDestroy()
        {
            if (!_installed) return;

            if (_travelState != null) _travelState.Dispose();
            if (_bus != null) _bus.Clear();

            GameContext.Uninstall();
            _installed = false;
        }
    }
}
