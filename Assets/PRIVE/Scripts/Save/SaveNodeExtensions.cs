using Prive.Core;

namespace Prive.Save
{
    /// <summary>
    /// Conversions between <see cref="SaveNode"/> and PRIVÉ's core value types.
    /// </summary>
    /// <remarks>
    /// Centralising these guarantees every system persists money, ids and time the same
    /// way: money as an integer of minor units (never a float), ids and time as their
    /// canonical primitives.
    /// </remarks>
    public static class SaveNodeExtensions
    {
        public static SaveNode Set(this SaveNode node, string key, Money value)
        {
            return node.Set(key, value.MinorUnits);
        }

        public static Money GetMoney(this SaveNode node, string key, Money fallback = default(Money))
        {
            SaveNode child = node.GetNode(key);
            return child == null ? fallback : Money.FromMinorUnits(child.AsLong(fallback.MinorUnits));
        }

        public static SaveNode Set(this SaveNode node, string key, StableId value)
        {
            return node.Set(key, value.IsValid ? value.Value : null);
        }

        public static StableId GetId(this SaveNode node, string key)
        {
            string raw = node.GetString(key);
            StableId parsed;
            return StableId.TryParse(raw, out parsed) ? parsed : StableId.None;
        }

        public static SaveNode Set(this SaveNode node, string key, GameTime value)
        {
            return node.Set(key, value.TotalMinutes);
        }

        public static GameTime GetTime(this SaveNode node, string key, GameTime fallback = default(GameTime))
        {
            long minutes = node.GetLong(key, fallback.TotalMinutes);
            return minutes < 0 ? fallback : GameTime.FromMinutes(minutes);
        }
    }
}
