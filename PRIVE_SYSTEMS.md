# PRIVÉ — Systems Catalogue & Dependency Graph

Every major system, what it owns, what it needs, and what it must *not* know.
Status legend: **✅ built and tested** (Phase 1) · **⬜ planned**

---

## 1. System dependency graph

Arrow = "depends on". A system may only depend on systems above it.

```
LAYER 0  ── foundation, depends on nothing ────────────────────────────────────
   StableId ✅      EventBus ✅      ServiceRegistry ✅      Money ✅

LAYER 1  ── universal services ────────────────────────────────────────────────
   GameClock ✅ ──────────► (Layer 0)
   SaveManager ✅ ────────► (Layer 0)
   WorldCatalog ✅ ───────► (Layer 0)

LAYER 2  ── player state ──────────────────────────────────────────────────────
   Economy ✅ ────────────► GameClock, EventBus, Money
   SocialStatus ✅ ───────► GameClock, EventBus
   PlayerProfile ✅ ──────► Economy, SocialStatus, WorldCatalog

LAYER 3  ── player-facing simulation ──────────────────────────────────────────
   Travel ✅ ─────────────► PlayerProfile, WorldCatalog, GameClock, Economy
   ObservedWealth ✅ ─────► SocialStatus, (signals from Layer 4)
   Streaming ⬜ ──────────► WorldCatalog, PlayerProfile
   Phone ⬜ ──────────────► everything (read-mostly UI shell)

LAYER 4  ── content systems (each plugs into Layer 2/3 registries) ────────────
   Vehicles ⬜        Properties ⬜       Businesses ⬜
   Investments ⬜     Dealerships ⬜      Wardrobe ⬜
        └── all implement IAssetValueProvider + IObservedWealthSignal + ISaveable

LAYER 5  ── world reactivity ──────────────────────────────────────────────────
   NPC ⬜ ────────────────► PresenceScore, GameClock, WorldCatalog
   SocialReaction ⬜ ─────► NPC, ObservedWealth
   Paparazzi/Media ⬜ ────► SocialReaction, SocialStatus
   WorldEvents ⬜ ────────► GameClock, PlayerProfile

LAYER 6  ── orchestration ─────────────────────────────────────────────────────
   GameDirector ⬜ ───────► reads everything, writes only WorldEvents
```

**The one hard rule:** nothing in Layer ≤3 may reference a Layer 4 type directly.
Vehicles do not appear in `NetWorthService`; they *register* with it.

---

## 2. Core (`Prive.Core`) ✅

| Type | Kind | Notes |
|---|---|---|
| `StableId` | readonly struct | `domain:name`, validated, `[a-z0-9_:]` |
| `RuntimeIdFactory` | class | mints `inst:` IDs for owned instances |
| `Money` | readonly struct | `long` minor units, checked arithmetic, `Scale(double)` |
| `GameTime` | readonly struct | total minutes since epoch → Y/M/D/H/M, day-of-week |
| `IGameClock` / `GameClock` | service | accumulates real time, emits minute→year ticks |
| `IClockTickable` | interface | `OnMinute/OnHour/OnDay/OnWeek/OnMonth/OnYear` |
| `IEventBus` / `EventBus` | service | typed sync pub/sub, reentrancy-safe |
| `ServiceRegistry` / `GameContext` | container | composition-root only |
| `OperationResult<T>` | struct | success/failure without exceptions on expected paths |

**Must not know:** anything about players, money sources, or Unity.

---

## 3. Economy (`Prive.Economy`) ✅

```
PlayerWallet         Cash + BankBalance, deposits/withdrawals/transfers
TransactionLedger    append-only TransactionRecord list, capped ring for UI
NetWorthService      Σ IAssetValueProvider − Σ ILiabilityProvider + liquid
RecurringCashflow    IClockTickable → daily/weekly/monthly income & expenses
CreditProfile        credit score, borrowing capacity  ⬜
```

Key contracts other systems implement:

```csharp
interface IAssetValueProvider {
    AssetCategory Category { get; }        // Vehicle, Property, Business, Investment, Collectible
    Money GetTotalValue();
    IEnumerable<AssetValuation> GetValuations();   // for the phone's asset breakdown
}
interface ILiabilityProvider {
    Money GetOutstandingBalance();
    IEnumerable<LiabilityRecord> GetLiabilities();
}
```

**Net worth formula** (single source of truth, `NetWorthService`):

```
NetWorth = Cash + BankBalance
         + Σ assets(Vehicle, Property, Business, Investment, Collectible)
         − Σ liabilities(Loan, Mortgage, CreditCard, TaxDue)
```

**Events:** `MoneyChangedEvent`, `TransactionRecordedEvent`, `NetWorthChangedEvent`.
UI binds to these. **No UI may read a balance field directly.**

**Progression targets** (tuning, see `EconomyTuning`): $5k→$25k fast, $25k→$100k
early, $100k→$1M in a few hours of effective play. $1M is the *entry* to the luxury
tier, not the end. Ceilings are designed to $1B+.

