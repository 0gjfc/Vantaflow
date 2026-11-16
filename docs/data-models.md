# Shared data models

Defined once and used by both apps:

- Desktop: `js/models/index.js` (factories that normalise input)
- Android: `android/core/src/main/kotlin/app/vantaflow/core/model/Models.kt` (data classes)
- Shared JSON: `shared/` (researched data, mock consoles, design tokens)

Both implementations apply the same rules: unknown enum values become `null` / `unknown`, missing objects become empty ones, and **nothing is verified unless the source says `verified: true`**. `tests/compat.test.mjs` and `android/core/src/test/.../SharedVectorsTest.kt` run the same mock consoles and must agree.

## ConnectionStatus
```json
{ "state": "connected | disconnected | unknown", "transport": "mock", "address": "192.168.1.24", "lastSeen": "2026-11-14T21:10:00Z" }
```

## ConsoleInfo
```json
{ "generation": "ps4 | ps5 | null", "model": "ps4-pro", "verified": true, "source": "mock" }
```
Model ids come from the platform modules (`js/platform/ps4/index.js`, `js/platform/ps5/index.js`).

## FirmwareInfo
```json
{ "version": "9.00", "verified": true, "source": "mock" }
```
Versions are `major.minor` with a two-digit minor (`9.00`, `10.01`). Anything else is treated as unknown.

## EnvironmentInfo (installed homebrew environment)
```json
{ "kind": "goldhen | etahen | null", "state": "active | absent | unknown", "version": "2.4b18",
  "verified": true, "source": "mock", "evidence": "optional text", "components": { "elfldr": true, "kstuff": false } }
```
`components`: `true` = reported present, `false` = reported missing, absent key = not reported.

## StorageDrive
```json
{ "name": "Internal", "total": 862, "holds": "ps4", "categories": { "Applications": 14.8, "System": 29.5 } }
```
`holds` names whose games are on the drive; the desktop adds a "Games" category from the installed titles.

## ErrorInfo
```json
{ "code": "timeout", "message": "No answer within 5 s.", "recoverable": true, "action": "Check that the console is on…", "at": "2026-11-16T13:51:08Z" }
```

## DetectionResult
`{ consoleId, connection, network, console, firmware, environment, storage[], detectedAt, errors[] }` — one per detection, with a timestamp.

## CompatibilityResult
```json
{ "status": "compatible | partial | unsupported | unknown | not-detected", "label": "Compatible",
  "reasons": [{ "status": "compatible", "code": "firmware-documented", "message": "GoldHEN 2.4b18 supports firmware 9.00 …" }],
  "environment": "GoldHEN", "release": "2.4b18",
  "supported": ["Plugins", "…"], "unsupported": [{ "label": "…", "why": "…" }], "unverified": [{ "label": "…", "why": "…" }],
  "requirements": ["…"], "limitations": ["…"], "dataVerified": "2026-11-16", "sources": [], "evaluatedAt": "…" }
```
Every check adds a reason; the worst reason decides `status`.

## Customization preferences
Per console profile (PS4 and PS5 are kept apart). Desktop: `DEFAULTS` in `js/core/settings.js`, stored as `vantaflow.settings.ps4` / `vantaflow.settings.ps5`. Android mirrors a subset (`CustomizationPrefs`): accent, highlight, background mode, animations, reflections. Per-profile storage also holds favourites (`vantaflow.favorites.<profile>`), the custom background (`vantaflow.background.<profile>`) and the selected console (`vantaflow.console.<profile>`).

## Adding a console model or environment

- **New model** (e.g. a future PS5 revision): add it to `MODELS` in `js/platform/ps5/index.js` and `PS5_MODELS` in `Ps5Rules.kt`.
- **New release** of GoldHEN or etaHEN: add it to `shared/compatibility/*.json` with its evidence and date, then run `node tools/build-docs.mjs` and both test suites.
- **New generation or environment**: add a platform module next to `ps4/` and `ps5/` with its own models and `assess()` rules, register it in `js/platform/index.js` (and as `PlatformRules` on Android). The engine itself does not change.
