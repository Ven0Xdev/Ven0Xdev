using UnityEngine;

namespace Prive.Unity
{
    /// <summary>
    /// Designer-facing startup settings for a session.
    /// </summary>
    /// <remarks>
    /// A <c>ScriptableObject</c> so pacing and debug options are tunable without touching
    /// code or entering play mode. Balance values that the simulation depends on live in
    /// <c>EconomyTuning</c>; this asset only covers how a session is started and driven.
    /// </remarks>
    [CreateAssetMenu(fileName = "GameStartupConfig", menuName = "PRIVE/Game Startup Config")]
    public sealed class GameStartupConfig : ScriptableObject
    {
        [Header("Save")]
        [Tooltip("Slot loaded at startup and written by autosave.")]
        [SerializeField] private string saveSlot = "slot0";

        [Tooltip("Start a fresh game every play session, ignoring any existing save. Editor convenience.")]
        [SerializeField] private bool alwaysStartNewGame;

        [Tooltip("Keep saves in memory only, so play testing never overwrites a real save.")]
        [SerializeField] private bool useInMemorySaves;

        [Header("Time")]
        [Tooltip("In-game minutes that pass per real second. 1 means a game day takes 24 real minutes.")]
        [SerializeField] private double minutesPerRealSecond = 1.0;

        [Tooltip("Real seconds between autosaves. Zero disables autosave.")]
        [SerializeField] private float autosaveIntervalSeconds = 120f;

        [Header("Player")]
        [SerializeField] private string playerDisplayName = "Player";

        public string SaveSlot { get { return string.IsNullOrEmpty(saveSlot) ? "slot0" : saveSlot; } }
        public bool AlwaysStartNewGame { get { return alwaysStartNewGame; } }
        public bool UseInMemorySaves { get { return useInMemorySaves; } }
        public double MinutesPerRealSecond { get { return minutesPerRealSecond; } }
        public float AutosaveIntervalSeconds { get { return autosaveIntervalSeconds; } }
        public string PlayerDisplayName { get { return playerDisplayName; } }
    }
}
