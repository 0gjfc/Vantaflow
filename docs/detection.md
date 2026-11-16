# Console detection architecture

Stage 3 builds the detection pipeline and runs it with a **mock provider only**. Nothing in VantaFlow connects to a real console yet.

## Pipeline

```
DetectionProvider ──raw JSON──▶ DetectionService ──DetectionResult──▶ Compatibility engine ──▶ UI
(mock today)                    timeout, errors,                      platform rules (PS4/PS5)
                                timestamps, cache
```

| Piece | Desktop | Android |
|---|---|---|
| Provider interface | `list()`, `detect(id)`, `name` (see below) | `DetectionProvider` in `android/core/.../detection/Detection.kt` |
| Service | `js/detection/service.js` | `DetectionService` (same file) |
| Mock provider | `js/detection/mock-provider.js` | `MockDetectionProvider` |
| Mock data | `shared/mock-consoles.json` | the same file, bundled as an asset |

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

## What a result can identify

| Question | Field | Today |
|---|---|---|
| Is a console connected? | `connection.state`, `connection.lastSeen` | mock |
| PS4 or PS5? | `console.generation` | mock |
| Which model? | `console.model` (ids from `js/platform/ps4|ps5/index.js`) | mock |
| Firmware version | `firmware.version` | mock |
| Network status | `network.state` | mock |
| Homebrew environment present? | `environment.state` (`active`/`absent`/`unknown`) | mock |
| GoldHEN / etaHEN and version | `environment.kind`, `environment.version` | mock |
| Parts etaHEN needs (ELF loader, kstuff) | `environment.components` | mock |
| Drives and usage | `storage` | mock |

## Possible future providers (not built)

Each needs its own research and the user's explicit consent before it is added.

- **Manual entry.** The user types the console's IP, model and firmware. Values are `source: "user"`, `verified: false` → the engine can only say Unknown until something verifies them.
- **On-console companion app.** A small VantaFlow homebrew app the user installs and starts themselves, which reports system version, model and homebrew status over a documented, authenticated local connection. This is the only route found that could report **verified** values without probing. It would itself need GoldHEN or etaHEN, so it is a later-stage decision.
- **Local network discovery.** Finding consoles on the LAN to pre-fill the list. Discovery alone proves nothing about firmware or homebrew, so its results stay unverified.

Not allowed in any stage: exploit-based detection, sending payloads to find out what is running, logging in to accounts, or bypassing authentication or DRM.
