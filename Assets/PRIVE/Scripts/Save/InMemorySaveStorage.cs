using System.Collections.Generic;

namespace Prive.Save
{
    /// <summary>
    /// Volatile <see cref="ISaveStorage"/>. Used by tests and by the editor's
    /// "play without touching my saves" mode.
    /// </summary>
    public sealed class InMemorySaveStorage : ISaveStorage
    {
        private readonly Dictionary<string, string> _slots = new Dictionary<string, string>();

        public bool Exists(string slotId) { return _slots.ContainsKey(slotId); }

        public void Write(string slotId, string payload) { _slots[slotId] = payload; }

        public string Read(string slotId)
        {
            string payload;
            return _slots.TryGetValue(slotId, out payload) ? payload : null;
        }

        public void Delete(string slotId) { _slots.Remove(slotId); }

        public IEnumerable<string> ListSlots() { return new List<string>(_slots.Keys); }
    }
}
