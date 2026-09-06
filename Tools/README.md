# Tools

## `verify.sh` — editor-free compile and test

```bash
Tools/verify.sh
```

Does four things, in order:

1. **Reads every `.asmdef`** under `Assets/PRIVE` and builds the assembly dependency graph.
2. **Lints numeric literals** (see below).
3. **Compiles each engine-free assembly separately, in topological order**, with only its
   declared references. Because nothing is compiled with a reference it did not declare, a
   successful run proves the graph in `PRIVE_ARCHITECTURE.md` is acyclic and complete — the
   same guarantee Unity's asmdefs give, without opening the Editor. Engine-dependent
   assemblies are then type-checked against `CoreVerify/UnityStubs.cs`.
4. **Compiles and runs the EditMode tests** against a small NUnit shim.

Exit code is non-zero on any failure, so it drops straight into CI or a pre-commit hook.

### Requirements

A C# compiler on `PATH` — `mcs`, `csc` or `dotnet`. On Debian/Ubuntu:

```bash
apt-get install -y mono-devel
```

### What it does and does not prove

| Proves | Does not prove |
|---|---|
| The simulation compiles | That the project opens cleanly in Unity |
| The assembly graph is acyclic and complete | Serialization, prefab or scene wiring |
| All core logic tests pass | Runtime behaviour of MonoBehaviours |
| Engine-facing code has valid signatures | Platform paths, execution order, performance |

The engine-dependent line in the output is marked `ok*` for exactly this reason. The Unity
Editor's Test Runner remains the authority; this is the fast loop.

---

## Numeric literals: no digit separators

**`1_000_000` is banned in this project. Write `1000000`.**

The Mono compiler this script uses mis-parses C# digit separators: it duplicates the digit
following each underscore, so `1_000_000` compiles as `100000000` and `19_999` as `199999`.
Roslyn — and therefore Unity — parses them correctly, and *that is the danger*: the numbers
verified here would silently differ from the numbers that ship, in a game whose entire
progression is money. Plain digits compile identically under both compilers.

`verify.py` fails the run if a separator reappears, so this cannot regress by accident.

---

## Files

| File | Purpose |
|---|---|
| `verify.sh` | Thin wrapper; the entry point |
| `verify.py` | Graph discovery, lint, compilation, test run |
| `CoreVerify/NUnitShim.cs` | The slice of NUnit the core tests use, for running outside Unity |
| `CoreVerify/TestRunner.cs` | Reflection-based runner for those tests |
| `CoreVerify/UnityStubs.cs` | Minimal `UnityEngine` signatures, for type-checking the glue layer |
| `build/` | Compiler output (git-ignored) |

The shim and stubs are **only** compiled by this script. Unity never sees them — they live
outside `Assets/`, so the Editor uses the real NUnit and the real engine.

Add to the shim or stubs only what the code actually starts using, and keep every signature
identical to the real API.
