# VantaFlow — Stage 5: installation and recovery

VantaFlow is an Itemzflow-inspired PlayStation dashboard. Itemzflow's horizontal coverflow is the centrepiece, and a subtle top navigation bar adds the other PlayStation sections.

**Stage 5 status:** VantaFlow installs, updates, repairs and removes itself on the desktop from VantaFlow packages. Every change goes through these steps:

- a confirmation screen saying what happens, what is affected, whether data could change, whether a backup is made, and whether it can be undone;
- an automatic, verified backup of settings and app files first;
- a journal entry, so an interruption is found later;
- a check of the result before success is reported.

Interrupted or failed operations are rolled back or recovered without erasing settings. Cleanup removes only VantaFlow's marked temporary files, after a preview. The Android companion updates itself through Android's own installer: it checks the APK, explains the permission and backs up settings first. That code is tested with a simulated installer, **not yet on a phone**. For the PS4, VantaFlow checks its package and copies it to a USB drive. **Installing it on the console is not done or verified by VantaFlow, and no VantaFlow PS4 package exists yet.** Details: [docs/installation.md](docs/installation.md).

**Stage 4 status:** VantaFlow can find and identify the user's own PS4 and PS5 on the local network, read-only, through the PlayStation Device Discovery Protocol (DDP), with separate PS4 and PS5 providers on the desktop and in the Android companion core. It verifies the console type, name and power state, and on a PS4 the firmware (confirmed below 10.00). It cannot read the model, the PS5 firmware number or GoldHEN / etaHEN status: no documented read-only method exists, so these are shown as **not available** and **Unsupported detection method**, and a real console is rated **Unknown**, never Compatible. All of this is tested against fake consoles, **not yet on physical hardware**. Instructions for your PS4 and PS5 are in [docs/physical-testing.md](docs/physical-testing.md), with a read-only check tool, `tools/console-check.mjs`. The Android companion **compiles** and its screens pass tests against fake consoles (see [android/README.md](android/README.md#build-and-install)). The demonstration consoles stay, clearly labelled.

**Stage 4.1 (validation):**

