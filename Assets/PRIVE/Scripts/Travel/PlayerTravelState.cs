using System;
using System.Collections.Generic;
using Prive.Core;
using Prive.Save;
using Prive.World;

namespace Prive.Travel
{
    /// <summary>
    /// The player's travel record: where they have been and how much flying they have done.
    /// </summary>
    /// <remarks>
    /// Kept separate from <c>PlayerProfile</c> because it is travel's data, not the player's
    /// identity — and because the Game Director will read it ("has never left the country",
    /// "flies private weekly") to shape opportunities.
    /// </remarks>
    public sealed class PlayerTravelState : ISaveable, IDisposable
    {
        public const string SaveNodeKey = "travel";

        private readonly HashSet<string> _visitedCities = new HashSet<string>(StringComparer.Ordinal);
        private readonly IDisposable _subscription;

        public PlayerTravelState(IEventBus bus, WorldLocationId startingCity = default(WorldLocationId))
        {
            if (bus == null) throw new ArgumentNullException("bus");

            if (startingCity.IsValid) _visitedCities.Add(startingCity.Value);
            _subscription = bus.Subscribe<PlayerArrivedEvent>(OnArrived);
        }

        /// <summary>Number of journeys completed.</summary>
        public int TripCount { get; private set; }

        /// <summary>Total in-game minutes spent travelling.</summary>
        public long TotalTravelMinutes { get; private set; }

        /// <summary>Cities the player has set foot in.</summary>
        public IReadOnlyCollection<string> VisitedCities { get { return _visitedCities; } }

        /// <summary>Mode used on the most recent journey.</summary>
        public TravelMode LastMode { get; private set; }

        public bool HasVisited(WorldLocationId city)
        {
            return city.IsValid && _visitedCities.Contains(city.Value);
        }

        private void OnArrived(PlayerArrivedEvent e)
        {
            TripCount++;
            TotalTravelMinutes += e.DurationMinutes;
            LastMode = e.Mode;

            if (e.To.IsValid) _visitedCities.Add(e.To.Value);
        }

        public void Dispose()
        {
            if (_subscription != null) _subscription.Dispose();
        }

        // --- Persistence --------------------------------------------------------

        public string SaveKey { get { return SaveNodeKey; } }

        public SaveNode Capture()
        {
            SaveNode node = SaveNode.NewObject();
            node.Set("tripCount", TripCount);
            node.Set("totalMinutes", TotalTravelMinutes);
            node.Set("lastMode", (int)LastMode);

            SaveNode visited = SaveNode.NewArray();
            foreach (string city in _visitedCities) visited.Add(SaveNode.From(city));
            node.Set("visited", visited);

            return node;
        }

        public void Restore(SaveNode node)
        {
            if (node == null) return;

            TripCount = node.GetInt("tripCount");
            TotalTravelMinutes = node.GetLong("totalMinutes");
            LastMode = (TravelMode)node.GetInt("lastMode");

            _visitedCities.Clear();
            SaveNode visited = node.GetNode("visited");
            if (visited != null && visited.IsArray)
            {
                for (int i = 0; i < visited.Count; i++)
                {
                    string city = visited[i].AsString();
                    if (!string.IsNullOrEmpty(city)) _visitedCities.Add(city);
                }
            }
        }
    }
}