---

## 4. Social status (`Prive.Social`) ✅

| Concept | Range | Decays? | Driven by |
|---|---|---|---|
| `Fame` | 0–1000 | yes, weekly | sightings, media posts, events, business notoriety |
| `Reputation` | −100…+100 | slowly | deals honoured/broken, NPC interactions |
| `Influence` | 0–1000 | no | contacts, businesses, fame × reputation |
| `LifestyleScore` | 0–1000 | yes, monthly | residence, vehicles, venues, travel, spending |
| `SocialClass` | enum | derived | observed wealth + fame + lifestyle |

```csharp
interface IObservedWealthSignal {
    ObservedWealthContribution Evaluate(ObservedWealthContext ctx);
    // → (Money impliedWealth, double weight, double confidence)
}
```

`ObservedWealthCalculator` blends signals into `ObservedWealth`, deliberately
decoupled from `NetWorth`. `PresenceScore` = observed wealth × venue context ×
fame × recency, and is the single number the NPC reaction system consumes.

**Must not know:** the player's actual bank balance. Enforced by the fact that
`ObservedWealthContext` does not carry it.

---

## 5. World (`Prive.World`) ✅

```
WorldLocationId   loc:usa_vermillion_bay[.district]
CountryData       id, name, currency, timezone offset, unlock rules
CityData          id, country, airports, districts, market profile
DistrictData      id, city, addressables scene key, prestige tier, bounds
AirportData       id, city, ICAO-style code, supported travel modes
IWorldLocationCatalog   resolve / enumerate / validate
```

**First city — Vermillion Bay (fictional, Miami-inspired):**

| District | Inspiration | Prestige | Role |
|---|---|---|---|
| `downtown` | Downtown | 3 | starter apartments, offices |
| `financial_district` | Brickell | 4 | banks, investment, HQ businesses |
| `south_shore` | South Beach | 4 | nightlife, clubs, beach |
| `luxury_district` | Design District | 5 | boutiques, watches, jewellery, supercar dealers |
| `marina` | Marina | 5 | yachts, charter, waterfront venues |
| `mansion_isles` | Star Island | 5 | mansions, private events |
| `airport` | MIA | 2 | travel hub, private aviation terminal |
| `industrial` | Industrial | 1 | warehouses, import/export, cheap garages |
| `suburbs` | Suburbs | 2 | starter homes, used-car lots |

**Future locations** (IDs reserved now, content later):
`loc:uae_dubai`, `loc:monaco_monte_carlo`, `loc:uk_london`, `loc:fra_paris`,
`loc:ita_milan`.

---

## 6. Travel (`Prive.Travel`) ✅ foundation

```
TravelMode      GroundTransfer, CommercialEconomy, CommercialBusiness,
                CommercialFirst, PrivateJetCharter, OwnedJet, Helicopter, Yacht
TravelRoute     from → to, great-circle km, supported modes
TravelQuote     mode, Money cost, duration, comfort, fameDelta, requirements
TravelTicket    booked quote + minted RuntimeId + booking GameTime
ITravelPricingModel   distance × mode rate × class multiplier × demand
ITravelService  GetQuotes / Book / Execute
PlayerTravelState   current location, in-transit ticket, travel history
```

`Execute` advances the clock, moves the player, publishes `PlayerArrivedEvent`.
Everything downstream (markets, businesses, NPC pools, events) subscribes to that
event; none of them know about aircraft.

**Not yet implemented:** owned-jet ownership costs, crew, slots, customs, jet lag.
The contracts leave room for all of them.

---

## 7. Save (`Prive.Save`) ✅

```
SaveGame        { Version, BuildId, SavedAtUtcTicks, Nodes: Dictionary<string, SaveNode> }
ISaveable       { string SaveKey; SaveNode Capture(); void Restore(SaveNode); }
ISaveMigration  { int FromVersion; SaveGame Upgrade(SaveGame); }
SaveMigrator    runs the chain FromVersion → SaveVersion.Current
ISaveSerializer / ISaveStorage   injected (JSON + file in the Unity layer)
SaveManager     orchestrates capture → serialize → store, and reverse
SaveLoadReport  { MigrationsApplied, MissingIds, UnknownNodesPreserved, Errors }
```

Unknown nodes survive a round-trip untouched, so a save opened by an older build is
not destroyed.

---

## 8. Vehicles ⬜ (Phase 2)

```
VehicleModelData   fictional brand, class, base price, prestige, rarity, stats
VehicleInstance    RuntimeId, model, mileage, condition, damage, fuel, plate,
                   mods, insurance, purchase price/date
VehicleValuation   base × condition × mileage × rarity × market × mods
VehicleCatalog     IAssetValueProvider + IObservedWealthSignal
Garage             capacity per property, storage location
```

Classes: Economy, Sports, Luxury, Supercar, Hypercar, LuxurySUV, Limousine,
Classic, RareCollector. Later: Aircraft, Boat.
**Fictional brands only** (e.g. *Veloce*, *Aurelian*, *Kestrel Motors*, *Marrow*).