- Android builds.
- A reliability fix: a probe now accepts replies only from the probed address.
- Tests show that failed discovery never creates a console and that demo and real consoles never mix.
- A physical-test kit is included.
- [Which tests used fake consoles and which used physical ones](docs/connectivity.md#5-test-evidence-physical-vs-fake-consoles). So far: none physical.

**Stage 3 (unchanged):** PS4 and PS5 are separate platform modules with their own models, homebrew environment (GoldHEN / etaHEN), customization capabilities and compatibility rules. A compatibility engine rates a console from researched, dated release data, a detection architecture runs with a mock provider, a **Consoles** page (opened from the console status in the top bar) manages consoles, PS4 and PS5 profiles keep separate console settings while the VantaFlow account is shared by default, and an Android companion core shares the same data and rules. Everything that would need a console is still **demonstration data**, clearly labelled. Nothing talks to a console, installs packages, runs payloads or touches system files.

Documents: [**installation and recovery (Stage 5)**](docs/installation.md) · [**connectivity (Stage 4)**](docs/connectivity.md) · [**physical testing (Stage 4.1)**](docs/physical-testing.md) · [compatibility](docs/compatibility.md) · [customization research](docs/customization.md) · [detection](docs/detection.md) · [data models](docs/data-models.md) · [safety and recovery](docs/safety-and-recovery.md) · [Android companion](android/README.md)

---

## 1. Run it

Requirements: a modern browser (Chrome, Edge, Firefox, Safari) and Node.js 18 or later. No install step, no build step, no runtime dependencies.

```bash
cd Vantaflow
node desktop/server.mjs            # app + local detection agent on http://127.0.0.1:8080
```

Open <http://127.0.0.1:8080>. Press **F11** for full screen. `VANTAFLOW_PORT=9000 node desktop/server.mjs` uses another port.

The agent is needed only for your own consoles (browsers cannot send UDP). Any static server (`python3 -m http.server 8080`) still runs everything else with the demonstration consoles; the browser then logs one "404" for `/api/agent`, and the real-console actions explain that they need the agent.

> Opening `index.html` straight from disk (`file://`) does not work: browsers block ES modules there. Use a local server.

## 2. Test it

```bash
node tests/logic.test.mjs                              # settings validation, PS4/PS5 libraries, file tree (Node 18+)
node tests/compat.test.mjs                             # compatibility engine, researched data, detection (Node 18+)
node tests/profiles.test.mjs                           # console profiles and the shared account (Node 18+)

node tests/connectivity.test.mjs                       # Stage 4: DDP, providers, discovery, agent API, reliability (fake consoles)
node tools/console-check.mjs 192.168.1.20              # Stage 4.1: read-only check of YOUR console (see docs/physical-testing.md)
node tests/install.test.mjs                            # Stage 5: install, backups, recovery, cleanup, PS4 USB copy (temporary folders)

node desktop/server.mjs &                              # end-to-end in a real browser (needs Playwright installed)
node tests/ui-smoke.cjs http://127.0.0.1:8080/
node tests/ui-consoles.cjs                             # Stage 4 Consoles page with fake consoles (starts its own agent)
node tests/ui-setup.cjs [screenshot-folder]            # Stage 5 Install & Recovery screens (starts its own agent, temporary data folder)

cd android && ./gradlew :core:test                     # Android core: same vectors, Kotlin engine, connectivity (JDK 17+)
cd android && ./gradlew :app:testDebugUnitTest :app:assembleDebug   # Android screens + APK (needs the Android SDK)
node tools/build-docs.mjs                              # regenerate docs/compatibility.md and docs/customization.md
```

- `tests/compat.test.mjs` (494 checks): integrity of the researched data, every mock console gets its expected status with reasons, targeted rules (e.g. etaHEN 2.4B on 8.20 is Unknown because 2.4B does not restate 8.20), the strict etaHEN rule for every release × firmware, the detection service (timeouts and errors become Not detected), design tokens vs CSS, and **20 000 random configurations** proving that nothing unverified or undocumented is ever rated Compatible.
- `tests/profiles.test.mjs`: shared account by default, separate PS4/PS5 accounts when turned on, console settings always separate, restart, upgrade from Stage 3.
- `tests/ui-smoke.cjs` (22 checks): every section, the 11-icon top bar with Consoles opened from the console status, carousel, selection and simulated launch, accent colour, animation speed, background preview → apply, profile editing, notifications, File Manager, storage, a simulated gamepad, the Consoles page (all 11 consoles and their statuses, detect again, unknown device refused), switching to a PS5 console (etaHEN, PS5 library, shared account, separate console settings), turning on separate PS4/PS5 profiles, preferences after a restart per profile, logo text fallback, window sizes. Playwright is only for this test.
- `tests/connectivity.test.mjs` (117 checks): every shared DDP sample, address validation, PS4 and PS5 providers against fake consoles (identification, unconfirmed 11.00, missing firmware, wrong type, unknown type, non-DDP reply, timeout, network error), discovery (one request per generation, loopback filtering), the agent API (header, Host check, consent, invalid address, probe) and engine integration (a real PS4 / PS5 is Unknown, never Compatible). Stage 4.1 adds:
  - replies from another address are ignored;
  - 10 000 mutated replies produce no false identification;
  - demo data never claims a DDP source;
  - the physical-test tool is covered.
- `tests/install.test.mjs` (132 checks, **simulated** in temporary folders with mock packages; interruptions are real process stops):
  - successful, cancelled, failed (with rollback) and interrupted installations;
  - existing-installation detection and repair;
  - package validation;
  - backup creation, integrity, restoration and corruption;
  - recovery after failed updates;
  - removal;
  - cleanup preview and confirmation;
  - preservation of user files, settings and profiles;
  - PS4 package checks and USB copy.
- `tests/ui-setup.cjs` (15 checks, real browser and agent, **simulated** installations): the Install & Recovery screens end to end, including the failed update, the interrupted update with recovery, settings restore, a damaged backup, cleanup, the PS4 copy and removal.
- `tests/ui-consoles.cjs` (16 checks): no traffic before consent, the consent text, discovery results, real-console detail (verified vs not available, HEN status never guessed), making a real console active (top bar, GoldHEN page), disconnect (no traffic), connect and refresh, invalid and internet addresses refused, an address that does not answer stays "not identified", remove, restart re-check, behaviour without the agent, and (Stage 4.1) failed discovery saving nothing and demo / real labels never mixing.
- `android/app` Stage 5 `SetupScreenTest` (9, Robolectric, **simulated installer**) and `android/core` `SetupTest` (6): update verified by version, cancel, failure, refused packages, permission explained, interrupted update recovered, backup and restore, cleanup.
- `android/app` (7 tests, Robolectric): the real Compose screens with the shared JSON and fake consoles. They cover demo consoles and their expected statuses, add by IP, invalid addresses, a silent address that stays not identified, disconnect without traffic, and discovery that asks first. One more test renders screenshots.
- `android/core` (17 tests): the Kotlin engine gives the same status as the desktop for every mock console; the account model is shared unless separate accounts are on; Stage 4 `ConnectivityTest` repeats the DDP samples, address rules, PS4/PS5 providers, timeouts, network errors, discovery, saved consoles (connect, disconnect without traffic, remove) and engine integration.

**Fake consoles are not physical proof.** Every test that uses one says so in its output.

### Manual checklist

1. **Games:** ← → slides the coverflow; it wraps at the ends. ✕ flips the cover into the game page; ✕ on **Launch** plays the simulated launch.
2. **L1 / R1 (Q / E)** visit every section. **↑** moves focus to the top bar; there **← →** switches section and **↓** returns.
3. **Settings → Appearance:** choose an image, check the preview, apply it; change accent / highlight; **Restore default appearance**.
4. **Settings → Interface:** turn animations, reflections, sounds and music on/off; change animation speed. Reload the page: everything stays.
5. **Your consoles** (Stage 4, with `node desktop/server.mjs`): open Consoles, choose **Discover consoles on this network…**, read the explanation, choose **Search**, then pick your console. Or choose **Add console by IP address…** (PS4/PS5: *Settings → Network → View Connection Status*). ✕ on a console opens **Connect / Disconnect, Refresh information, Make active console, Remove saved console**; △ refreshes.
6. **Demo consoles** (click the console status top-right, or L1/R1 past the homebrew badge): pick **Living room PS5**. The badge becomes etaHEN, the status shows PS5 · FW 8.20, Games shows PS5 titles (white PS5 case band) plus PS4 titles, and storage, files and console settings change to the PS5 profile; your name and avatar stay the same. Pick a PS4 console to return; its settings are untouched. △ re-runs detection.
7. **Profile** (top-left): ✕ on Username to rename; ← → on Avatar colour and Online status. **Separate PS4 and PS5 profiles** (off by default) gives each console its own name, avatar and status, for people with different PlayStation accounts.
8. Click the **storage** figures (bottom-left) for the storage breakdown, or the **console status** (top-right) for the Consoles page.
9. Resize the window: the 1920×1080 stage scales and letterboxes.

## 3. Controls

| Action | Keyboard | Controller (Gamepad API) | Mouse |
|---|---|---|---|
| Move | Arrow keys | D-pad / left stick | Wheel scrolls the carousel |
| ✕ Select | Enter, Space, X | ✕ (○ with "Confirm with ○") | Click a cover, row or prompt |
| ○ Back | Esc, Backspace, C | ○ | Click the ○ prompt |
| □ Favorite / Mark all read | S | □ | Click the □ prompt |
| △ Reload library | T | △ | Click the △ prompt |
| Settings | M, Tab | OPTIONS | Click the OPTIONS prompt |
| Previous / next section | Q / E, PageUp / PageDown | L1 / R1 | Click a top-bar icon |

**Controller foundation.** All input becomes one of 11 actions (`up down left right cross circle square triangle options l1 r1`) and goes through one function, `dispatch()` in `js/core/navigation.js`. The browser Gamepad API (standard mapping, held directions auto-repeat) is already wired. A future on-console shell can feed real controller input with `window.VantaFlow.press('cross')` without touching the UI.

## 4. What is functional and what is demonstration data

Simulated screens carry a yellow **SIMULATED** tag, simulated actions show a yellow "Simulated" message, and demo figures say **MOCK**. Working features carry a green **LIVE** tag. Information read from your own console carries a green **READ-ONLY** tag.

| Functional (really works) | Demonstration data / simulated |
|---|---|
| Top navigation, section switching, highlight, transitions | Game, app and homebrew titles (mock library) |
| Coverflow: movement, wrap-around, selection, game page, reflections | Launching, cheats, hiding and uninstalling titles |
| Keyboard, gamepad and mouse input | Store items and purchases |
| All Settings, saved on this device | Trophies, friends, media, notification content |
| Custom background: preview, apply, restore | File Manager contents (browsing works, files do not open) |
| Accent / highlight colours, presets, restore defaults | Power: rest mode, restart, power off, close |
| Animation on/off and speed, sounds, generated background music | Console model, firmware, storage figures |
| Profile: username, avatar colour, online status — shared by PS4 and PS5, or separate when turned on (saved) | GoldHEN and etaHEN status, plugins and tools |
| Favourites and notification read state (saved) | |
| PS4 / PS5 profiles with separate settings, storage maths, clock, "Reload VantaFlow" | The demonstration consoles on the Consoles page (mock provider) |
| Compatibility engine and its reasons (real logic over researched data) | Detection results of the demonstration consoles |
| **Stage 4:** discovery and add by IP, connect / disconnect / refresh / remove / make active, console type, name, power, PS4 firmware (read-only, needs `node desktop/server.mjs`; not yet tested on a physical console) | |

## 5. PS4 and PS5 (Stage 3)

| | PS4 | PS5 |
|---|---|---|
| Platform module | `js/platform/ps4/` — models, rules, GoldHEN | `js/platform/ps5/` — models, rules, etaHEN |
| Models | PS4, PS4 Slim, PS4 Pro | PS5, PS5 Digital, PS5 Slim, PS5 Slim Digital, PS5 Pro (disc drive: built-in / none / detachable) |
| Homebrew environment | GoldHEN → **GoldHEN** section | etaHEN → **etaHEN** section |
| Release data | `shared/compatibility/goldhen.json` (17 releases) | `shared/compatibility/etahen.json` (17 releases) |
| Firmware rule | Each release lists all its firmware → missing = unsupported | Releases only mention changes → not restated = unknown |
| Extra checks | — | Required parts (ELF loader since 2.4B), kstuff, disc features on Digital models, per-firmware feature restrictions |
| Games | PS4 titles (CUSA) | PS5 titles (PPSA) + backward-compatible PS4 titles |
| Console settings, favourites, background, active console | `vantaflow.*.ps4` | `vantaflow.*.ps5` |
| VantaFlow account (name, avatar, status) | `vantaflow.account.shared` by default; `vantaflow.account.ps4` / `.ps5` when separate profiles are on | |
| Logo | `assets/goldhen/goldhen-logo.png` | `assets/etahen/etahen-logo.png` |

**Compatibility states:** Compatible · Partially compatible · Unsupported · Unknown · Not detected. Each check (connection, generation, model, firmware, environment, release, required parts) adds a reason, the worst one wins, and a final guard turns any unverified configuration into Unknown. Full rules and per-release data: [docs/compatibility.md](docs/compatibility.md).

**Consoles page, Stage 4:** see [docs/connectivity.md](docs/connectivity.md) for the real-console part.

**Consoles page, demonstration consoles** (opened from the console status indicator, top right; the top bar keeps its 11 icons): connection, network, generation, model, firmware (with evidence), homebrew status, compatibility with every reason, supported / not supported / not verified features, requirements, limitations, customization summary and last detection time. ✕ makes a console active (switching to its PS4 or PS5 profile), △ detects again. A device not identified as PS4 or PS5 cannot be made active.

**Mock consoles** (`shared/mock-consoles.json`): PS4 supported GoldHEN · PS4 unsupported firmware · PS4 without GoldHEN · PS4 with only an open port · PS5 supported etaHEN · PS5 partial (untested toolbox support) · PS5 unsupported firmware · PS5 without etaHEN · PS5 with an unresearched etaHEN version · unknown console · disconnected console.

**Logos:** each logo is requested once at start-up; a missing file falls back to the plain name, so the browser logs at most one "not found" per logo. VantaFlow never draws its own version of either logo.

## 6. Project structure

```
index.html                 Page shell: stage, background, top bar, views, prompts, overlays
css/vantaflow.css          All styling
js/
  main.js                  Start-up: scale the stage, load library, logos, platforms; start modules
  models/index.js          Shared data models (mirrored in android/core)
  compat/                  Compatibility engine
    engine.js              Shared flow: connection → generation → platform rules → result
    release-data.js        Lookups in the researched release data
  detection/               Console detection
    service.js             Runs a provider: timeout, errors, timestamps
    mock-provider.js       Demonstration consoles from shared/mock-consoles.json
    lan-provider.js        Your consoles on the local network (saved list, read-only checks)
    agent-client.js        Calls the local agent; the UI's only path to the network
  core/                    App plumbing
    store.js               Local persistence (namespaced JSON in localStorage)
    settings.js            Preferences: defaults, validation, change events, favourites
    appearance.js          Applies settings: colours, animation speed, background, music
    navigation.js          Top bar, section order, routing, focus, prompts, dispatch()
    input.js               Keyboard + Gamepad API → actions
  platform/                Console information, kept separate per console
    index.js               Registry, active console, detection, storage breakdown, logo probe
    ps4/index.js           PS4 module: models, capabilities, GoldHEN data
    ps4/compat.js          PS4 compatibility rules (GoldHEN)
    ps4/goldhen.js         GoldHEN demo panel content (plugins, tools, files)
    ps5/index.js           PS5 module: models, capabilities, etaHEN data
    ps5/compat.js          PS5 compatibility rules (etaHEN)
    ps5/etahen.js          etaHEN demo panel content
  data/
    mock.js                All demonstration content
    library.js             Title provider (Games / Applications / Homebrew)
  sections/                What each top-bar section shows and does
    index.js               Section registry and order
    settings.js            Settings
    hen.js                 GoldHEN and etaHEN sections
    consoles.js            Console management page
    content.js             Profile, Store, Trophies, Friends, Notifications, Media, Files, Power
  ui/                      Reusable interface components
    views.js               FlowView (coverflow + game page) and PanelView (list + detail)
    carousel.js            Coverflow (Itemzflow geometry in CSS 3D)
    background.js          Animated shader / plain / image background
    art.js                 Generated placeholder covers and icons
    ui.js                  Icons, glyphs, tags, widgets, toasts, sounds, music, dialogs
desktop/setup/             Stage 5: data folder, packages, backups, installer/recovery, cleanup, API, operation runner
desktop/                   Local agent (Node, no dependencies), Stage 4
  server.mjs               Serves the app and /api/agent, /api/discover, /api/probe on 127.0.0.1
  agent/ddp.mjs            PlayStation Device Discovery Protocol: format only
  agent/udp.mjs            The only UDP code on the desktop
  agent/discovery.mjs      Discovery and local-address rules
  agent/report.mjs         Provider report shape
  agent/providers/ps4.mjs  PS4 provider (UDP 987)       — separate on purpose
  agent/providers/ps5.mjs  PS5 provider (UDP 9302)      — separate on purpose
shared/                    Language-neutral data used by desktop and Android
  compatibility/           Researched GoldHEN and etaHEN release data (dated, with sources)
  mock-consoles.json       Demonstration consoles + expected results (shared test vectors)
  customization.json       Customization research
  design-tokens.json       Colours and timing shared with Android
  ddp-samples.json         DDP reply samples (constructed from the documented format) — shared test vectors
android/                   Android companion: core module (Kotlin) + Compose app; both compile and are tested
docs/                      Compatibility, customization, detection, data models, safety
tools/build-docs.mjs       Generates docs/compatibility.md and docs/customization.md
tools/console-check.mjs    Read-only check of your own PS4 / PS5 (physical testing)
tools/build-package.mjs    Builds a VantaFlow desktop package (.vfpkg) from this folder
assets/goldhen/            Official GoldHEN logo
assets/etahen/             Official etaHEN logo
tests/                     logic, compat, profiles, connectivity (Node); ui-smoke.cjs, ui-consoles.cjs (Playwright, optional); fake-console.mjs
```

### Replacing mock data later

- **Titles:** `js/data/library.js` is the only place titles come from. Replace `source.load(platformId)` with a loader that reads the console and resolves to `{ games, apps, homebrew }`, each a list of `{ id, title, kind, platform, version, type, size, desc, … }`. The carousel, trophies, storage and file manager follow automatically.
- **Console info:** real consoles go through `js/detection/lan-provider.js` and the agent's PS4 / PS5 providers. A new read-only method becomes a new provider (see [docs/detection.md](docs/detection.md)); everything else reads `DetectionResult`.
- **Release data:** add new GoldHEN / etaHEN releases to `shared/compatibility/*.json` with evidence and date, then run `node tools/build-docs.mjs` and the tests.
- **Covers:** add `cover: 'assets/covers/<TitleID>.png'` to a title (see `assets/README.md`).

## 7. Settings reference

- **Appearance:** background (Itemzflow-style shader / plain #1F1F1F / custom image with preview), dim, colour preset, accent, selection highlight, restore background, restore colours, restore default appearance.
- **Interface · Animation:** animations on/off, animation speed (coverflow + all transitions), reflections, animated background. The OS "reduce motion" setting is respected.
- **Interface · Sound:** interface sounds, volume, background music (generated ambient loop).
- **Interface · Navigation:** wrap-around, confirm with ○, sort order, button prompts.
- **Interface · Display:** 12/24-hour clock, Title IDs, navigation labels, cover size.
- **Storage (simulated):** each drive with used / free space and a breakdown by Games, Applications, Captures & media, Saved data, System, Backups.
- **Console:** console profile (PS4 · GoldHEN or PS5 · etaHEN, each with its own console settings) and a link to the Consoles page.
- **System:** reset everything.

Saved in `localStorage` under `vantaflow.*`: active profile; per console profile the appearance and interface settings, custom background, favourites and selected console; the VantaFlow account (shared, or per console when separate profiles are on); notification read state (shared). Clearing the browser's site data resets VantaFlow.

## 8. What was taken from Itemzflow

The design was built from Itemzflow's own source code ([LightningMods/Itemzflow](https://github.com/LightningMods/Itemzflow), GPL-3.0), not from memory. No Itemzflow code or image assets are copied into this repository; the values below were measured from the source and rebuilt from scratch.

| Element | Itemzflow source | VantaFlow |
|---|---|---|
| Coverflow pieces | `NUM_OF_PIECES = 7` (selected ± 3) | Same |
| Spacing / rotation | items 1.05 units apart, rotated `90° / 3 = 30°` per step, outermost edge-on | Same (`js/ui/carousel.js`) |
| Camera | 60° vertical FOV, covers at z = −3.6 | CSS `perspective` = 3.6 units, 1 unit ≈ 260 px at 1080p |
| Cover size | 1 × 1.25 units, standing on a floor at screen centre | Same; PS4-case style band on generated covers |
| Reflections | mirrored covers fading out (`Reflections=1` in settings.ini) | Same, toggle in Settings |
| Step animation | 0.1976 s, linear | Same (default "Itemzflow" speed) |
| Game page | selected cover backflips 360°, camera moves by (0.70, −0.55, 1.85), option list on the left | Same |
| Title / Title ID | title centred at 80 % of screen height, Title ID below in 75 % white, ✕ below that | Same |
| Button prompts | Options / △ / ○ / □ bottom-right | Same, plus □ Favorite |
| Background | clear colour `#1F1F1F` + animated "PS symbols" shader; optional background image | VantaFlow's own shader with the same idea (glowing controller-symbol outlines), `#1F1F1F` plain mode, custom image |
| Colours | selection `rgb(29,134,240)`, panel grey `rgb(66,66,66)`, white Helvetica text | Same defaults |

VantaFlow additions: the top navigation bar, profile, clock, console status, storage, GoldHEN / etaHEN panel, toasts and the extra sections.



## 9. Framework choice

Plain HTML, CSS and JavaScript ES modules, with no framework, build tools or runtime packages. CSS 3D reproduces Itemzflow's coverflow geometry directly, the state is small enough not to need React or Vue, and the data shapes and layout numbers port one-to-one to a native renderer later. Only the animated background uses WebGL, and it falls back to the plain background.

## 10. Boundaries kept (Stage 5)

There is no jailbreak exploit, firmware exploitation, payload execution, authentication or DRM bypass, unauthorised console access, firmware or protected-file change, Y2JB, automatic update or downgrade, automatic console modification or real power control.

Package installation is limited to **VantaFlow's own packages**:

- desktop: into VantaFlow's own folder;
- Android: through Android's installer, with Android's confirmation;
- PS4: a verified copy to a USB drive you choose, which you then install on the console yourself.

Each one needs explicit confirmation. Console communication is limited to the read-only DDP `SRCH` request, on the local network only, to consoles the user chose, after the user agreed. WAKEUP / LAUNCH, Remote Play registration, and probing homebrew ports are not implemented. No credentials are needed or stored; nothing is sent outside the local network. Rules for any future console operation (compatibility gate, explicit authorisation, dry run, backup, undo) are in [docs/safety-and-recovery.md](docs/safety-and-recovery.md).

## 11. Stage 3 review decisions

1. **etaHEN stays strict.** If an etaHEN release does not itself establish a firmware, the result is Unknown, not Compatible. Tested for every release × firmware in `tests/compat.test.mjs`.
2. **One VantaFlow account by default.** Name, avatar colour and online status are shared by PS4 and PS5; Profile → *Separate PS4 and PS5 profiles* splits them for different PlayStation accounts. Appearance, favourites, backgrounds and the active console are always per console.
3. **No 12th icon.** The Consoles page opens from the console status indicator; the top navigation keeps its 11 icons.

## 12. Researched, simulated, unverified

| | |
|---|---|
| **Researched (primary sources, verified 2026-11-16)** | GoldHEN: per-release firmware from payload files in tagged commits (v1.0–v2.3) and release-note firmware lists (v2.4b17–v2.4b18), features and dates from the changelog and README. etaHEN: per-release firmware statements, requirements and known issues from release notes, features and config from the README, dates from git tags. |
| **Researched (secondary sources)** | PS5 official home-screen customization (retro looks, animated themes, no custom wallpaper); PS5 disc-drive model groups. Marked as secondary in [docs/customization.md](docs/customization.md). |
| **Implemented and tested with fake consoles (Stage 4)** | DDP parsing, PS4 / PS5 identification, PS4 firmware decoding, discovery, manual IP, connect / disconnect / refresh / remove / make active, errors and timeouts, engine integration — desktop and Android core. |
| **Implemented, not tested on physical hardware** | Everything that talks to a real console, on desktop and Android. Instructions: [docs/physical-testing.md](docs/physical-testing.md). |
| **Android companion** | Compiles (APK); screens tested with Robolectric and fake consoles; not yet run on a phone. |
| **Installation and recovery (Stage 5)** | Desktop: implemented and tested (simulated, temporary folders). Android: implemented, tested with a simulated installer, not run on a phone. PS4: package check and USB copy tested with mock packages; console installation not done or verified by VantaFlow; no VantaFlow PS4 package exists. |
| **Unsupported (no documented read-only method)** | Console model, PS5 firmware number, GoldHEN / etaHEN status and version, storage. |
| **Simulated** | The demonstration consoles and their detection results; GoldHEN / etaHEN plugins and tools; launching, power and other console actions. |
| **Unverified / unknown** | GoldHEN betas 2.4b5–2.4b16.2 (not published as releases); etaHEN releases without firmware statements (never rated compatible); release asset file names; PS4 profile customization; PS4 system-version layout from 10.00; PS5 system-version mapping. |

## 13. Known limits

- On a real console, text entry (username) would use the system keyboard; the browser shows a text field.
- The gamepad was tested with a simulated standard-mapping pad; real pads depend on the browser exposing them.
- Background music is a generated tone loop; reading MP3s from USB needs console access.
- The Android companion compiles and its screens are tested on the JVM (Robolectric), but it has not been run on a phone.
- Real-console detection has not been run against a physical PS4 or PS5. The cloud development environment cannot reach your network; [docs/physical-testing.md](docs/physical-testing.md) is for you to run.
- Discovery uses broadcast; networks with client isolation (often guest Wi-Fi) block it. Add the console by IP address there.
