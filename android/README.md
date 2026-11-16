# VantaFlow Android companion — architecture

The Android app is a separate application from the desktop app. They share **data and rules, not code**: the same JSON files in `../shared/` and the same data models, implemented in each app's own language.

## Status (Stage 4)

| Part | State |
|---|---|
| `core/` — models, compatibility engine, PS4/PS5 rules, mock detection | **Built and tested** (plain Kotlin on the JVM; the same code runs on Android) |
| `core/` — Stage 4 read-only detection: DDP protocol, separate `Ps4Provider` / `Ps5Provider`, discovery, address rules, saved consoles | **Built and tested** against fake consoles on 127.0.0.1 (`ConnectivityTest`). **Not tested with a physical console.** |
| `app/` — companion screens (Jetpack Compose) | **Written, not compiled.** The development environment has no Android SDK (its download was not allowed there), so this code has never been built or run. Open `android/` in Android Studio to build it. |

```bash
cd android
gradle :core:test      # JDK 17+, internet for Maven Central: 14 tests (SharedVectorsTest, ConnectivityTest)
```

`:app` is included only when an Android SDK is set up (Android Studio writes `local.properties`; on the command line set `ANDROID_HOME`), so `gradle :core:test` works without one.

## Modules

```
android/
  core/                         Plain Kotlin, no Android dependency (org.json is built into Android)
    model/Models.kt             Shared models (mirror of js/models/index.js), HenStatus, ProviderReport
    compat/                     Researched GoldHEN / etaHEN data, CompatibilityEngine
    platform/Ps4Rules.kt        PS4 models + GoldHEN rules   (separate on purpose)
    platform/Ps5Rules.kt        PS5 models + etaHEN rules    (separate on purpose)
    detection/Detection.kt      Provider interface, service, mock provider
    detection/Ddp.kt            PlayStation Device Discovery Protocol (format only)
    detection/Lan.kt            UDP transport, address rules, discovery, provider report
    detection/Ps4Provider.kt    PS4: SRCH on UDP 987        (separate on purpose)
    detection/Ps5Provider.kt    PS5: SRCH on UDP 9302       (separate on purpose)
    detection/LanConsoles.kt    Saved consoles: add, connect, disconnect, remove
  app/                          Jetpack Compose companion (depends on :core, bundles ../shared as assets)
    ConsolesModel.kt            State and actions; network work on Dispatchers.IO through :core
    MainActivity.kt             Screens and dialogs
```

## Companion screens (`app`, Stage 4)

| Screen / dialog | Shows and does |
|---|---|
| Consoles | **Your consoles** (Discover consoles…, Add by IP address…, saved consoles with status and compatibility) and **Demo consoles**, labelled as demonstration data. The top bar shows the active console. |
| Discovery consent | Explains exactly what is sent and collected before anything is sent. **Search** or **Cancel**. |
| Discovery results | The consoles that answered (name, PS4/PS5, address, power). Only the one the user picks is saved. |
| Add by IP address | Typed IPv4 address. Non-local addresses are refused. An address that does not answer is saved as "not identified". |
| Console | IP address, generation (verified or last known), model (not available), firmware (verified / not confirmed / not available), connection, power, GoldHEN/etaHEN status, compatibility, last successful check, last detection; verified fields, unavailable fields with reasons, errors, why the status, method. **Connect / Disconnect, Refresh, Make active, Remove.** Demo consoles: **Use console, Detect again.** |
| Errors and results | A dialog after each action: answered, no answer (with the provider's message), invalid address, not connected. |

Design: the same colours and status colours as the desktop, from `../shared/design-tokens.json`. Wording matches the desktop Consoles page. Detection rules, sources and limits: [`../docs/connectivity.md`](../docs/connectivity.md).

Planned for later stages (not built): profile switch, customization, installation status.

## Data flow

```
DetectionProvider → DetectionService → DetectionResult → CompatibilityEngine(Ps4Rules | Ps5Rules) → screens
                                             │
                               DataStore (per-profile prefs, selected console, last results)
```

- **Persistence:** saved consoles and the active console in SharedPreferences (Stage 4). Planned: one store per console profile (`ps4`, `ps5`) so console preferences never mix, plus one account store that is shared unless separate accounts are on (same rule as the desktop).
- **Threads:** detection runs in coroutines on `Dispatchers.IO`, with socket timeouts inside providers.
- **Providers:** the mock provider for demo consoles, and the read-only PS4 / PS5 DDP providers for the user's own consoles. All providers follow `../docs/detection.md`: observe only, report evidence, and never treat an open port as proof of GoldHEN or etaHEN.
- **Permissions:** `INTERNET` only (needed for any socket). No location or account permission.

## Out of scope

No Y2JB, no exploit or payload execution, no package installation, no console changes. Any future console operation follows `../docs/safety-and-recovery.md`.
