# Console connectivity (Stage 4): read-only detection

Stage 4 replaces mock console information with information from the user's own PS4 or PS5, where a documented, read-only method exists. Where none exists, VantaFlow says so instead of guessing.

**Summary.** The only documented read-only method found is the PlayStation **Device Discovery Protocol (DDP)**, the discovery service PS4 and PS5 consoles answer for Remote Play and Second Screen apps. VantaFlow sends only its `SRCH` request. A reply verifies the console type (PS4 or PS5), its name and its power state. On a PS4 it also gives the firmware version, which is confirmed for firmware below 10.00. DDP does not give the model, the PS5 firmware number or anything about GoldHEN or etaHEN. VantaFlow therefore rates every real console as **Unknown**, never Compatible, and shows why.

## 1. How it works

```
Desktop:  browser UI ──HTTP (127.0.0.1 only)──▶ desktop/server.mjs ──UDP──▶ console
            js/sections/consoles.js               agent/providers/ps4.mjs   (port 987)
            js/detection/lan-provider.js          agent/providers/ps5.mjs   (port 9302)
            js/detection/agent-client.js          agent/discovery.mjs, ddp.mjs, udp.mjs

Android:  Compose screens ──▶ ConsolesModel ──▶ :core LanConsoles ──▶ Ps4Provider / Ps5Provider ──UDP──▶ console
```

Browsers cannot send UDP, so the desktop app gets a small local agent. Start VantaFlow with:

```bash
node desktop/server.mjs        # http://127.0.0.1:8080 (Node 18+, no dependencies)
```

Served by any static server instead (`python3 -m http.server`), the app still works with demonstration consoles. The real-console actions then say that they need `node desktop/server.mjs`.

| Piece | Desktop | Android |
|---|---|---|
| Protocol (message format only) | `desktop/agent/ddp.mjs` | `core/.../detection/Ddp.kt` |
| Network transport | `desktop/agent/udp.mjs` | `DatagramTransport` in `Lan.kt` |
| PS4 provider (separate) | `desktop/agent/providers/ps4.mjs` | `Ps4Provider.kt` |
| PS5 provider (separate) | `desktop/agent/providers/ps5.mjs` | `Ps5Provider.kt` |
| Discovery, address rules | `desktop/agent/discovery.mjs` | `discover()`, `LanAddress` in `Lan.kt` |
| Saved consoles, connect / disconnect | `js/detection/lan-provider.js`, `js/platform/index.js` | `LanConsoles.kt` |
| Demonstration provider (kept) | `js/detection/mock-provider.js` | `MockDetectionProvider` |

Network code is separate from the UI on both platforms. The UI only calls the provider layer.

Every provider returns a **report**:

- what it attempted (the exact request and address:port);
- whether the device answered;
- what it retrieved;
- the detection result, with `verified` and `source` on every field;
- the method;
- errors, each with a suggested action;
- the capabilities it cannot provide (`unavailable`), each with a reason.

## 2. Method and sources

**Request** (one UDP datagram, UTF-8):

```
SRCH * HTTP/1.1
device-discovery-protocol-version:00020020      (PS4, to UDP 987)
device-discovery-protocol-version:00030010      (PS5, to UDP 9302)
```

**Reply:** `HTTP/1.1 200 Ok` (console on) or `HTTP/1.1 620 Server Standby` (rest mode), followed by `key:value` lines.

VantaFlow reads these keys:

- `host-type`
- `host-name`
- `system-version`
- `device-discovery-protocol-version`
- `host-request-port`

It drops these keys during parsing, so they are never stored or shown:

- `host-id`
- `running-app-titleid`
- `running-app-name`

Sony does not publish DDP. The format comes from these open-source implementations:

