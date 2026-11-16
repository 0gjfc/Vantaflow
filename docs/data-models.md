# Shared data models

Defined once and used by both apps:

- Desktop: `js/models/index.js` (factories that normalise input)
- Android: `android/core/src/main/kotlin/app/vantaflow/core/model/Models.kt` (data classes)
- Shared JSON: `shared/` (researched data, mock consoles, design tokens)

Both implementations apply the same rules: unknown enum values become `null` / `unknown`, missing objects become empty ones, and **nothing is verified unless the source says `verified: true`**. `tests/compat.test.mjs` and `android/core/src/test/.../SharedVectorsTest.kt` run the same mock consoles and must agree.

## ConnectionStatus
```json
{ "state": "connected | disconnected | unknown", "transport": "mock | ddp-udp", "address": "192.168.1.24", "lastSeen": "2026-11-14T21:10:00Z" }
```
For real consoles, `connected` means the console answered the last discovery request; `disconnected` means the user turned contact off.

## NetworkStatus
```json
{ "state": "online | offline | unknown", "power": "on | standby | unknown" }
```
`power` comes from the console's own discovery reply (200 = on, 620 = rest mode).

## ConsoleInfo
```json
{ "generation": "ps4 | ps5 | null", "model": "ps4-pro", "name": "Living room PS4", "verified": true, "source": "mock | ddp | last-known" }
```
`name` is the console's own name, when it reports one. Real consoles never report `model` (see [connectivity.md](connectivity.md)).
Model ids come from the platform modules (`js/platform/ps4/index.js`, `js/platform/ps5/index.js`).

## FirmwareInfo
```json
{ "version": "9.00", "raw": "09008001", "verified": true, "source": "mock | ddp" }
```
`raw` is the value as reported, before decoding (the DDP `system-version`).
Versions are `major.minor` with a two-digit minor (`9.00`, `10.01`). Anything else is treated as unknown.

## EnvironmentInfo (installed homebrew environment)
```json
{ "kind": "goldhen | etahen | null", "state": "active | absent | unknown | unsupported-method", "version": "2.4b18",
  "verified": true, "source": "mock", "evidence": "optional text", "components": { "elfldr": true, "kstuff": false } }
```
`components`: `true` = reported present, `false` = reported missing, absent key = not reported.
`unsupported-method`: the console is connected but no documented read-only method can check the environment (every real console in Stage 4).

**Homebrew status shown to the user** (`henStatus(d)` / `HenStatus.of(d)`): Verified installed (active + verified) · Verified not installed (absent + verified) · Unknown · Not detected (not connected) · Unsupported detection method.

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
`{ consoleId, connection, network, console, firmware, environment, storage[], detectedAt, errors[], report }` — one per detection, with a timestamp.

## ProviderReport (Stage 4)
```json
{ "provider": "ps4-ddp", "method": "PlayStation Device Discovery Protocol: SRCH request on UDP 987 (read-only)",
  "attempted": ["DDP SRCH (protocol 00020020) to 192.168.1.20:987"],
  "unavailable": [{ "field": "model", "reason": "The DDP reply does not say …" }] }
```
What the provider tried and what it could not get. Demo consoles have `provider: "mock"` and a method saying that no console was contacted.

## CompatibilityResult
```json
{ "status": "compatible | partial | unsupported | unknown | not-detected", "label": "Compatible",
  "reasons": [{ "status": "compatible", "code": "firmware-documented", "message": "GoldHEN 2.4b18 supports firmware 9.00 …" }],
  "environment": "GoldHEN", "release": "2.4b18",
  "supported": ["Plugins", "…"], "unsupported": [{ "label": "…", "why": "…" }], "unverified": [{ "label": "…", "why": "…" }],
  "requirements": ["…"], "limitations": ["…"], "dataVerified": "2026-11-16", "sources": [], "evaluatedAt": "…" }
```
Every check adds a reason; the worst reason decides `status`.

## Customization preferences and account
Two parts, kept apart on purpose:

- **Console preferences — always per console** (PS4 and PS5 never mix). Desktop: `DEFAULTS` in `js/core/settings.js` minus the account keys, stored as `vantaflow.settings.ps4` / `vantaflow.settings.ps5`, plus favourites (`vantaflow.favorites.<profile>`), the custom background (`vantaflow.background.<profile>`) and the selected console (`vantaflow.console.<profile>`). Android: `CustomizationPrefs` (accent, highlight, background mode, animations, reflections).
- **VantaFlow account — shared by default.** `username`, `avatarColor`, `presence` (`ACCOUNT_KEYS`). Stored in `vantaflow.account.shared`; when `vantaflow.accounts.separate` is `true` (Profile → *Separate PS4 and PS5 profiles*), in `vantaflow.account.ps4` / `vantaflow.account.ps5` instead. Turning it on starts each console from the current account; turning it off makes the current account the shared one. Android: `AccountPrefs` and `Profiles.accountFor(generation)`.

```json
{ "separateAccounts": false, "shared": { "username": "Player One", "avatarColor": "#1d86f0", "presence": "online" },
  "perConsole": { "ps5": { "username": "PS5_Player" } }, "consoles": { "ps4": { "accent": "#1d86f0" }, "ps5": { "accent": "#22b07d" } } }
```

## Adding a console model or environment

- **New model** (e.g. a future PS5 revision): add it to `MODELS` in `js/platform/ps5/index.js` and `PS5_MODELS` in `Ps5Rules.kt`.
- **New release** of GoldHEN or etaHEN: add it to `shared/compatibility/*.json` with its evidence and date, then run `node tools/build-docs.mjs` and both test suites.
- **New generation or environment**: add a platform module next to `ps4/` and `ps5/` with its own models and `assess()` rules, register it in `js/platform/index.js` (and as `PlatformRules` on Android). The engine itself does not change.
