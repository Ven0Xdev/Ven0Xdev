# PRIVÉ — Development Roadmap

Phases are ordered by **dependency**, not by excitement. Each phase ends with a
green `Tools/verify.sh` and a working Editor project. Nothing is left half-wired.

---

## Phase 0 — Project foundation ✅ **COMPLETE**

* Repo scaffolded as a Unity project (`Assets/PRIVE/…`, `Packages/`, `ProjectSettings/`).
* Assembly graph defined via `.asmdef`, with pure-C# simulation assemblies
  (`noEngineReferences: true`).
* Architecture, systems and roadmap documentation.
* Editor-free compile + test harness (`Tools/verify.sh`).

---

## Phase 1 — Simulation foundations ✅ **COMPLETE**

The systems every later phase depends on.

| Deliverable | Status |
|---|---|
| `StableId` + runtime instance IDs | ✅ |
| `Money` (integer minor units, checked maths) | ✅ |
| `GameTime` + `GameClock` + `IClockTickable` | ✅ |
| `EventBus` (typed, reentrancy-safe, error-isolated) | ✅ |
| `ServiceRegistry` / `GameContext` composition root | ✅ |
| `PlayerWallet`, `TransactionLedger` | ✅ |
| `NetWorthService` + `IAssetValueProvider` / `ILiabilityProvider` | ✅ |
| `RecurringCashflow` (daily/weekly/monthly) | ✅ |
| `SocialStatus` (fame, reputation, influence, lifestyle) | ✅ |
| `ObservedWealthCalculator` + `IObservedWealthSignal` | ✅ |
| `PresenceScore` | ✅ |
| World location model + Vermillion Bay catalog | ✅ |
| Travel foundation (quote → book → execute) | ✅ |
| Save architecture (versioned, migrations, forward-tolerant) | ✅ |
| `PlayerProfile` aggregate | ✅ |
| Unity bootstrap layer (`GameBootstrap`, `GameLoopDriver`, SO catalogs, JSON save) | ✅ |
| EditMode test suite over all of the above | ✅ |

**Exit criteria met:** clock ticks drive cashflow; money moves through the wallet
and ledger; net worth aggregates from providers; the player has a location and can
be quoted, booked and flown to another one; the whole state saves, migrates and
reloads. All verified outside the Editor.

---

## Phase 2 — First money loop: vehicles & dealership ⬜ **NEXT**

Goal: *the player can make money.* This is the phase that makes PRIVÉ a game.

1. `Prive.Vehicles` assembly: `VehicleModelData`, `VehicleInstance`,
   `VehicleValuation` (condition × mileage × rarity × market × mods), `Garage`.
2. Fictional brand catalogue (~40 models across Economy → Hypercar) as
   `ScriptableObject`s projected to pure records.
3. `VehicleCatalog` implements `IAssetValueProvider` + `IObservedWealthSignal` +
   `ISaveable` — first real proof that the Phase 1 registries work.
4. `Prive.Business` assembly with `IBusiness`; `DealershipBusiness` as first impl.
5. Buy / appraise / price / sell loop with NPC customer demand and a negotiation
   foundation.
6. Economy tuning pass against the $5k → $25k → $100k → $1M curve.
7. Tests: valuation, depreciation, dealership margin, tuning-curve regression.

**Exit criteria:** starting from $5,000, a competent player reaches $100,000 through
vehicle flipping alone, and every dollar is visible in net worth and the ledger.

---

## Phase 3 — The playable city ⬜

1. `Prive.Unity` streaming: `IDistrictStreamer` over Addressables, distance +
   priority budgeted.
2. Greyboxed Vermillion Bay: Downtown, Financial District, South Shore, Luxury
   District, Marina — placeholder art, correct scale and layout.
3. Player controller: on-foot + vehicle, enter/exit, mobile-ready input abstraction.
4. Arcade-leaning vehicle handling (feel first, simulation second).
5. `Prive.Phone`: `PhoneShell` + `IPhoneApp`, with Bank, Map, Vehicles and Travel apps.
6. Apartment interior, dealership interior, one luxury venue.
7. Performance pass on a mid-range Android device: frame budget, memory, load times.

