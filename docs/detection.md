# Console detection architecture

Stage 3 built the detection pipeline with a mock provider. Stage 4 adds read-only providers for the user's own PS4 and PS5 on the local network (PlayStation Device Discovery Protocol). The protocol, its sources, the privacy rules and the limits are in [connectivity.md](connectivity.md). The mock provider stays for the demonstration consoles.

## Pipeline

```
DetectionProvider ──raw JSON──▶ DetectionService ──DetectionResult──▶ Compatibility engine ──▶ UI
(demo + lan)                    timeout, errors,                      platform rules (PS4/PS5)
                                timestamps, cache
```

| Piece | Desktop | Android |
|---|---|---|
| Provider interface | `list()`, `detect(id)`, `name` (see below) | `DetectionProvider` in `android/core/.../detection/Detection.kt` |
| Service | `js/detection/service.js` | `DetectionService` (same file) |
| Mock provider | `js/detection/mock-provider.js` | `MockDetectionProvider` |
| Mock data | `shared/mock-consoles.json` | the same file, bundled as an asset |
| Real consoles (Stage 4) | `js/detection/lan-provider.js` → local agent `desktop/server.mjs` → `desktop/agent/providers/ps4.mjs`, `ps5.mjs` | `LanConsoles`, `Ps4Provider`, `Ps5Provider` |
| Provider report | `report` in each result: provider, method, attempted, unavailable | `ProviderReport`, `ProbeReport` |

## Provider contract

A provider answers two questions:

- `list()` → the consoles it knows: `{ id, label, scenario, generation }`.
- `detect(id)` → one raw detection in the shape of a `detection` entry in `shared/mock-consoles.json`.

Rules every provider must follow:

1. **Observe only.** No exploits, no payloads, no file writes, no settings changes, no package installs, nothing that changes the console's state.
2. **Report evidence, not conclusions.** Each field carries `verified` and `source`. If the provider only guessed a value, it sets `verified: false` and explains it in `evidence`.
3. **An open network port is never proof.** A port answering where GoldHEN's FTP (2121) or etaHEN's FTP (1337) usually listens can be any program. A provider may report it as `source: "network-probe"` with `verified: false`; the compatibility engine then returns **Unknown**, never Compatible. The mock scenario "Garage PS4 (port scan only)" tests exactly this.
4. **Fail softly.** Throw with a `code` (`timeout`, `not-found`, …). The service turns any failure into a result with `connection.state = "unknown"` and a recoverable error, which the engine reports as **Not detected**.
5. **Never decide compatibility.** Providers return facts; only the engine decides.
6. **Say what you cannot do.** A check with no documented read-only method sets `environment.state = "unsupported-method"` and lists the field in `report.unavailable` with a reason. It never fills in a guess.

## What a result can identify

| Question | Field | Demo consoles | Real console (Stage 4, DDP) |
|---|---|---|---|
| Is a console connected? | `connection.state`, `connection.lastSeen` | mock | **verified**: the console answered |
| PS4 or PS5? | `console.generation` | mock | **verified**: host-type + protocol version |
| Console name | `console.name` | — | reported by the console |
| Power state | `network.power` | — | **verified**: on / rest mode |
| Which model? | `console.model` | mock | not available |
| Firmware version | `firmware.version`, `firmware.raw` | mock | PS4: verified below 10.00, unconfirmed above; PS5: raw value only |
| Homebrew environment present? | `environment.state` | mock | `unsupported-method` |
| GoldHEN / etaHEN and version | `environment.kind`, `environment.version` | mock | not available |
| Parts etaHEN needs (ELF loader, kstuff) | `environment.components` | mock | not available |
| Drives and usage | `storage` | mock | not available |

## Possible future providers (not built)

Each needs its own research and the user's explicit consent before it is added.

- **Manual model and firmware entry.** The user types the model and firmware. The values would be `source: "user"` and `verified: false`, so the engine could still only say Unknown. (Manual *IP* entry exists since Stage 4.)
- **On-console companion app.** A small VantaFlow homebrew app the user installs and starts themselves, which reports system version, model and homebrew status over a documented, authenticated local connection. This is the only route found that could report **verified** values without probing. It would itself need GoldHEN or etaHEN, so it is a later-stage decision.

Not allowed in any stage: exploit-based detection, sending payloads to find out what is running, logging in to accounts, or bypassing authentication or DRM.
