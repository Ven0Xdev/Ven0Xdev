using System;
using System.Collections.Generic;
using System.Globalization;

namespace Prive.Save
{
    public enum SaveNodeType
    {
        Null,
        Bool,
        Integer,
        Float,
        String,
        Object,
        Array
    }

    /// <summary>
    /// A minimal JSON-shaped document tree. Every persisted system describes its state
    /// as a <see cref="SaveNode"/> and is rebuilt from one.
    /// </summary>
    /// <remarks>
    /// <para>
    /// PRIVÉ does not serialize scene objects or reflect over runtime types. Systems write
    /// their own nodes explicitly, which is what makes saves survive refactors: renaming a
    /// C# field cannot silently break a player's save, because the save key is written by
    /// hand and changing it is a visible, migratable act.
    /// </para>
    /// <para>
    /// Integers and floats are separate node types. JSON has one number type, but money is
    /// stored as a <see cref="long"/> of cents and must never round-trip through a
    /// <c>double</c>; the parser restores an integer node for any literal written without a
    /// fraction or exponent.
    /// </para>
    /// <para>
    /// Object keys are ordered so saves are stable and diffable between writes.
    /// </para>
    /// </remarks>
    public sealed class SaveNode
    {
        private readonly SortedDictionary<string, SaveNode> _members;
        private readonly List<SaveNode> _items;

        private readonly bool _bool;
        private readonly long _integer;
        private readonly double _float;
        private readonly string _string;

        public SaveNodeType Type { get; private set; }

        private SaveNode(SaveNodeType type)
        {
            Type = type;
            if (type == SaveNodeType.Object) _members = new SortedDictionary<string, SaveNode>(StringComparer.Ordinal);
            if (type == SaveNodeType.Array) _items = new List<SaveNode>();
        }

        private SaveNode(bool value) : this(SaveNodeType.Bool) { _bool = value; }
        private SaveNode(long value) : this(SaveNodeType.Integer) { _integer = value; }
        private SaveNode(double value) : this(SaveNodeType.Float) { _float = value; }
        private SaveNode(string value) : this(SaveNodeType.String) { _string = value; }

        // --- Construction -------------------------------------------------------

        public static SaveNode NewObject() { return new SaveNode(SaveNodeType.Object); }
        public static SaveNode NewArray() { return new SaveNode(SaveNodeType.Array); }
        public static SaveNode Null() { return new SaveNode(SaveNodeType.Null); }
        public static SaveNode From(bool value) { return new SaveNode(value); }
        public static SaveNode From(long value) { return new SaveNode(value); }
        public static SaveNode From(int value) { return new SaveNode((long)value); }
        public static SaveNode From(double value) { return new SaveNode(value); }

        public static SaveNode From(string value)
        {
            return value == null ? Null() : new SaveNode(value);
        }

        // --- Object access ------------------------------------------------------

        public bool IsObject { get { return Type == SaveNodeType.Object; } }
        public bool IsArray { get { return Type == SaveNodeType.Array; } }
        public bool IsNull { get { return Type == SaveNodeType.Null; } }

        /// <summary>Member names in ordinal order. Empty for non-objects.</summary>
        public IEnumerable<string> Keys
        {
            get { return _members != null ? (IEnumerable<string>)_members.Keys : Array.Empty<string>(); }
        }

        public int Count
        {
            get
            {
                if (_members != null) return _members.Count;
                if (_items != null) return _items.Count;
                return 0;
            }
        }

        public bool Has(string key)
        {
            return _members != null && _members.ContainsKey(key);
        }

        /// <summary>Sets a member. Only valid on object nodes.</summary>
        public SaveNode Set(string key, SaveNode value)
        {
            RequireObject();
            if (string.IsNullOrEmpty(key)) throw new ArgumentException("key is required", "key");
            _members[key] = value ?? Null();
            return this;
        }

        public SaveNode Set(string key, bool value) { return Set(key, From(value)); }
        public SaveNode Set(string key, long value) { return Set(key, From(value)); }
        public SaveNode Set(string key, int value) { return Set(key, From((long)value)); }
        public SaveNode Set(string key, double value) { return Set(key, From(value)); }
        public SaveNode Set(string key, string value) { return Set(key, From(value)); }

        /// <summary>Removes a member; returns whether it existed.</summary>
        public bool Remove(string key)
        {
            return _members != null && _members.Remove(key);
        }

        /// <summary>The member node, or null when absent. Never throws on a missing key.</summary>
        public SaveNode GetNode(string key)
        {
            SaveNode node;
            if (_members != null && _members.TryGetValue(key, out node)) return node;
            return null;
        }