---

## 9. Dealership ⬜ (Phase 2) — the first real money loop

```
Buy inventory → appraise → price → market NPC customers → negotiate → sell
```

`DealershipBusiness` implements `IBusiness`. Sourcing feeds rare-vehicle
opportunities from the Game Director. Player can own multiple lots (Phase 4).

---

## 10. Investments ⬜ (Phase 4)

```
MarketAsset        stock | crypto | memecoin | startup | private equity
MarketPriceHistory ring buffer of OHLC candles
MarketSentiment    per-asset and global bull/bear bias
MarketEvent        partnership, launch, scandal, fraud, hack, crash, rally,
                   endorsement, regulation
NewsEvent          the player-visible narration of a MarketEvent
PlayerPosition     asset, quantity, average cost
Portfolio          IAssetValueProvider
MarketSimulationManager   IClockTickable (hourly), GBM + event shocks
```

Entirely fictional. No connection to any real market or real money.

---

## 11. NPC ⬜ (Phase 5)

Three tiers, deliberately different budgets:

| Tier | Count | Brain | Memory |
|---|---|---|---|
| Ambient | hundreds | pooled state machine | none |
| Named/Recurring | dozens | utility AI + schedule | short episodic |
| Key characters | ~20 | utility AI + dialogue graph | persistent, saved |

Attributes: name, age, occupation, wealth, class, personality, mood, relationship,
recognition, risk tolerance, interests, daily schedule, preferred locations, memory,
fame awareness, luxury/vehicle/business interest.

**No generative AI for ambient pedestrians — ever.** Key characters may later gain
richer conversation behind an interface.

---

## 12. Social reaction & media ⬜ (Phase 5)

```
PresenceScore → reaction weights → reaction:
  glance · turn head · phone out · photograph · approach · selfie ·
  compliment vehicle · start conversation · offer opportunity · VIP access ·
  refuse entry · extra respect · suspicion · recognition
```

Weighted and context-aware, never pure random. Photographs feed
`SightingEvent → MediaPost → Fame + ObservedWealth`, e.g.
*"Spotted tonight outside the marina."*

---

## 13. Businesses & properties ⬜ (Phase 4)

```
IBusiness   id, type, ownershipPercent, revenue, expenses, employees,
            upgrades, reputation, customers, valuation, profit/loss
IProperty   id, type, district, value, rent, prestige, garage capacity,
            income, upkeep
```

Both implement `IAssetValueProvider`, `IObservedWealthSignal`, `IClockTickable`
(daily revenue/upkeep) and `ISaveable`. Types: dealership, nightclub, restaurant,
luxury store, hotel, real-estate co, rental co, yacht charter, private aviation,
investment firm.

---

## 14. Phone ⬜ (Phase 3)

```csharp
interface IPhoneApp {
    StableId AppId { get; }
    string DisplayName { get; }
    bool IsUnlocked(PlayerProfile p);
    int NotificationCount { get; }
}
```

Apps: Bank, Messages, Contacts, Map, Social, News, Stocks, Crypto, Businesses,
Properties, Vehicles, Travel, Airline, JetCharter, Calendar, Camera. Each app is an
independent prefab + controller registered with `PhoneShell`; adding one touches no
existing app.

---

## 15. World events & Game Director ⬜ (Phase 6)

```csharp
interface IGameDirector { void Evaluate(GameDirectorContext ctx); }
GameDirectorContext  wealth, wealth velocity, businesses, recent actions,
                     locations visited, relationships, investments, fame,
                     available content, time since last event
GameDirectorRule     ICondition + weight + cooldown → GameDirectorEvent
```

**Not written yet, deliberately.** Declaring the interface now with no implementation and
no caller would be dead code; the seams it needs already exist (clock tick events and
`IEventBus`). It will ship as a deterministic **rule-based** director. An LLM-backed
implementation is a later, optional swap behind the same interface — never a dependency of
normal play.

---

## 16. Streaming ⬜ (Phase 3)

`IDistrictStreamer`: `WorldLocationId → Addressables scene key`, distance + priority
based additive load/unload, budgeted to N districts resident. Combined with LOD,
occlusion, pooling and async loading. Nothing may assume a district is loaded.

---

## 17. Testing map (`Prive.Tests.EditMode`) ✅

| Area | Covered now |
|---|---|
| Money arithmetic, rounding, overflow | ✅ |
| GameTime conversion & calendar | ✅ |
| GameClock tick emission & ordering | ✅ |
| EventBus dispatch, reentrancy, error isolation | ✅ |
| StableId validation | ✅ |
| Wallet & ledger invariants | ✅ |
| Net worth aggregation | ✅ |
| Observed wealth blending | ✅ |
| Travel pricing & booking | ✅ |
| Save round-trip & migration chain | ✅ |
| Vehicle pricing, market sim, business revenue | ⬜ with their phases |
