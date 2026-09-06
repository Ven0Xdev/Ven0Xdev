# PRIVÉ — Technical Architecture

> Single-player open-world luxury life simulator.
> Codename **PRIVÉ**. First city: an original fictional coastal luxury city
> ("**Vermillion Bay**", Florida-inspired), architected from day one for
> multiple cities and countries.

This document describes *how the project is built*. For **what** gets built and
**when**, see [`PRIVE_ROADMAP.md`](PRIVE_ROADMAP.md). For per-system contracts and
data models, see [`PRIVE_SYSTEMS.md`](PRIVE_SYSTEMS.md).

---

## 1. Guiding principles

| # | Principle | Consequence in this codebase |
|---|-----------|------------------------------|
| 1 | **Simulation logic is not Unity logic** | All rules (money, time, net worth, pricing, status) live in assemblies compiled with `"noEngineReferences": true`. They cannot reference `UnityEngine`, and the compiler enforces it. |
| 2 | **Testable without the Editor** | Because of (1), the whole simulation core compiles and runs under a plain C# compiler. `Tools/verify.sh` does exactly that in CI and locally. |
| 3 | **Stable IDs, never object references** | Saves, cross-system links and network-free persistence all key off `StableId`. Never serialize a scene object. |
| 4 | **Events over lookups** | Systems publish to `IEventBus`. No `FindObjectOfType`, no static singleton grab-bag, no `GameObject.Find`. |
| 5 | **Composition over inheritance** | Net worth, observed wealth and travel pricing are all *provider registries*: new content plugs in without editing the calculator. |
| 6 | **Streaming is assumed, not retrofitted** | Nothing may assume "the city is loaded". Every world reference is a `WorldLocationId`, resolved through a catalog. |
| 7 | **Mobile budget is a design constraint** | One driver `Update()`, pooled objects, no per-frame allocation in core loops, integer money math. |
| 8 | **Pragmatic, not enterprise** | No DI container, no CQRS, no reactive framework. A small hand-rolled service registry and event bus, injected at composition root. |

---

## 2. Assembly graph

The assembly definitions *are* the architecture. Unity enforces the arrows below;
a cycle or an illegal dependency is a compile error, not a code-review comment.

```
                       ┌──────────────────────┐
                       │  Prive.Core          │  pure C#  (no UnityEngine)
                       │  ids · events · time │
                       │  money · services    │
                       └───────┬──────────────┘
                               │
                       ┌───────▼───────┐
                       │  Prive.Save   │  document tree · versioning · migration
                       └───────┬───────┘
                               │
        ┌──────────────────────┼───────────────────────┐
        │                      │                       │
  ┌─────▼──────┐        ┌──────▼──────┐         ┌──────▼──────┐
  │Prive.World │        │Prive.Economy│         │Prive.Social │──┐
  │ locations  │        │ money rules │         │ status ·    │  │
  └─────┬──────┘        └──────┬──────┘         │ observed $  │  │
        │                      │                └──────┬──────┘  │
        │  (Social reads district prestige) ───────────┘         │
        │                      │                                 │
        └──────────┬───────────┴─────────────────────────────────┘
                   │
            ┌──────▼───────┐
            │ Prive.Player │  aggregate: wallet + status + location + id factory
            └──────┬───────┘
                   │
            ┌──────▼───────┐
            │ Prive.Travel │  quote → book → execute
            └──────┬───────┘
                   │
        ┌──────────▼────────────┐
        │ Prive.Unity.Runtime   │  ← the ONLY assembly with MonoBehaviours,
        │ bootstrap · SOs · IO  │    ScriptableObjects and file I/O
        └───────────────────────┘

        ┌───────────────────────┐
        │ Prive.Tests.EditMode  │ → references every pure assembly
        └───────────────────────┘
```

Every arrow above is declared in an `.asmdef` and enforced by the compiler.
`Tools/verify.sh` compiles each assembly with **only** its declared references, so a
missing or circular dependency fails the build rather than passing review.

### Assemblies