**Exit criteria:** drive from the apartment to the dealership through streamed
districts on a phone, at a stable frame rate.

---

## Phase 4 — Wealth engines ⬜

1. `Prive.Property`: apartments → penthouses → mansions; rent, upkeep, garages,
   prestige.
2. `Prive.Business` expansion: nightclub, restaurant, luxury store, rental, charter.
   Employees, upgrades, reputation, valuation.
3. `Prive.Investments`: `MarketSimulationManager`, price history, sentiment, news
   and market events; stocks, crypto, memecoins, startups.
4. Phone apps: Stocks, Crypto, Properties, Businesses, News.
5. Loans, mortgages, credit profile → `ILiabilityProvider` gets real work to do.
6. Tests: revenue models, market simulation bounds, portfolio valuation, interest.

**Exit criteria:** three independent income systems (vehicles, property/business,
investments) all feeding one net worth, and $1M is reachable by more than one route.

---

## Phase 5 — A world that reacts ⬜

1. `Prive.NPC`: three-tier NPC architecture, pooled ambient crowds, schedules,
   utility AI for named NPCs.
2. `SocialReactionSystem` driven by `PresenceScore`: glance → phone → photograph →
   approach → opportunity → VIP access → refusal.
3. Paparazzi, sightings, `MediaPost`, social feed app, trending.
4. Venue access tiers, guest lists, exclusive events.
5. Relationships, contacts, and the first key characters.
6. Wardrobe, watches, jewellery → the remaining `IObservedWealthSignal`s.

**Exit criteria:** arriving at a marina club in a hypercar produces a visibly
different world response than arriving in a hatchback — and a social post the next
morning.

---

## Phase 6 — Direction & depth ⬜

1. Rule-based `IGameDirector`: opportunity pacing from wealth velocity, fame and
   recent behaviour.
2. World events: auctions, launches, parties, conferences, rare listings.
3. Dynamic opportunities tuned to player progress.
4. Optional: an LLM-backed director behind the same interface, strictly non-essential.

---

## Phase 7 — International ⬜

1. Second city as a full streamed world package (Dubai-inspired first).
2. Travel content: commercial classes, charter marketplace, owned jets, helicopters,
   yachts; airport interiors and flows.
3. Location-dependent markets, businesses, NPCs, events and fame.
4. Country unlock rules, timezones, currencies.

**This phase should add content and one streaming package — not architecture.**
If it requires reworking Phase 1 contracts, Phase 1 was wrong.

---

## Phase 8 — First Playable Milestone (vertical slice) ⬜

Integrates Phases 1–5 into the demonstrable fantasy:

> Wake in the apartment → take the starter car → drive through streamed Vermillion
> Bay → visit the dealership → flip a vehicle → check the phone → invest → arrive at
> a luxury venue → get noticed and photographed → drive home → save.

---

## Phase 9 — Polish & platform ⬜

Art direction pass (neon nightlife, glass towers, ocean, palms), audio, UI polish for
multiple aspect ratios, touch control scheme, iOS/Android build pipeline, save
migration hardening, analytics, storefront.

---

## Cross-cutting, every phase

* `Tools/verify.sh` green before any commit (currently 7 assemblies, 154 tests).
* New system → new tests for its maths.
* New architecture decision → update `PRIVE_ARCHITECTURE.md` in the same commit.
* New content system → implements `IAssetValueProvider` / `IObservedWealthSignal` /
  `ISaveable` / `IClockTickable` as applicable, and registers itself. It never edits
  the aggregator.
* Mobile frame and memory budget checked at the end of each phase, not at the end of
  the project.

---

## Risk register

| Risk | Mitigation |
|---|---|
| Scope explosion (this is a very large design) | Strict phase gates; content systems only after their registry exists |
| Mobile performance collapse late in development | Streaming and pooling in Phase 3, budget checks every phase |
| Save incompatibility as systems land | Versioned saves + migration chain from Phase 1, forward-tolerant nodes |
| Economy grind or runaway inflation | Tuning curve is a regression test, not a vibe |
| Real-brand / real-city IP exposure | Fictional brands and a fictional city from day one |
| Architecture rot under delivery pressure | Assembly boundaries are compiler-enforced, not conventions |
