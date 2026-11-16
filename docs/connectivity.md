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

## 5. Implementation status

| Category | Items |
|---|---|
| **Implemented and tested** (automated, against fake consoles on 127.0.0.1) | DDP request and reply parsing, firmware decoding and confirmation, PS4 and PS5 identification, wrong-type replies, non-DDP replies, timeouts, network errors, address validation, discovery (one request per generation, non-local replies ignored), the agent API (consent, Host check, header check, invalid addresses), saved consoles with connect, disconnect, refresh, remove and switch active, engine integration (a real console is never Compatible), the desktop Consoles page flows in a real browser, and Android core providers, discovery and saved consoles (Kotlin tests) |
| **Implemented but not tested on physical hardware** | Everything that talks to a real PS4 or PS5: discovery by broadcast on a real network, probing a real console's address, firmware decoding from a real reply, rest-mode replies, the start-up re-check |
| **Implemented but not compiled** | Android companion screens (`android/app`). The development environment has no Android SDK (the SDK download was not allowed there). `android/core`, which holds all of their logic, is compiled and tested |
| **Simulated** | The 11 demonstration consoles (labelled DEMO / MOCK / SIMULATED), GoldHEN and etaHEN plugins and tools, game library, storage figures, launching titles, power options |
| **Unsupported** (no documented read-only method) | Console model (both), PS5 firmware number, GoldHEN status and version, etaHEN status and version, storage |
| **Unknown** | Whether PS4 firmware 10.00 and later uses the same system-version layout; how PS5 system-version maps to firmware; whether every PS5 firmware still answers DDP from the console's rest mode; behaviour on networks that block broadcast (guest Wi-Fi, client isolation) |

## 6. Features that still need physical-console testing

Each item needs a real console on the same network as the computer or phone running VantaFlow.

1. **PS4 discovery:** a PS4 that is on appears in the discovery list as PS4 with its correct name.
2. **PS5 discovery:** same for a PS5.
3. **Rest mode:** a console in rest mode (with "Stay connected to the internet" on) answers as **Rest mode**, and one with it off does not answer.
4. **Manual IP:** adding the console's address identifies it. A wrong address (another device, such as a phone or a printer) stays "not identified".
5. **PS4 firmware below 10.00:** the decoded firmware matches *Settings → System → System Information* (for example 9.00 and 11.00 consoles if available). Record the raw system-version.
6. **PS4 firmware 10.00 and later:** record the raw system-version and the real firmware to confirm or correct the decoding. Until then it shows as "not confirmed".
7. **PS5 system-version:** record raw values against the real firmware on several PS5 firmware versions. A mapping may become possible from this data.
8. **Each model:** confirm that the PS4 Slim / Pro and the PS5 Digital / Slim / Slim Digital / Pro answer DDP the same way, and that no reply field identifies the model.
9. **Disconnect:** after Disconnect, a network capture shows no packets to the console, including after a restart.
10. **Networks:** discovery on networks with several interfaces, on Wi-Fi vs Ethernet, and on networks with client isolation (expected: no answer, so the user adds the console by IP).
11. **Firewall prompts:** whether Windows or macOS asks to allow `node` the first time, and that VantaFlow explains a timeout correctly if the user denies it.
12. **Android:** build the app with an Android SDK, and on a phone on the same Wi-Fi repeat items 1–5 and 9. Some phones filter broadcast replies while the screen is off.
13. **GoldHEN / etaHEN running:** confirm that the console still reports **Unsupported detection method** and **Unknown** compatibility, and that nothing claims the environment is installed.

Mock tests are never proof of real-console detection. Every automated test that uses a fake console says so in its output.