| Assembly | Path | Engine refs? | Responsibility |
|---|---|---|---|
| `Prive.Core` | `Scripts/Core` | **No** | `StableId`, `Money`, `GameTime`, `GameClock`, `EventBus`, `ServiceRegistry`, `GameContext`, `IClockTickable`, result types |
| `Prive.Economy` | `Scripts/Economy` | **No** | Wallet, ledger, transactions, net worth, asset/liability contracts, recurring cashflow, tuning constants |
| `Prive.World` | `Scripts/World` | **No** | `WorldLocationId`, country/city/district/airport data, location catalog |
| `Prive.Social` | `Scripts/Social` | **No** | Fame, reputation, influence, lifestyle, observed wealth, social class, presence score (reads district prestige from `Prive.World`) |
| `Prive.Save` | `Scripts/Save` | **No** | `SaveNode` document tree, dependency-free JSON serializer, `SaveGame`, `ISaveable`, versioning, migration chain, storage contracts |
| `Prive.Travel` | `Scripts/Travel` | **No** | Routes, travel modes, quotes, pricing model, booking, arrival effects |
| `Prive.Player` | `Scripts/Player` | **No** | `PlayerProfile` — the aggregate root binding wallet, status and location |
| `Prive.Unity.Runtime` | `Scripts/Unity` | Yes | Bootstrap, composition root, `ScriptableObject` catalogs, JSON serializer, file storage, clock driver |
| `Prive.Tests.EditMode` | `Tests/EditMode` | Yes¹ | NUnit tests for all pure logic |

¹ The test assembly references `UnityEngine.TestRunner`; the tests themselves
touch no engine API, which is why the same files run under `Tools/verify.sh`.

**Reserved, not yet created** (folders exist, assemblies added when Phase 2+ starts):
`Prive.Vehicles`, `Prive.NPC`, `Prive.Business`, `Prive.Property`,
`Prive.Investments`, `Prive.Phone`, `Prive.AI`.

---

## 3. Composition root & lifetime

There is exactly one place where concrete types are wired together:
`Prive.Unity.Runtime.GameBootstrap` (on the `Bootstrap` scene).

```
GameBootstrap.Awake()
    ├─ build ServiceRegistry
    ├─ register EventBus                  (IEventBus)
    ├─ register GameClock                 (IGameClock)
    ├─ register WorldLocationCatalog      (IWorldLocationCatalog)  ← from ScriptableObjects
    ├─ register PlayerProfile             (assembled from save or new-game defaults)
    ├─ register NetWorthService           (IAssetValueProvider registry)
    ├─ register TravelService             (ITravelService)
    ├─ register SaveManager               (ISaveManager)
    └─ GameContext.Install(registry)  →  everything else resolves from here
```

Rules:

* **Nothing** in a pure assembly may call `GameContext` statically at construction
  time. Services take their dependencies as constructor arguments. `GameContext` is
  a convenience for the *Unity layer only* (MonoBehaviours cannot have constructors).
* MonoBehaviours resolve once in `Awake`/`Start`, cache the reference, and never
  look up per-frame.
* `Prive.Unity.Runtime.GameLoopDriver` owns the **single** `Update()` that advances
  the clock. Simulation systems implement `IClockTickable` and are ticked by the
  clock, not by their own `Update()`.

---

## 4. Data flow: the one loop that matters

```
GameLoopDriver.Update(deltaTime)
        │
        ▼
GameClock.Advance(realSeconds × timeScale)
        │  accumulates → emits discrete ticks
        ├──► IClockTickable.OnMinute(GameTime)   NPC schedules, traffic, presence
        ├──► IClockTickable.OnHour(GameTime)     venue open/close, market ticks
        ├──► IClockTickable.OnDay(GameTime)      rent, salaries, business revenue,
        │                                        loan interest, depreciation
        ├──► IClockTickable.OnWeek(GameTime)     fame decay, reputation drift
        └──► IClockTickable.OnMonth(GameTime)    taxes, insurance, valuations
```

Every recurring economic effect in the game hangs off this. There is no second
notion of time anywhere in the codebase.

---

## 5. Money: integers, never floats

`Money` is a `readonly struct` over a `long` of **minor units** (cents).

* `$1,000,000.00` → `100_000_000L`.
* `long` covers ±$92 quadrillion — far beyond the $1B+ endgame.
* Arithmetic operators are defined; `checked` on add/subtract to fail loud on overflow.
* Percentage/multiplier maths goes through `Money.Scale(double)` which rounds
  *once*, half-away-from-zero, so repeated interest never drifts.

Float currency is banned. It is the single most common source of "my balance says
$99,999.99999" bugs in economy games.

---

## 6. Identity: `StableId`

```csharp
readonly struct StableId : IEquatable<StableId>   // wraps a validated string
```