        /// <summary>Gets an object member, creating it if absent. Only valid on object nodes.</summary>
        public SaveNode GetOrCreateObject(string key)
        {
            RequireObject();
            SaveNode node = GetNode(key);
            if (node == null || !node.IsObject)
            {
                node = NewObject();
                _members[key] = node;
            }
            return node;
        }

        // --- Array access -------------------------------------------------------

        public SaveNode Add(SaveNode value)
        {
            RequireArray();
            _items.Add(value ?? Null());
            return this;
        }

        public SaveNode this[int index]
        {
            get
            {
                RequireArray();
                return _items[index];
            }
        }

        /// <summary>Array items. Empty for non-arrays.</summary>
        public IReadOnlyList<SaveNode> Items
        {
            get { return _items != null ? (IReadOnlyList<SaveNode>)_items : Array.Empty<SaveNode>(); }
        }

        // --- Typed reads (tolerant: a missing or wrong-typed value yields the fallback) ---

        public bool AsBool(bool fallback = false)
        {
            return Type == SaveNodeType.Bool ? _bool : fallback;
        }

        public long AsLong(long fallback = 0)
        {
            if (Type == SaveNodeType.Integer) return _integer;
            if (Type == SaveNodeType.Float) return (long)Math.Round(_float, MidpointRounding.AwayFromZero);
            return fallback;
        }

        public int AsInt(int fallback = 0)
        {
            return (int)AsLong(fallback);
        }

        public double AsDouble(double fallback = 0)
        {
            if (Type == SaveNodeType.Float) return _float;
            if (Type == SaveNodeType.Integer) return _integer;
            return fallback;
        }

        public string AsString(string fallback = null)
        {
            return Type == SaveNodeType.String ? _string : fallback;
        }

        public bool GetBool(string key, bool fallback = false)
        {
            SaveNode n = GetNode(key);
            return n == null ? fallback : n.AsBool(fallback);
        }

        public long GetLong(string key, long fallback = 0)
        {
            SaveNode n = GetNode(key);
            return n == null ? fallback : n.AsLong(fallback);
        }

        public int GetInt(string key, int fallback = 0)
        {
            SaveNode n = GetNode(key);
            return n == null ? fallback : n.AsInt(fallback);
        }

        public double GetDouble(string key, double fallback = 0)
        {
            SaveNode n = GetNode(key);
            return n == null ? fallback : n.AsDouble(fallback);
        }

        public string GetString(string key, string fallback = null)
        {
            SaveNode n = GetNode(key);
            return n == null ? fallback : n.AsString(fallback);
        }

        /// <summary>Deep copy. Used to preserve unknown nodes across a load/save round-trip.</summary>
        public SaveNode Clone()
        {
            switch (Type)
            {
                case SaveNodeType.Object:
                    {
                        SaveNode copy = NewObject();
                        foreach (KeyValuePair<string, SaveNode> kvp in _members)
                        {
                            copy._members[kvp.Key] = kvp.Value.Clone();
                        }
                        return copy;
                    }
                case SaveNodeType.Array:
                    {
                        SaveNode copy = NewArray();
                        for (int i = 0; i < _items.Count; i++) copy._items.Add(_items[i].Clone());
                        return copy;
                    }
                case SaveNodeType.Bool: return From(_bool);
                case SaveNodeType.Integer: return From(_integer);
                case SaveNodeType.Float: return From(_float);
                case SaveNodeType.String: return From(_string);
                default: return Null();
            }
        }

        private void RequireObject()
        {
            if (Type != SaveNodeType.Object)
            {
                throw new InvalidOperationException("Expected an object SaveNode but this node is " + Type + ".");
            }
        }

        private void RequireArray()
        {
            if (Type != SaveNodeType.Array)
            {
                throw new InvalidOperationException("Expected an array SaveNode but this node is " + Type + ".");
            }
        }

        public override string ToString()
        {
            switch (Type)
            {
                case SaveNodeType.Object: return "{object x" + Count + "}";
                case SaveNodeType.Array: return "[array x" + Count + "]";
                case SaveNodeType.Bool: return _bool ? "true" : "false";
                case SaveNodeType.Integer: return _integer.ToString(CultureInfo.InvariantCulture);
                case SaveNodeType.Float: return _float.ToString("R", CultureInfo.InvariantCulture);
                case SaveNodeType.String: return _string;
                default: return "null";
            }
        }
    }
}
