using System;
using System.Collections.Generic;

namespace Prive.Save
{
    /// <summary>Thrown when a save payload cannot be read as a valid document.</summary>
    public sealed class SaveFormatException : Exception
    {
        public SaveFormatException(string message) : base(message) { }
        public SaveFormatException(string message, Exception inner) : base(message, inner) { }
    }

    /// <summary>Converts a <see cref="SaveNode"/> tree to and from its stored representation.</summary>
    public interface ISaveSerializer
    {
        string Serialize(SaveNode root);
        SaveNode Deserialize(string text);
    }

    /// <summary>
    /// Where saves physically live. Abstracted so the core is testable in memory and the
    /// platform layer can use files, PlayerPrefs or cloud storage without the save system
    /// knowing which.
    /// </summary>
    public interface ISaveStorage
    {
        bool Exists(string slotId);
        void Write(string slotId, string payload);

        /// <summary>Returns the stored payload, or null when the slot is empty.</summary>
        string Read(string slotId);

        void Delete(string slotId);
        IEnumerable<string> ListSlots();
    }

    /// <summary>
    /// Implemented by any system with state worth persisting.
    /// </summary>
    /// <remarks>
    /// <see cref="SaveKey"/> is a permanent contract with every save file already on a
    /// player's device. Renaming one without a migration orphans that system's state.
    /// </remarks>
    public interface ISaveable
    {
        /// <summary>Stable, unique node name — e.g. "player", "economy", "travel".</summary>
        string SaveKey { get; }

        /// <summary>Produces this system's state as a fresh node.</summary>
        SaveNode Capture();

        /// <summary>
        /// Restores from a previously captured node. Implementations must tolerate missing
        /// members so a save written before a field existed still loads.
        /// </summary>
        void Restore(SaveNode node);
    }
}