* Format: `domain:name` — e.g. `vehicle_model:vx_aurora_gt`, `city:usa_vermillion_bay`,
  `district:vb_brickell_heights`, `npc:marina_dealer_01`.
* Charset `[a-z0-9_:]`, so IDs are safe in filenames, JSON keys and analytics.
* **Runtime instances** get a `RuntimeId` (GUID-backed `StableId` with `inst:` domain)
  minted once and persisted — e.g. the specific car the player owns, versus the
  *model* it is an instance of.
* Saves reference IDs only. A save from build 1.0 loads in build 1.4 as long as the
  IDs still resolve; unresolved IDs are collected into `SaveLoadReport.MissingIds`
  rather than throwing.

---

## 7. Events

`EventBus` is a typed, synchronous, allocation-conscious pub/sub.

```csharp
IDisposable sub = bus.Subscribe<MoneyChangedEvent>(OnMoneyChanged);
bus.Publish(new MoneyChangedEvent(...));   // struct event, no boxing on the hot path
```

* Handlers are stored per closed generic type — no dictionary lookup on `Type` at
  publish time beyond one, and no LINQ.
* Publishing during a publish is safe: the handler list is snapshotted into a pooled
  buffer, so subscribing/unsubscribing mid-dispatch cannot corrupt iteration.
* A handler that throws is caught, reported to `IEventBusErrorSink`, and does **not**
  abort the remaining handlers. One broken UI widget must not stop payroll.

Events are *notifications of fact*, never commands. `MoneyChangedEvent` says money
changed; it never asks anyone to change money.

---

## 8. Observed wealth — the signature system

NPCs never read `PlayerProfile.NetWorth`. They read `ObservedWealth`, produced by
`ObservedWealthCalculator` from a registry of `IObservedWealthSignal`s:

```
signals:  vehicle · outfit · watch · jewelry · residence · neighbourhood
          fame · social-media · known-businesses · venue-access · reputation

ObservedWealth = Blend(signals) where each signal contributes
                 (weight, impliedWealth, confidence)
```

The deliberate consequence: a player can look richer than they are (leased
supercar, $100k net worth → $1.5M observed) or poorer (quiet billionaire in a
sedan, $20M net worth → $2.5M observed). Both are *valid, interesting states*, and
the whole social layer keys off the observed figure.

`PresenceScore` is the same idea localised to a moment: observed wealth **plus**
context (which venue, what time, who is watching) → drives the NPC reaction
system.

---

## 9. World & streaming model

```
WorldLocationId  (StableId, domain "loc")
   loc:usa_vermillion_bay                      ← city
   loc:usa_vermillion_bay.brickell_heights     ← district (dot-scoped child)
```

* `CountryData → CityData → DistrictData → VenueData` is a pure data tree, authored
  as `ScriptableObject`s in the Unity layer and projected into immutable pure-C#
  records at load.
* A district maps to **an Addressables scene key**, never a hardcoded scene name.
  `IDistrictStreamer` (Phase 3) takes `WorldLocationId` → loads/unloads additively
  by distance and priority.
* Because the player's location is a `WorldLocationId` and not a `Transform`, the
  simulation runs identically whether the district is loaded, unloaded, or the
  player is mid-flight between continents.

---

## 10. Travel foundation

Travel is modelled as **quote → book → execute**, so that adding Dubai later is
content, not code:

```
ITravelService.GetQuotes(from, to)  → IReadOnlyList<TravelQuote>
                                      (mode, cash cost, duration, comfort,
                                       fame delta, requirements)
ITravelService.Book(quote)          → TravelTicket   (money debited, ID minted)
ITravelService.Execute(ticket)      → advances GameClock by duration,
                                      moves PlayerProfile.CurrentLocation,
                                      publishes PlayerArrivedEvent
```

`ITravelPricingModel` is injectable, so route pricing is tunable data (great-circle
distance × mode rate × class multiplier × demand) rather than a table of magic
numbers. `PlayerArrivedEvent` is what future systems (markets, businesses, NPCs,
events) subscribe to — none of them need to know *how* the player got there.

---

## 11. Save architecture

```
SaveGame  { int Version; string BuildId; long UtcTicks; Dictionary<string, SaveNode> }
                                                            ▲
                      each ISaveable contributes one node keyed by its SaveKey
```

* **Versioned.** `SaveVersion.Current`. A `ISaveMigration` chain upgrades
  `v(n) → v(n+1)`; `SaveMigrator` runs them in order. Never a `switch` on version
  scattered through loaders.
