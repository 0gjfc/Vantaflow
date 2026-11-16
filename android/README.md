# VantaFlow Android companion — architecture

The Android app is a separate application from the desktop app. They share **data and rules, not code**: the same JSON files in `../shared/` and the same data models, implemented in each app's own language.

## Status (Stage 3)

| Part | State |
|---|---|
| `core/` — models, compatibility engine, PS4/PS5 rules, detection | **Built and tested** here (plain Kotlin on the JVM; same code runs on Android) |
| `app/` — Android UI | **Designed below, not written.** No Android SDK is available in this environment, so no unverified UI code was added. |

```bash
cd android
gradle :core:test      # needs JDK 17+ and internet for Maven Central
```

`core` runs the same mock-console test vectors as the desktop (`tests/compat.test.mjs`), so both engines must give the same status for every scenario.

## Modules

```
android/
  core/                       Plain Kotlin, no Android dependency (org.json is built into Android)
    model/Models.kt           Shared models (mirror of js/models/index.js)
    compat/ReleaseData.kt     Researched GoldHEN / etaHEN data + lookups
    compat/CompatibilityEngine.kt
    platform/Ps4Rules.kt      PS4 models + GoldHEN rules   (separate on purpose)
    platform/Ps5Rules.kt      PS5 models + etaHEN rules    (separate on purpose)
    detection/Detection.kt    Provider interface, service, mock provider
  app/                        (planned) Jetpack Compose UI, depends on :core
```

`app` will bundle `../shared/` as assets (`sourceSets["main"].assets.srcDirs("../../shared")`) so it reads exactly the files the desktop reads.

## Planned screens (`app`)

| Screen | Shows | Uses |
|---|---|---|
| Discover | Consoles found by the active detection provider; "Add manually" | `DetectionService.list()` |
| Console | Connection, generation, model, firmware, GoldHEN/etaHEN status, last detection | `DetectionResult` |
| Compatibility | Status with every reason, supported / unsupported / not-verified features, requirements, limitations, data date | `CompatibilityEngine` |
| Profile switch | PS4 or PS5 profile, each with its own preferences | `CustomizationPrefs` per `Generation` |
| Customization | VantaFlow preferences (accent, highlight, background, animations) for the selected profile | `CustomizationPrefs` |
| Installation status | Read-only status of VantaFlow on a console (later stages; nothing is installed in Stage 3) | — |
| Errors | Recent `ErrorInfo` entries, with "Copy report" | `DetectionResult.errors` |

Design: the same colours and status colours as the desktop, from `../shared/design-tokens.json`.

## Data flow

```
DetectionProvider → DetectionService → DetectionResult → CompatibilityEngine(Ps4Rules | Ps5Rules) → screens
                                             │
                               DataStore (per-profile prefs, selected console, last results)
```

- **Persistence:** Jetpack DataStore, one store per profile (`ps4`, `ps5`), so profiles never mix.
- **Threads:** detection runs in coroutines on `Dispatchers.IO`, with socket timeouts inside providers.
- **Providers:** the mock provider first. Future providers follow `../docs/detection.md`: observe only, report evidence, and never treat an open port as proof of GoldHEN or etaHEN.

## Out of scope

No Y2JB, no exploit or payload execution, no package installation, no console changes. Any future console operation follows `../docs/safety-and-recovery.md`.
