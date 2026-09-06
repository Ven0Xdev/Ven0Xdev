using System;

namespace Prive.Save
{
    /// <summary>
    /// Adapts an arbitrary pair of capture/restore functions into an <see cref="ISaveable"/>.
    /// </summary>
    /// <remarks>
    /// For state that has no natural owning class to implement the interface — the game clock
    /// is the obvious example. Without this, either the save layer would have to know about
    /// specific systems or every such system would need a bespoke adapter class.
    /// </remarks>
    public sealed class DelegateSaveable : ISaveable
    {
        private readonly Func<SaveNode> _capture;
        private readonly Action<SaveNode> _restore;

        public DelegateSaveable(string saveKey, Func<SaveNode> capture, Action<SaveNode> restore)
        {
            if (string.IsNullOrEmpty(saveKey)) throw new ArgumentException("saveKey is required", "saveKey");
            if (capture == null) throw new ArgumentNullException("capture");
            if (restore == null) throw new ArgumentNullException("restore");

            SaveKey = saveKey;
            _capture = capture;
            _restore = restore;
        }

        public string SaveKey { get; private set; }

        public SaveNode Capture() { return _capture(); }

        public void Restore(SaveNode node) { _restore(node); }
    }
}
