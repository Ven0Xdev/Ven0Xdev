using System.Collections.Generic;
using System.Text;

namespace Prive.Save
{
    /// <summary>
    /// What happened during a load. Returned rather than logged so callers can surface
    /// problems in the UI and tests can assert on them.
    /// </summary>
    public sealed class SaveLoadReport
    {
        private readonly List<string> _migrations = new List<string>();
        private readonly List<string> _missingIds = new List<string>();
        private readonly List<string> _unknownNodes = new List<string>();
        private readonly List<string> _errors = new List<string>();

        public IReadOnlyList<string> MigrationsApplied { get { return _migrations; } }

        /// <summary>Content ids referenced by the save that this build cannot resolve.</summary>
        public IReadOnlyList<string> MissingIds { get { return _missingIds; } }

        /// <summary>Nodes with no matching <see cref="ISaveable"/> — kept, not discarded.</summary>
        public IReadOnlyList<string> UnknownNodesPreserved { get { return _unknownNodes; } }

        public IReadOnlyList<string> Errors { get { return _errors; } }

        public bool HasErrors { get { return _errors.Count > 0; } }

        public void AddMigration(string description) { _migrations.Add(description); }
        public void AddMissingId(string id) { _missingIds.Add(id); }
        public void AddUnknownNode(string key) { _unknownNodes.Add(key); }
        public void AddError(string message) { _errors.Add(message); }

        public override string ToString()
        {
            StringBuilder sb = new StringBuilder();
            sb.Append("SaveLoadReport: ")
              .Append(_migrations.Count).Append(" migration(s), ")
              .Append(_unknownNodes.Count).Append(" unknown node(s), ")
              .Append(_missingIds.Count).Append(" missing id(s), ")
              .Append(_errors.Count).Append(" error(s)");

            for (int i = 0; i < _errors.Count; i++) sb.Append("\n  ERROR: ").Append(_errors[i]);
            return sb.ToString();
        }
    }
}
