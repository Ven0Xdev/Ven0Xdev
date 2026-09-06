using System;
using System.Collections.Generic;
using Prive.Core;
using Prive.Save;
using Prive.Vehicles;

namespace Prive.Dealership
{
    /// <summary>One vehicle on a forecourt, with the price being asked for it.</summary>
    /// <remarks>
    /// Stock is held as a real <see cref="VehicleInstance"/>, not as a model id plus a price.
    /// That is what makes browsing meaningful: two examples of the same model with different
    /// mileage and condition are genuinely different purchases, and spotting the good one is
    /// the skill the trading loop rewards.
    /// </remarks>
    public sealed class DealershipStockItem
    {
        public DealershipStockItem(VehicleInstance vehicle, Money askingPrice)
        {
            if (vehicle == null) throw new ArgumentNullException("vehicle");

            Vehicle = vehicle;
            AskingPrice = askingPrice;
        }

        public VehicleInstance Vehicle { get; private set; }
        public Money AskingPrice { get; private set; }

        /// <summary>Used by a future negotiation system to record an agreed price.</summary>
        public void SetAskingPrice(Money price)
        {
            if (price.IsNegative) throw new ArgumentException("Asking price cannot be negative", "price");
            AskingPrice = price;
        }

        public SaveNode Capture()
        {
            SaveNode node = SaveNode.NewObject();
            node.Set("vehicle", Vehicle.Capture());
            node.Set("asking", AskingPrice);
            return node;
        }

        public static DealershipStockItem TryRestore(SaveNode node, out string problem)
        {
            problem = null;
            if (node == null) { problem = "empty stock node"; return null; }

            VehicleInstance vehicle = VehicleInstance.TryRestore(node.GetNode("vehicle"), out problem);
            if (vehicle == null) return null;

            return new DealershipStockItem(vehicle, node.GetMoney("asking"));
        }
    }

    /// <summary>The vehicles one dealership currently has for sale.</summary>
    public sealed class DealershipInventory
    {
        private readonly List<DealershipStockItem> _items = new List<DealershipStockItem>();

        public DealershipInventory(StableId dealershipId)
        {
            DealershipId = dealershipId;
        }

        public StableId DealershipId { get; private set; }

        public IReadOnlyList<DealershipStockItem> Items { get { return _items; } }

        public int Count { get { return _items.Count; } }

        /// <summary>Game day the inventory was last generated, so restocking can be scheduled.</summary>
        public long LastRestockedDay { get; set; }

        public void Add(DealershipStockItem item)
        {
            if (item == null) throw new ArgumentNullException("item");
            _items.Add(item);
        }

        /// <summary>Returns the stock item for <paramref name="vehicleId"/>, or null.</summary>
        public DealershipStockItem Find(VehicleId vehicleId)
        {
            for (int i = 0; i < _items.Count; i++)
            {
                if (_items[i].Vehicle.Id == vehicleId) return _items[i];
            }
            return null;
        }

        public bool Remove(VehicleId vehicleId)
        {
            for (int i = 0; i < _items.Count; i++)
            {
                if (_items[i].Vehicle.Id == vehicleId)
                {
                    _items.RemoveAt(i);
                    return true;
                }
            }
            return false;
        }

        public void Clear() { _items.Clear(); }

        public SaveNode Capture()
        {
            SaveNode node = SaveNode.NewObject();
            node.Set("lastRestockedDay", LastRestockedDay);

            SaveNode list = SaveNode.NewArray();
            for (int i = 0; i < _items.Count; i++) list.Add(_items[i].Capture());
            node.Set("stock", list);

            return node;
        }

        public void Restore(SaveNode node, List<string> problems)
        {
            Clear();
            if (node == null) return;

            LastRestockedDay = node.GetLong("lastRestockedDay");

            SaveNode list = node.GetNode("stock");
            if (list == null || !list.IsArray) return;

            for (int i = 0; i < list.Count; i++)
            {
                string problem;
                DealershipStockItem item = DealershipStockItem.TryRestore(list[i], out problem);

                if (item == null)
                {
                    if (problems != null && problem != null) problems.Add(problem);
                    continue;
                }

                _items.Add(item);
            }
        }
    }
}
