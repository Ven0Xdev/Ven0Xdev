using System;
using System.Collections.Generic;

namespace Prive.Save
{
    /// <summary>Save format version. Bump whenever a migration is added.</summary>
    public static class SaveVersion
    {
        /// <summary>Version written by this build.</summary>
        public const int Current = 1;

        /// <summary>Oldest version the migration chain can still upgrade.</summary>
        public const int MinimumSupported = 1;
    }

    /// <summary>
    /// The root save document: metadata plus one node per <see cref="ISaveable"/>.
    /// </summary>
    /// <remarks>
    /// Nodes are keyed by <see cref="ISaveable.SaveKey"/>, so a system that did not exist
    /// when a save was written simply finds nothing and starts at its defaults, and a system
    /// that has since been removed leaves an unknown node — which is preserved rather than
    /// dropped, so a save opened by an older build is not quietly destroyed.
    /// </remarks>
    public sealed class SaveGame
    {
        public const string VersionKey = "__version";
        public const string BuildKey = "__build";
        public const string SavedAtKey = "__savedAtUtcTicks";
        public const string NodesKey = "nodes";

        private readonly Dictionary<string, SaveNode> _nodes = new Dictionary<string, SaveNode>(StringComparer.Ordinal);

        public int Version { get; set; }
        public string BuildId { get; set; }
        public long SavedAtUtcTicks { get; set; }

        public SaveGame(int version = SaveVersion.Current, string buildId = null)
        {
            Version = version;
            BuildId = buildId ?? string.Empty;
        }

        public IReadOnlyCollection<string> NodeKeys
        {
            get { return _nodes.Keys; }
        }

        public int NodeCount { get { return _nodes.Count; } }

        public void SetNode(string key, SaveNode node)
        {
            if (string.IsNullOrEmpty(key)) throw new ArgumentException("key is required", "key");
            _nodes[key] = node ?? SaveNode.Null();
        }

        /// <summary>The node for <paramref name="key"/>, or null when this save has none.</summary>
        public SaveNode GetNode(string key)
        {
            SaveNode node;
            return _nodes.TryGetValue(key, out node) ? node : null;
        }

        public bool HasNode(string key)
        {
            return _nodes.ContainsKey(key);
        }

        public bool RemoveNode(string key)
        {
            return _nodes.Remove(key);
        }

        /// <summary>Flattens to a single document for serialization.</summary>
        public SaveNode ToNode()
        {
            SaveNode root = SaveNode.NewObject();
            root.Set(VersionKey, Version);
            root.Set(BuildKey, BuildId ?? string.Empty);
            root.Set(SavedAtKey, SavedAtUtcTicks);

            SaveNode nodes = SaveNode.NewObject();
            foreach (KeyValuePair<string, SaveNode> kvp in _nodes)
            {
                nodes.Set(kvp.Key, kvp.Value);
            }

            root.Set(NodesKey, nodes);
            return root;
        }

        /// <summary>Rebuilds from a serialized document.</summary>
        public static SaveGame FromNode(SaveNode root)
        {
            if (root == null || !root.IsObject)
            {
                throw new SaveFormatException("Save root must be an object.");
            }

            SaveGame save = new SaveGame(root.GetInt(VersionKey, 0), root.GetString(BuildKey, string.Empty));
            save.SavedAtUtcTicks = root.GetLong(SavedAtKey, 0);

            SaveNode nodes = root.GetNode(NodesKey);
            if (nodes != null && nodes.IsObject)
            {
                foreach (string key in nodes.Keys)
                {
                    save._nodes[key] = nodes.GetNode(key);
                }
            }

            return save;
        }
    }
}