* **No scene serialization.** `ISaveable.Capture()` returns a plain DTO; `Restore()`
  rebuilds from it. Unity objects are re-instantiated from IDs.
* **Serializer and storage are injected** (`ISaveSerializer`, `ISaveStorage`). The
  shipped serializer is a small dependency-free JSON reader/writer over `SaveNode` —
  no third-party library, no reflection at load time, and exact `long` round-tripping so
  money never passes through a `double`. Storage is atomic file writes in the Unity layer
  and an in-memory pair in tests.
* **Forward-tolerant.** Unknown nodes are preserved verbatim through a load/save
  round-trip, so a save touched by a newer build is not silently destroyed.

---

## 12. Extension points already in place

These interfaces exist now so later phases are additive, not surgical:

| Interface | Added by | Consumed by |
|---|---|---|
| `IAssetValueProvider` | Vehicles, Properties, Businesses, Investments | `NetWorthService` |
| `ILiabilityProvider` | Loans, mortgages, credit | `NetWorthService` |
| `IObservedWealthSignal` | Vehicles, Outfits, Property, Fame | `ObservedWealthCalculator` |
| `IClockTickable` | every recurring system | `GameClock` |
| `ISaveable` | every persistent system | `SaveManager` |
| `ITravelPricingModel` | Travel tuning / difficulty | `TravelService` |
| `IWorldLocationCatalog` | World content packs | Travel, Streaming, Player |
| *(Game Director — Phase 6, not yet written)* | Rule-based director; LLM director later | World events |

The Game Director is **deliberately not written yet**. Declaring `IGameDirector` now,
with no implementation and no caller, would be speculative dead code; its design is
specified in `PRIVE_SYSTEMS.md` §15 and it plugs into seams that already exist — the
clock's tick events and `IEventBus`. When it lands it will be rule-based and
deterministic. No online model is ever a dependency of normal gameplay; an LLM-backed
implementation can be dropped in behind the same interface later.

---

## 13. Performance rules (mobile-first)

1. One `Update()` in the Unity layer (`GameLoopDriver`). Everything else ticks.
2. No allocation in per-minute or per-frame paths — event dispatch uses pooled buffers.
3. `struct` events, `readonly struct` value types (`Money`, `GameTime`, `StableId`).
4. No LINQ in runtime simulation code. (Tests and editor tooling may use it.)
5. Object pooling for NPCs, vehicles, VFX and UI list rows from day one.
6. Addressables for everything streamable; nothing large in the Bootstrap scene.
7. Integer/`long` maths for money; `double` only inside pricing models, rounded once.

---

## 14. Naming & conventions

* Namespaces mirror assemblies: `Prive.Core`, `Prive.Economy`, `Prive.Social`, …
* One public type per file, file named after the type.
* `I`-prefixed interfaces; `Data` suffix for immutable content records;
  `Service` suffix for stateful systems; `Event` suffix for bus messages.
* No magic numbers in systems — tuning values live in `ScriptableObject` configs or
  named constants (`EconomyTuning`, `DistanceTravelPricingModel`).
* Fictional brands only for the first city and its content. No real manufacturer names.
* **No digit separators in numeric literals.** Write `1000000`, never `1_000_000` — the
  compiler used by `Tools/verify.sh` mis-parses them, so the verified numbers would differ
  from the shipped ones. `verify.sh` fails the build if one reappears. See `Tools/README.md`.
* **Never derive a `static readonly` field from a field of an enclosing class.** A nested
  static class initialises on first touch of *its own* members, which can precede the outer
  class's field initialisers. Build such values from `const` (see `WorldLocations`), which
  has no initialisation order. This already caused one order-dependent failure.

---

## 15. Verification

```bash
Tools/verify.sh
```

Compiles each pure assembly **in dependency order, separately, with only its declared
references**, which also proves the assembly graph in section 2 is acyclic and complete —
the same guarantee Unity's asmdefs give, without opening the Editor. It then type-checks
the engine-facing assembly against minimal Unity stubs and runs the full core test suite.

Current state: **7 pure assemblies, 154 tests, green.**

This is the fast loop, not the authority — it proves nothing about serialization, prefabs,
scene wiring or runtime MonoBehaviour behaviour. The Unity Editor's Test Runner remains the
final check. See [`Tools/README.md`](Tools/README.md).