| Source | What it establishes |
|---|---|
| [chiaki-ng `lib/include/chiaki/discovery.h`](https://github.com/streetpea/chiaki-ng/blob/main/lib/include/chiaki/discovery.h) | Ports 987 / 9302, protocol versions `00020020` / `00030010`, the SRCH and WAKEUP commands |
| [chiaki-ng `lib/src/discovery.c`](https://github.com/streetpea/chiaki-ng/blob/main/lib/src/discovery.c) | Request and reply format, 200 = ready / 620 = standby, PS5 identified by host-type + protocol version, system-version thresholds (PS4 ≥ 8000000 ↔ firmware 8.0; PS5 ≥ 8050001 ↔ "PS5 1.0") |
| [pyremoteplay `ddp.py`](https://github.com/ktnrg45/pyremoteplay/blob/master/pyremoteplay/ddp.py) | Same format, used for both PS4 and PS5 |
| [pyps4-2ndscreen `ddp.py`](https://github.com/ktnrg45/pyps4-2ndscreen/blob/master/pyps4_2ndscreen/ddp.py) and its tests | PS4 format, sample reply fields (`system-version: 01000000`) |
| [Home Assistant `components/ps4/media_player.py`](https://github.com/home-assistant/core/blob/dev/homeassistant/components/ps4/media_player.py) | PS4 system-version → firmware: characters 2–4 read as X.YZ (`07020001` → 7.02) |

Sources were read on 2026-11-16 (copies of the files were used during development; they are not part of the repository).

### What is deliberately not implemented

- **WAKEUP and LAUNCH** (DDP): they change the console's power state or start software, and they need a user credential from Remote Play registration. Stage 4 is read-only.
- **Remote Play registration and sessions:** these need the user's PSN account ID and a PIN pairing, plus an authenticated session. Nothing in Stage 4 needs them.
- **Probing homebrew ports.** GoldHEN's FTP (2121), BinLoader (9090) or Klog ports, or etaHEN's FTP (1337), Klog or ELF loader, may answer. That would not prove which program is running, so VantaFlow does not contact them.
- **Port scanning and address sweeps.** Discovery is one broadcast per generation. Manual entry contacts one address.

## 3. What is verified and what is not

| Field | PS4 | PS5 | Status shown |
|---|---|---|---|
| Console answered (connection) | Yes, from a valid DDP reply | Yes | Connected, with the time of the reply |
| Generation | **Verified** only when `host-type` and the protocol version both match the port that was asked | **Verified** (same rule) | `PS4 — verified` / `PS5 — verified`. A mismatch is "not a PS4 / PS5", not a guess |
| Console name | Reported by the console (`host-name`) | Same | Shown as "as the console reports it" |
| Power state | `200` on, `620` rest mode | Same | On / Rest mode |
| Model (PS4 / Slim / Pro; PS5 / Digital / Slim / Slim Digital / Pro) | **Not available** | **Not available** | No documented read-only method. The engine therefore cannot say Compatible |
| Firmware | `system-version` decoded as XX.YZ. **Verified only below 10.00** (leading `0`, matches Home Assistant and chiaki-ng). 10.00 and later are shown as "not confirmed" | **Not available.** The raw `system-version` is shown, but no source documents its mapping to the firmware number | Never a guessed version |
| GoldHEN status | **Unsupported detection method** | — | GoldHEN documents no read-only status method |
| etaHEN status | — | **Unsupported detection method** | etaHEN documents no read-only status method |
| Homebrew version | Not available | Not available | — |
| Storage | Not available | Not available | "Not available from this console" |
| Running game, console ID | Received but discarded | Same | Never stored |

Home Assistant reads characters 2–4, so it would turn `11008001` into "1.00". VantaFlow reads characters 1–4 ("11.00") and marks the result **not confirmed**, because no source shows a real reply from a console on firmware 10.00 or later.

### Homebrew status values

| Value | When |
|---|---|
| Verified installed | A provider verified that the environment is running. **No real provider can do this today.** |
| Verified not installed | A provider verified that it is not running. **No real provider can do this today.** |
| Unknown | A value was reported, but it is not verified |
| Not detected | The console is not connected, or the check failed |
| Unsupported detection method | Connected, but no documented read-only method exists. **This is what every real console shows.** |

The compatibility engine keeps the Stage 3 strict rules and adds one more: an environment check that is "unsupported" adds an **Unknown** reason. In the code: `environment-check-unsupported` in `js/platform/ps4|ps5/compat.js`, `Ps4Rules.kt` and `Ps5Rules.kt`. As a result:

- A connected console is not proof of homebrew.
- A detected console is not proof that GoldHEN or etaHEN is installed.
- A homebrew version is not proof of firmware compatibility.
- Unknown stays Unknown.

## 4. Privacy and security

- **Permission first.** The user must confirm discovery after this explanation: "VantaFlow sends one discovery request (SRCH) for PS4 on UDP port 987 and one for PS5 on UDP port 9302 to this network's broadcast address, and listens for 2 seconds. Consoles that answer report their type, name, system version and whether they are on or in rest mode. Nothing leaves your local network, no ports are scanned, and only the consoles you then pick are saved, on this computer. The running game and console ID in the replies are discarded." The agent also refuses `/api/discover` without `consent: true`.
- **Only the consoles the user selects.** A discovered console is saved only after the user picks it. A typed address must be private or link-local IPv4 (10.x, 172.16–31.x, 192.168.x, 169.254.x). Internet, loopback, network and broadcast addresses are refused. Replies from non-local addresses are ignored.
- **No assumption from an address.** A typed address is saved as "not identified" until a DDP reply proves what it is. A device that cannot be identified cannot become the active console.
- **Disconnect means silence.** A disconnected console is not contacted until the user connects it again, not even at start-up.
- **No credentials.** No method used needs one, and none is stored.
- **Stored data.** The saved list stays on the device: `localStorage` key `vantaflow.lan-consoles` on the desktop, SharedPreferences on Android. Each entry holds the address, generation, console name, connected flag, the time it was added and the time it was last verified.
- **Local agent hardening.** The agent:
  - listens on 127.0.0.1 only;
  - answers only requests whose Host header is `127.0.0.1:<port>` or `localhost:<port>` (HTTP 421 otherwise, against DNS rebinding);
  - accepts API calls only with the header `x-vantaflow: 1` (other web pages cannot send it without a CORS preflight, which the agent does not grant);
  - limits request bodies to 4 KB;
  - does not serve `.git` or `.gradle`.
- **Nothing external.** No request goes to any server outside the local network.

## 5. Test evidence: physical vs fake consoles

**No test has used a physical PS4 or PS5 yet.** The development environment runs in the cloud, outside your network, so it cannot reach a console. All network tests use **fake consoles**: small UDP responders on 127.0.0.1 that replay replies built from the documented format (`shared/ddp-samples.json`, also not captured from a real console). They prove VantaFlow's logic, not that a real console answers this way. Every suite says so in its output.

| Suite | Runs against | Checks | What it covers |
|---|---|---|---|
| `tests/connectivity.test.mjs` | Fake consoles (127.0.0.1) | 117 | Shared DDP samples; address rules; PS4 and PS5 providers; firmware decoding (11.00 unconfirmed); wrong type, non-DDP reply, timeout, network error; discovery; agent API (consent, Host check, header check); engine integration (a real console is never Compatible). Stage 4.1: replies from another address are ignored; 10 000 mutated replies give no false identification; demo data never claims a DDP source; the physical-test tool (`tools/console-check.mjs`) |
| `tests/ui-consoles.cjs` | Fake consoles via the desktop agent, real browser | 16 | Consent, discovery, add by IP, invalid and internet addresses, an address that does not answer, connect / disconnect (no traffic) / refresh / remove / make active, restart. Stage 4.1: failed discovery (silence, incomplete replies) saves nothing; demo and real labels never mix |
| `tests/ui-smoke.cjs` | Demo consoles (mock data) | 22 | The rest of the interface |
| `tests/compat.test.mjs`, `profiles`, `logic` | Mock data | 494 + | Compatibility engine and settings |
| `android/core` `ConnectivityTest` | Fake consoles (127.0.0.1) | 13 | Same DDP samples, address rules, providers, discovery, saved consoles, engine integration. Stage 4.1: reply from another address ignored, 5 000 mutated replies, demo/real separation |
| `android/core` `SharedVectorsTest` | Mock data | 4 | Kotlin engine agrees with the desktop |
| `android/app` `ScreensTest` (Robolectric) | Fake consoles + shared JSON as app assets | 6 | The real Compose screens: demo consoles from the shared data with the expected statuses and DEMO labels; add by IP (PS4 identified, read-only, GoldHEN unsupported); invalid addresses; an address that does not answer stays not identified; disconnect stops traffic; discovery asks first and saves only the console picked |
| `android/app` `ScreenshotsTest` | Same | 1 | Renders the screens to `android/app/build/screenshots/` for visual review |
| **Physical PS4** | — | **0** | Pending: [physical-testing.md](physical-testing.md) §2–4, tests P4-1 to P4-9, D-1 to D-7, A-1 to A-5 |
| **Physical PS5** | — | **0** | Pending: same document, tests P5-1 to P5-9 |

The tests were checked against the old code. The reply-from-another-address test fails on the Stage 4 code, which accepted any reply; it passes with the Stage 4.1 fix. It was run that way on both desktop and Android.

### Reliability changes in Stage 4.1

- **A probe of one address accepts replies only from that address.** Stage 4 took the first reply from any address if none came from the probed one. A different device answering, such as a broadcast echo or a second console, could therefore have identified the wrong IP. The transport now drops such replies (`onlyFrom` in `desktop/agent/udp.mjs` and `UdpTransport` in `Lan.kt`).
- Failed discovery creates nothing. Silence, incomplete replies and network errors produce "No consoles answered", and the saved list stays empty. Tested on desktop and Android.
- Demonstration consoles and real consoles stay apart:
  - different ids (`lan-…` only for real consoles);
  - different groups and labels (DEMO / SIMULATED vs READ-ONLY);
  - demo data never claims the `ddp` source.

## 6. Implementation status

| Category | Items |
|---|---|
| **Implemented and tested** (automated, fake consoles only) | Everything listed in §5, on the desktop and in the Android companion (core and screens) |
| **Implemented, not tested on physical hardware** | Everything that talks to a real PS4 or PS5. Instructions: [physical-testing.md](physical-testing.md) |
| **Simulated** | The 11 demonstration consoles (labelled DEMO / MOCK / SIMULATED), GoldHEN and etaHEN plugins and tools, game library, storage figures, launching titles, power options |
| **Unsupported** (no documented read-only method; always labelled "Not available" or "Unsupported detection method") | Console model (PS4 and PS5), PS5 firmware number, **GoldHEN status and version**, **etaHEN status and version**, storage |
| **Unknown** | Whether PS4 firmware 10.00 and later uses the same system-version layout (shown as "not confirmed"); how PS5 system-version maps to firmware; whether consoles answer with Remote Play off or in rest mode; behaviour on networks that block broadcast (guest Wi-Fi, client isolation) |

GoldHEN and etaHEN detection **does not work and is not claimed to**. VantaFlow reports "Unsupported detection method" whether or not either one is running.

## 7. Features that still need physical-console testing

Step-by-step instructions, expected results and what to record: **[physical-testing.md](physical-testing.md)**. In short:

1. PS4 and PS5 answer the discovery request; identification, name and power state are right.
2. PS4 firmware below 10.00 matches the console. For 10.00 and later, the raw system-version and the real firmware are recorded to confirm or fix the decoding (until then: "not confirmed").
3. PS5 raw system-version is recorded against the real firmware (until then: firmware "not available").
4. Rest mode with and without "Stay Connected to the Internet"; Remote Play on and off.
5. A wrong address (another device) is never identified.
6. Disconnect sends nothing (packet capture).
7. GoldHEN or etaHEN running changes nothing: still "Unsupported detection method".
8. Android: the same, on a phone on the same Wi-Fi, with the screen recently on and after it was off.
9. Networks: several interfaces, Wi-Fi vs Ethernet, client isolation.

Mock tests are never proof of real-console detection.
