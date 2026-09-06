using System;
using Prive.Core;

namespace Prive.World
{
    /// <summary>
    /// Strongly typed identifier for a place in the world — a country, city, district or venue.
    /// </summary>
    /// <remarks>
    /// A thin wrapper over <see cref="StableId"/> rather than a bare id, so the compiler
    /// rejects passing a vehicle model where a destination belongs. Districts are
    /// dot-scoped children of their city: <c>loc:usa_vermillion_bay.marina</c>.
    /// </remarks>
    public readonly struct WorldLocationId : IEquatable<WorldLocationId>
    {
        public static readonly WorldLocationId None = default(WorldLocationId);

        private readonly StableId _id;

        private WorldLocationId(StableId id)
        {
            _id = id;
        }

        public StableId Id { get { return _id; } }
        public bool IsValid { get { return _id.IsValid; } }
        public string Value { get { return _id.Value; } }

        /// <summary>The name portion, e.g. <c>usa_vermillion_bay.marina</c>.</summary>
        public string Path { get { return _id.Name; } }

        /// <summary>True when this id names a district rather than a city or country.</summary>
        public bool IsChild { get { return Path.IndexOf('.') >= 0; } }

        /// <summary>The owning city for a district id, or <see cref="None"/> for a top-level id.</summary>
        public WorldLocationId Parent
        {
            get
            {
                if (!IsValid) return None;

                string path = Path;
                int lastDot = path.LastIndexOf('.');
                if (lastDot < 0) return None;

                return FromPath(path.Substring(0, lastDot));
            }
        }

        /// <summary>Builds a location id from a path such as <c>usa_vermillion_bay.marina</c>.</summary>
        public static WorldLocationId FromPath(string path)
        {
            return new WorldLocationId(StableId.Create(IdDomains.Location, path));
        }

        /// <summary>Wraps an existing id, requiring the <c>loc</c> domain.</summary>
        public static WorldLocationId FromStableId(StableId id)
        {
            if (!id.IsValid) return None;

            if (!id.IsInDomain(IdDomains.Location))
            {
                throw new ArgumentException(
                    "'" + id + "' is not a world location id (expected domain '" + IdDomains.Location + "').");
            }

            return new WorldLocationId(id);
        }

        public static bool TryParse(string text, out WorldLocationId result)
        {
            StableId id;
            if (StableId.TryParse(text, out id) && id.IsInDomain(IdDomains.Location))
            {
                result = new WorldLocationId(id);
                return true;
            }

            result = None;
            return false;
        }

        /// <summary>Derives a district id under this city.</summary>
        public WorldLocationId Child(string segment)
        {
            if (!IsValid) throw new InvalidOperationException("Cannot derive a child of an invalid location.");
            return new WorldLocationId(_id.Child(segment));
        }

        public bool Equals(WorldLocationId other) { return _id.Equals(other._id); }
        public override bool Equals(object obj) { return obj is WorldLocationId && Equals((WorldLocationId)obj); }
        public override int GetHashCode() { return _id.GetHashCode(); }
        public override string ToString() { return _id.ToString(); }

        public static bool operator ==(WorldLocationId a, WorldLocationId b) { return a.Equals(b); }
        public static bool operator !=(WorldLocationId a, WorldLocationId b) { return !a.Equals(b); }
    }
}
