# Physical console testing (Stage 4.1)

These steps check VantaFlow against **your own** PS4 and PS5. Everything is read-only: VantaFlow sends only the documented discovery request (DDP `SRCH`). It never wakes the console, pairs with it, runs anything on it or changes it.

**Status:** no physical-console test has been run yet. The development environment is in the cloud, not on your network, so it cannot reach your consoles. Every result so far comes from fake consoles on 127.0.0.1 (see [connectivity.md §5](connectivity.md#5-test-evidence-physical-vs-fake-consoles)). Results from these steps are the first physical evidence.

**What VantaFlow will not tell you, by design:**

- the model;
- the PS5 firmware number;
- whether GoldHEN or etaHEN is installed or running.

These always show as **Not available** or **Unsupported detection method**, even when GoldHEN or etaHEN is running. That is the expected result, not a failure.

## 1. Before you start

You need:

- A computer (Windows, macOS or Linux) with [Node.js](https://nodejs.org) 18 or later, connected to the **same network** as the console. Use the same router, not a guest Wi-Fi network: guest networks usually block discovery.
- A copy of this repository on that computer.
- Optional, for the Android part: an Android phone (Android 8.0 or later) on the same Wi-Fi.

Write down from the console:

| What | PS4 | PS5 |
|---|---|---|
| IP address | *Settings → Network → View Connection Status* (IP Address) | *Settings → Network → Connection Status → View Connection Status* (IPv4 Address) |
| Firmware | *Settings → System → System Information* (System Software) | *Settings → System → System Software → Console Information* (System Software) |
| Console name | *Settings → System → System Information* (Name) | *Settings → System → System Software → Console Information* or *Console Name* |
| Model | Label on the console (e.g. CUH-2216A is a PS4 Slim, CUH-7216B a PS4 Pro) | Label on the console (e.g. CFI-1216A disc, CFI-1216B Digital, CFI-2016 Slim, CFI-7016 Pro) |
| Rest-mode network | *Settings → Power Save Settings → Set Features Available in Rest Mode → Stay Connected to the Internet* | *Settings → System → Power Saving → Features Available in Rest Mode → Stay Connected to the Internet* |
| Remote Play | *Settings → Remote Play Connection Settings → Enable Remote Play* | *Settings → System → Remote Play → Enable Remote Play* |
| GoldHEN / etaHEN | Running or not, and which version (from its own notification) | Same |

Note the Remote Play setting. Sources do not say whether the console answers discovery with Remote Play off. That is one of the things these tests find out.

**Firewall prompts:**

- **Windows** may ask whether Node.js may use the network. Allow it on **private** networks.
- **macOS 15 and later** may ask whether Terminal may find devices on the local network. Allow it. Without this permission, nothing answers.

## 2. Command-line check (start here)

`tools/console-check.mjs` is the smallest possible test: one request per console type, and a printed result. It also writes a JSON report. The report leaves out the console ID and the running game. Add `--hide-name` to leave out the console name too.

```bash
cd Vantaflow
node tools/console-check.mjs 192.168.1.20 --firmware 9.00 --repeat 5     # your console's IP and firmware
node tools/console-check.mjs --discover                                  # asks before sending anything
```

### PS4

| # | Do this | Expected | Record |
|---|---|---|---|
| P4-1 | Console on, home screen. Run the IP check with `--firmware` set to what the console shows and `--repeat 5` | `PS4 request: answered 5 of 5`, `identified as: PS4`, the console's name, `power: On`. The PS5 request is not answered | Pass / fail, answered n of 5 |
| P4-2 | Same output: firmware line | **Below 10.00:** `X.YZ (decoding confirmed…)` and `you typed: … — matches`. **10.00 or later:** `NOT CONFIRMED`. VantaFlow does not yet know whether the decoding is right there | The raw `system-version` **and** the firmware the console shows. For 10.00+ this is the data needed to confirm or fix the decoding |
| P4-3 | Same output: model and GoldHEN lines | `model: not available`, `GoldHEN: Unsupported detection method` | — |
| P4-4 | Start GoldHEN (if you use it) and run again | **No change.** GoldHEN is still `Unsupported detection method`; nothing claims it is installed | Pass / fail |
| P4-5 | Put the console in rest mode **with** "Stay Connected to the Internet" on, wait 1 minute, run again | `power: Rest mode` (620 Server Standby), or no answer | Which of the two |
| P4-6 | Rest mode **without** "Stay Connected", or fully off | No answer, `no PlayStation identified` | Pass / fail |
| P4-7 | Turn Remote Play off, console on, run again | Unknown. This is what the test finds out | Answered or not |
| P4-8 | Run the IP check against another device's address (your phone or router) | `no PlayStation identified at this address`. Never PS4 | Pass / fail |
| P4-9 | `node tools/console-check.mjs --discover`, answer `y` | The PS4 is listed with its IP, name and power state | Pass / fail |

### PS5

| # | Do this | Expected | Record |
|---|---|---|---|
| P5-1 | Console on, home screen. Run the IP check with `--firmware` set to what the console shows and `--repeat 5` | `PS5 request: answered 5 of 5`, `identified as: PS5`, name, `power: On`. The PS4 request is not answered | Pass / fail, answered n of 5 |
| P5-2 | Same output: firmware line | `firmware: not available`. VantaFlow does not convert the PS5 system-version | The raw `system-version` **and** the firmware the console shows. Values from several firmware versions could make a mapping possible later |
| P5-3 | Same output: model and etaHEN lines | `model: not available`, `etaHEN: Unsupported detection method` | — |
| P5-4 | Start etaHEN (if you use it) and run again | **No change.** etaHEN is still `Unsupported detection method` | Pass / fail |
| P5-5 to P5-9 | Same as P4-5 to P4-9, on the PS5 | Same expectations, with PS5 in place of PS4 | Same |

## 3. Desktop app

```bash
node desktop/server.mjs        # then open http://127.0.0.1:8080 and click the console status (top right)
```

| # | Do this | Expected |
|---|---|---|
| D-1 | **Discover consoles on this network…** Read the explanation, then choose **Search** | Your console is listed with name, PS4/PS5, IP and power. **Cancel** sends nothing |
| D-2 | Pick it | "Console answered". Detail: IP address, `PS4 — verified` / `PS5 — verified`, Model `Not available`, Firmware as in the command-line check, Connection `Connected — the console answered at …`, Power, GoldHEN/etaHEN status `Unsupported detection method`, Compatibility `Unknown` |
| D-3 | ✕ → **Make active console** | The top bar shows `PS4 “name” · FW …` (no MOCK tag). The GoldHEN/etaHEN page shows `Unsupported detection method` and READ-ONLY |
| D-4 | ✕ → **Disconnect**, then △ | "Connect this console first". With a packet capture (Wireshark filter `udp.port == 987 or udp.port == 9302`), no packet is sent, and none after reloading the page |
| D-5 | ✕ → **Connect** | "Console answered" again |
| D-6 | **Add console by IP address…** with another device's IP | "Saved, not identified". The detail says Not identified, and **Make active console** is not offered. Remove it afterwards |
| D-7 | Turn the console fully off, then △ | "No answer". Never a success, and the last successful check time stays as it was |

## 4. Android companion

Build the app ([android/README.md](../android/README.md#build-and-install)) and install it on a phone on the same Wi-Fi.

| # | Do this | Expected |
|---|---|---|
| A-1 | **Discover consoles…** → **Search** | Your console is listed. **Cancel** sends nothing |
| A-2 | Pick it and open it | Same fields and wording as the desktop (D-2) |
| A-3 | **Add by IP address…** with the console's IP | "Console added" |
| A-4 | **Disconnect**, then **Refresh** | "Connect this console first"; nothing is sent |
| A-5 | Discovery with the phone's screen just turned on, and again after it was off for a minute | Record whether replies arrive. Some phones filter broadcast replies while the screen is off |

## 5. Send back

- The JSON report files written by `console-check.mjs`.
- The test numbers with pass / fail and the values in the **Record** column. In particular:
  - PS4 and PS5 raw `system-version` alongside the real firmware;
  - rest-mode behaviour;
  - the Remote Play off result.

Each result will be recorded in [connectivity.md §5](connectivity.md#5-test-evidence-physical-vs-fake-consoles) as a **physical** result, separate from the fake-console results. The firmware decoding is changed only on the evidence from these reports.
