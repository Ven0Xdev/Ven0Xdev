using System;

namespace Prive.Core
{
    /// <summary>
    /// A validated, human-readable, persistence-safe identifier of the form
    /// <c>domain:name</c> — for example <c>vehicle_model:vx_aurora_gt</c> or
    /// <c>loc:usa_vermillion_bay.marina</c>.
    /// </summary>
    /// <remarks>
    /// Saves, cross-system links and content references use <see cref="StableId"/>
    /// rather than object references, so persisted data survives refactors, scene
    /// changes and asset re-imports. The restricted character set keeps IDs safe to
    /// use in file names, JSON keys and analytics payloads.
    /// </remarks>
    public readonly struct StableId : IEquatable<StableId>, IComparable<StableId>
    {
        public const char DomainSeparator = ':';

        /// <summary>The invalid / unset identifier.</summary>
        public static readonly StableId None = default(StableId);

        private readonly string _value;

        private StableId(string value)
        {
            _value = value;
        }

        /// <summary>The full <c>domain:name</c> text, or empty for <see cref="None"/>.</summary>
        public string Value
        {
            get { return _value ?? string.Empty; }
        }

        public bool IsValid
        {
            get { return !string.IsNullOrEmpty(_value); }
        }

        /// <summary>The portion before the separator, e.g. <c>vehicle_model</c>.</summary>
        public string Domain
        {
            get
            {
                if (!IsValid) return string.Empty;
                int i = _value.IndexOf(DomainSeparator);
                return i < 0 ? string.Empty : _value.Substring(0, i);
            }
        }

        /// <summary>The portion after the separator, e.g. <c>vx_aurora_gt</c>.</summary>
        public string Name
        {
            get
            {
                if (!IsValid) return string.Empty;
                int i = _value.IndexOf(DomainSeparator);
                return i < 0 ? string.Empty : _value.Substring(i + 1);
            }
        }

        /// <summary>True when this id belongs to <paramref name="domain"/>.</summary>
        public bool IsInDomain(string domain)
        {
            return IsValid && string.Equals(Domain, domain, StringComparison.Ordinal);
        }

        /// <summary>
        /// Builds an id from its parts. Throws <see cref="ArgumentException"/> if the
        /// result would be malformed — content ids are authored data and should fail loudly.
        /// </summary>
        public static StableId Create(string domain, string name)
        {
            string candidate = domain + DomainSeparator + name;
            StableId result;
            string error;
            if (!TryParse(candidate, out result, out error))
            {
                throw new ArgumentException("Invalid StableId '" + candidate + "': " + error);
            }
            return result;
        }

        /// <summary>Parses <paramref name="text"/>, throwing on failure.</summary>
        public static StableId Parse(string text)
        {
            StableId result;
            string error;
            if (!TryParse(text, out result, out error))
            {
                throw new ArgumentException("Invalid StableId '" + (text ?? "<null>") + "': " + error);
            }
            return result;
        }

        /// <summary>Parses <paramref name="text"/>, returning false rather than throwing.</summary>
        public static bool TryParse(string text, out StableId result)
        {
            string error;
            return TryParse(text, out result, out error);
        }

        /// <summary>Parses <paramref name="text"/> and explains any failure.</summary>
        public static bool TryParse(string text, out StableId result, out string error)
        {
            result = None;

            if (string.IsNullOrEmpty(text))
            {
                error = "id is null or empty";
                return false;
            }

            int separator = text.IndexOf(DomainSeparator);
            if (separator <= 0)
            {
                error = "missing or empty domain before '" + DomainSeparator + "'";
                return false;
            }

            if (separator == text.Length - 1)
            {
                error = "missing name after '" + DomainSeparator + "'";
                return false;
            }

            if (text.IndexOf(DomainSeparator, separator + 1) >= 0)
            {
                error = "more than one '" + DomainSeparator + "' separator";
                return false;
            }

            for (int i = 0; i < text.Length; i++)
            {
                char c = text[i];
                if (c == DomainSeparator) continue;

                bool allowed = (c >= 'a' && c <= 'z')
                               || (c >= '0' && c <= '9')
                               || c == '_'
                               || (c == '.' && i > separator);

                if (!allowed)
                {
                    error = "illegal character '" + c + "' at index " + i +
                            " (allowed: a-z, 0-9, '_', and '.' inside the name)";
                    return false;
                }
            }

            result = new StableId(text);
            error = null;
            return true;
        }

        /// <summary>
        /// Derives a child id by appending a dot-scoped segment, e.g.
        /// <c>loc:usa_vermillion_bay</c> + <c>marina</c> = <c>loc:usa_vermillion_bay.marina</c>.
        /// </summary>
        public StableId Child(string segment)
        {
            if (!IsValid) throw new InvalidOperationException("Cannot derive a child from StableId.None.");
            return Parse(_value + "." + segment);
        }

        public bool Equals(StableId other)
        {
            return string.Equals(Value, other.Value, StringComparison.Ordinal);
        }

        public override bool Equals(object obj)
        {
            return obj is StableId && Equals((StableId)obj);
        }

        public override int GetHashCode()
        {
            return Value.GetHashCode();
        }

        public int CompareTo(StableId other)
        {
            return string.Compare(Value, other.Value, StringComparison.Ordinal);
        }

        public override string ToString()
        {
            return IsValid ? _value : "<none>";
        }

        public static bool operator ==(StableId a, StableId b) { return a.Equals(b); }
        public static bool operator !=(StableId a, StableId b) { return !a.Equals(b); }
    }
}
