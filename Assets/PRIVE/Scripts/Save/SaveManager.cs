using System;
using System.Collections.Generic;

namespace Prive.Save
{
    /// <summary>
    /// Orchestrates capture → serialize → store and the reverse.
    /// </summary>
    /// <remarks>
    /// The manager knows nothing about what any system stores. It collects nodes from
    /// registered <see cref="ISaveable"/>s, hands the document to an injected serializer and
    /// storage, and on load runs migrations before restoring. That is the whole
    /// responsibility — which is why it stays small as the game grows.
    /// </remarks>
    public sealed class SaveManager
    {
        public const string DefaultSlot = "slot0";

        private readonly ISaveSerializer _serializer;
        private readonly ISaveStorage _storage;
        private readonly SaveMigrator _migrator;
        private readonly List<ISaveable> _saveables = new List<ISaveable>();
        private readonly string _buildId;

        /// <summary>
        /// Nodes read from disk that no registered system claimed. Written back untouched on
        /// the next save so data from another build survives a round-trip.
        /// </summary>
        private readonly Dictionary<string, SaveNode> _preservedNodes = new Dictionary<string, SaveNode>(StringComparer.Ordinal);

        public SaveManager(ISaveSerializer serializer, ISaveStorage storage, SaveMigrator migrator = null, string buildId = null)
        {
            if (serializer == null) throw new ArgumentNullException("serializer");
            if (storage == null) throw new ArgumentNullException("storage");

            _serializer = serializer;
            _storage = storage;
            _migrator = migrator ?? new SaveMigrator();
            _buildId = buildId ?? string.Empty;
        }

        public int RegisteredCount { get { return _saveables.Count; } }

        /// <summary>Registers a system for persistence. Duplicate save keys are rejected.</summary>
        public void Register(ISaveable saveable)
        {
            if (saveable == null) throw new ArgumentNullException("saveable");
            if (string.IsNullOrEmpty(saveable.SaveKey)) throw new ArgumentException("ISaveable.SaveKey is required.", "saveable");

            for (int i = 0; i < _saveables.Count; i++)
            {
                if (string.Equals(_saveables[i].SaveKey, saveable.SaveKey, StringComparison.Ordinal))
                {
                    throw new InvalidOperationException(
                        "Save key '" + saveable.SaveKey + "' is already registered by " +
                        _saveables[i].GetType().Name + ".");
                }
            }

            _saveables.Add(saveable);
        }

        public void Unregister(ISaveable saveable)
        {
            _saveables.Remove(saveable);
        }

        /// <summary>Builds the in-memory document for the current game state.</summary>
        public SaveGame Capture()
        {
            SaveGame save = new SaveGame(SaveVersion.Current, _buildId);
            save.SavedAtUtcTicks = DateTime.UtcNow.Ticks;

            foreach (KeyValuePair<string, SaveNode> preserved in _preservedNodes)
            {
                save.SetNode(preserved.Key, preserved.Value);
            }

            for (int i = 0; i < _saveables.Count; i++)
            {
                ISaveable saveable = _saveables[i];
                save.SetNode(saveable.SaveKey, saveable.Capture() ?? SaveNode.NewObject());
            }

            return save;
        }

        /// <summary>Applies a document to the live game state.</summary>
        public SaveLoadReport Apply(SaveGame save)
        {
            if (save == null) throw new ArgumentNullException("save");

            SaveLoadReport report = new SaveLoadReport();
            _migrator.Migrate(save, report);

            HashSet<string> claimed = new HashSet<string>(StringComparer.Ordinal);

            for (int i = 0; i < _saveables.Count; i++)
            {
                ISaveable saveable = _saveables[i];
                claimed.Add(saveable.SaveKey);

                SaveNode node = save.GetNode(saveable.SaveKey);
                if (node == null)
                {
                    // A system newer than this save. Leaving it at its defaults is correct.
                    continue;
                }

                try
                {
                    saveable.Restore(node);
                }
                catch (Exception e)
                {
                    // One system failing to restore must not cost the player the rest of
                    // their save.
                    report.AddError("Failed to restore '" + saveable.SaveKey + "': " + e.Message);
                }
            }

            _preservedNodes.Clear();
            foreach (string key in save.NodeKeys)
            {
                if (claimed.Contains(key)) continue;

                _preservedNodes[key] = save.GetNode(key).Clone();
                report.AddUnknownNode(key);
            }

            return report;
        }

        /// <summary>Captures, serializes and writes the current game state.</summary>
        public void Save(string slotId = DefaultSlot)
        {
            SaveGame save = Capture();
            string payload = _serializer.Serialize(save.ToNode());
            _storage.Write(slotId, payload);
        }

        /// <summary>
        /// Reads and applies a slot. Returns a failure result when the slot is empty or
        /// unreadable rather than throwing, so callers can fall back to a new game.
        /// </summary>
        public LoadOutcome Load(string slotId = DefaultSlot)
        {
            string payload = _storage.Read(slotId);
            if (payload == null)
            {
                return LoadOutcome.Missing(slotId);
            }

            SaveGame save;
            try
            {
                save = SaveGame.FromNode(_serializer.Deserialize(payload));
            }
            catch (Exception e)
            {
                return LoadOutcome.Corrupt(slotId, e.Message);
            }

            SaveLoadReport report;
            try
            {
                report = Apply(save);
            }
            catch (SaveFormatException e)
            {
                return LoadOutcome.Corrupt(slotId, e.Message);
            }

            return LoadOutcome.Loaded(slotId, report);
        }

        public bool SlotExists(string slotId) { return _storage.Exists(slotId); }
        public void DeleteSlot(string slotId) { _storage.Delete(slotId); }
        public IEnumerable<string> ListSlots() { return _storage.ListSlots(); }
    }

    /// <summary>Outcome of a load attempt.</summary>
    public readonly struct LoadOutcome
    {
        public readonly bool Success;
        public readonly string SlotId;
        public readonly SaveLoadReport Report;
        public readonly string Error;

        private LoadOutcome(bool success, string slotId, SaveLoadReport report, string error)
        {
            Success = success;
            SlotId = slotId;
            Report = report;
            Error = error;
        }

        /// <summary>True when the slot simply has no save yet — start a new game.</summary>
        public bool IsMissing { get { return !Success && Error == null; } }

        public static LoadOutcome Loaded(string slotId, SaveLoadReport report)
        {
            return new LoadOutcome(true, slotId, report, null);
        }

        public static LoadOutcome Missing(string slotId)
        {
            return new LoadOutcome(false, slotId, null, null);
        }

        public static LoadOutcome Corrupt(string slotId, string error)
        {
            return new LoadOutcome(false, slotId, null, error ?? "unknown error");
        }
    }
}
