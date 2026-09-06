# Unity packages — status and known risk

**Editor version:** `6000.0.32f1` (`ProjectSettings/ProjectVersion.txt`)

## Read this before opening the project

The `Packages/manifest.json` version strings in this repository have **never been
resolved against Unity's package registry.** The development environment this project was
scaffolded in has no Unity install and no network access to `packages.unity.com`, so every
pin below is an educated guess, not a verified fact.

A version that does not exist is a hard resolution error on first open, not a warning. If
the Package Manager reports one, the fix is thirty seconds of work — see *Recovery* below —
but you should expect it rather than be surprised by it.

## Current dependencies

| Package | Pinned | Confidence | Why it is here |
|---|---|---|---|
| `com.unity.render-pipelines.universal` | `17.0.3` | Medium — 17.0.x is the Unity 6000.0 line | Render pipeline is an early, expensive-to-reverse decision. Mobile-first means URP. |
| `com.unity.test-framework` | `1.4.5` | Medium — 1.4.x is current for Unity 6 | Required now: the EditMode suite depends on it. |
| `com.unity.ugui` | `2.0.0` | High — 2.0.0 is the Unity 6 version, and it bundles TextMeshPro | UI, and TMP comes with it. |
| `com.unity.modules.*` | `1.0.0` | High — built-in modules are always `1.0.0` | Engine modules actually used or imminently needed. |

## Deliberately removed

| Package | Reason |
|---|---|
| `com.unity.modules.unityanalytics` | The built-in analytics module was removed from the engine after Unity 2022; analytics moved to the separate `com.unity.services.analytics` package. On Unity 6 this entry is expected to fail to resolve. Nothing in the project used it. |
| `com.unity.addressables` | Not used until Phase 3 (district streaming). |
| `com.unity.cinemachine` | Not used until Phase 3 (cameras). |
| `com.unity.inputsystem` | Not used until Phase 3 (player control). |

The last three were dropped on the same principle: **a package you are not using yet is
pure resolution risk with zero benefit.** Adding them later through the Package Manager UI
is strictly better than guessing a version now, because the Package Manager picks a version
that is actually compatible with the installed Editor.

## Recovery — if a package fails to resolve

1. Delete the offending line from `Packages/manifest.json`.
2. Open the project. Unity resolves the rest and generates `Packages/packages-lock.json`.
3. **Window → Package Manager → Unity Registry**, find the package, **Install**.
4. Commit the updated `manifest.json` *and* `packages-lock.json`. The lock file is the
   record of what actually resolved, which is what this document is standing in for until
   someone opens the Editor.

## Adding the deferred packages (Phase 3)

Install through the Package Manager rather than hand-editing versions:

* **Addressables** — district streaming (`IDistrictStreamer`, `DistrictData.SceneAddress`).
* **Cinemachine** — vehicle and on-foot cameras.
* **Input System** — touch controls for iOS/Android, keyboard/mouse in the Editor.

Once `packages-lock.json` exists and is committed, this document's job is done; keep it only
as the record of why `unityanalytics` was removed.
