using System;
using System.Collections.Generic;

namespace Prive.Save
{
    /// <summary>
    /// Upgrades a save from one version to the next.
    /// </summary>
    /// <remarks>
    /// One migration per version step, applied in order. This is why there is never a
    /// <c>switch (version)</c> scattered through individual loaders: each step is a single,
    /// testable transformation and the chain composes.
    /// </remarks>
    public interface ISaveMigration
    {
        /// <summary>The version this migration reads. It produces <c>FromVersion + 1</c>.</summary>
        int FromVersion { get; }

        /// <summary>Human-readable description, surfaced in <see cref="SaveLoadReport"/>.</summary>
        string Description { get; }

        void Upgrade(SaveGame save);
    }

    /// <summary>Runs the registered migration chain until a save reaches the current version.</summary>
    public sealed class SaveMigrator
    {
        private readonly Dictionary<int, ISaveMigration> _byFromVersion = new Dictionary<int, ISaveMigration>();

        public void Register(ISaveMigration migration)
        {
            if (migration == null) throw new ArgumentNullException("migration");

            if (_byFromVersion.ContainsKey(migration.FromVersion))
            {
                throw new InvalidOperationException(
                    "Two migrations claim to upgrade from version " + migration.FromVersion + ".");
            }

            _byFromVersion[migration.FromVersion] = migration;
        }

        public int Count { get { return _byFromVersion.Count; } }

        /// <summary>
        /// Upgrades <paramref name="save"/> in place to <see cref="SaveVersion.Current"/>,
        /// recording each applied step in <paramref name="report"/>.
        /// </summary>
        public void Migrate(SaveGame save, SaveLoadReport report)
        {
            Migrate(save, report, SaveVersion.Current);
        }

        /// <summary>
        /// Upgrades <paramref name="save"/> as far as <paramref name="targetVersion"/>.
        /// </summary>
        /// <remarks>
        /// The explicit target lets a migration chain be exercised and tested before the
        /// format version that needs it has shipped, and lets tooling inspect a save at an
        /// intermediate version. Normal loading uses the parameterless overload.
        /// </remarks>
        public void Migrate(SaveGame save, SaveLoadReport report, int targetVersion)
        {
            if (save == null) throw new ArgumentNullException("save");

            if (save.Version > targetVersion)
            {
                report.AddError("Save was written by a newer build (version " + save.Version +
                                ", this build understands " + targetVersion +
                                "). Unknown data will be preserved but may not be interpreted.");
                return;
            }

            if (save.Version < SaveVersion.MinimumSupported)
            {
                throw new SaveFormatException(
                    "Save version " + save.Version + " is older than the minimum supported version " +
                    SaveVersion.MinimumSupported + ".");
            }

            int guard = 0;
            while (save.Version < targetVersion)
            {
                ISaveMigration migration;
                if (!_byFromVersion.TryGetValue(save.Version, out migration))
                {
                    throw new SaveFormatException(
                        "No migration registered from save version " + save.Version + " to " + (save.Version + 1) + ".");
                }

                migration.Upgrade(save);
                save.Version = migration.FromVersion + 1;
                report.AddMigration(migration.Description);

                if (++guard > 256)
                {
                    throw new SaveFormatException("Migration chain did not terminate; check for a cycle.");
                }
            }
        }
    }
}
