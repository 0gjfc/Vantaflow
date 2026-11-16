# VantaFlow Android companion — architecture

The Android app is a separate application from the desktop app. They share **data and rules, not code**: the same JSON files in `../shared/` and the same data models, implemented in each app's own language.

## Status (Stage 4.1)

| Part | State |
|---|---|
| `core/` — models, compatibility engine, PS4/PS5 rules, mock detection | **Compiles; tests pass** (plain Kotlin on the JVM; the same code runs on Android) |
| `core/` — read-only detection: DDP protocol, separate `Ps4Provider` / `Ps5Provider`, discovery, address rules, saved consoles | **Compiles; tests pass** against fake consoles on 127.0.0.1 (`ConnectivityTest`, 13 tests). **Not tested with a physical console.** |
| `app/` — companion screens (Jetpack Compose) | **Compiles** (`assembleDebug` produces `app-debug.apk`). **Screen tests pass** (`ScreensTest`, 6 Robolectric tests against fake consoles, using the shared JSON as app assets). **Not yet run on a phone or with a physical console.** |

Unsupported detection features are labelled the same way as on the desktop: Model "Not available", PS5 firmware "Not available", GoldHEN / etaHEN "Unsupported detection method". The app never claims GoldHEN or etaHEN detection.

## Install & recovery (Stage 5)

The **Install & recovery** screen is at the end of "Your consoles". It covers:

- **Update from an APK file:** VantaFlow checks the file first (same app, same signing key, newer version, Android version). It explains the "Install unknown apps" permission, backs up the settings, and hands the APK to Android's `PackageInstaller`, which always shows its own confirmation. Success is reported only when Android reports the new version.
- **Backups:** back up the saved consoles and the active console; restore them only from a verified backup, with a read-back check; delete a backup.
- **Recovery:** finds an update that did not finish (even if Android replaced the app meanwhile) and closes it without touching settings.
- **Cleanup:** removes VantaFlow's own APK copies and unfinished installer sessions, after a preview.

Code:

- `core/setup/` holds the rules: `Backups.kt`, `Apk.kt`, `Journal.kt`, `Cleanup.kt` (JVM tests: `SetupTest`).
- `app/` holds the Android parts: `Installer.kt` (PackageInstaller), `SetupModel.kt`, `SetupScreen.kt` (Robolectric tests with a **simulated** installer: `SetupScreenTest`).

The only new permission is `REQUEST_INSTALL_PACKAGES`, which Android grants only after you allow it. The app has **not yet installed a real update on a phone**; to try it, install an older debug build, then update it with a newer APK signed with the same key. See [`../docs/installation.md`](../docs/installation.md).

## Build and install

Requirements: JDK 17 or later and the Android SDK (platform 35). Android Studio installs both. Gradle comes with the project (`gradlew`, Gradle 8.14.3). Plugin versions: Android Gradle Plugin 8.7.3, Kotlin 2.0.21. The first build downloads dependencies from Google's Maven repository and Maven Central.

**Android Studio:** *File → Open* → the `android/` folder. Studio writes `local.properties` with the SDK path, which adds the `:app` module. Then *Run ▶* on a phone or emulator.

**Command line:**

```bash
cd android
export ANDROID_HOME=$HOME/Android/Sdk               # or: echo "sdk.dir=/path/to/sdk" > local.properties
./gradlew :app:assembleDebug                         # → app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

The SDK can also be installed without Android Studio, from the command-line tools (Linux example, which was used to build and test this project):

```bash
mkdir -p ~/android-sdk/cmdline-tools && cd ~/android-sdk/cmdline-tools
curl -O https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
unzip commandlinetools-linux-11076708_latest.zip && mv cmdline-tools latest
yes | latest/bin/sdkmanager --licenses
latest/bin/sdkmanager "platforms;android-35" "build-tools;34.0.0" "platform-tools"
export ANDROID_HOME=~/android-sdk
```

**Tests:**

```bash
./gradlew :core:test                 # 23 tests, no Android SDK needed
./gradlew :app:testDebugUnitTest     # 17 screen tests (Robolectric, no emulator); screenshots in app/build/screenshots/
```

The app needs only the `INTERNET` permission (for any socket). On the phone, use the same Wi-Fi network as the console; guest networks usually block discovery. Physical tests to run: [`../docs/physical-testing.md`](../docs/physical-testing.md) §4.

**Build fixes in Stage 4.1:**

- Plugin versions are declared once in the root `build.gradle.kts`, so the Kotlin plugin is no longer loaded separately by `:core` and `:app`.
- Repositories are declared in `settings.gradle.kts`.
- `android.useAndroidX=true` is set in `gradle.properties`.
- `org.json` is compile-only in `:core`, because Android has it built in; the APK contains no second copy.
- The screens share one themed root (`VantaFlowApp`), so dialogs use VantaFlow's colours.

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
    MainActivity.kt             Theme (VantaFlowApp), screens and dialogs
    src/test/…/ScreensTest.kt   Robolectric screen tests with fake consoles
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
