# VantaFlow — Stage 3: PS4 & PS5 platform architecture

VantaFlow is an Itemzflow-inspired PlayStation dashboard. Itemzflow's horizontal coverflow is the centrepiece, and a subtle top navigation bar adds the other PlayStation sections.

**Stage 3 status:** PS4 and PS5 are separate platform modules with their own models, homebrew environment (GoldHEN / etaHEN), customization capabilities and compatibility rules. A compatibility engine rates a console from researched, dated release data, a detection architecture runs with a mock provider, a new **Consoles** page manages consoles, PS4 and PS5 profiles keep separate settings, and an Android companion core shares the same data and rules. Everything that would need a console is still **demonstration data**, clearly labelled. Nothing talks to a console, installs packages, runs payloads or touches system files.

Stage 3 documents: [compatibility](docs/compatibility.md) · [customization research](docs/customization.md) · [detection](docs/detection.md) · [data models](docs/data-models.md) · [safety and recovery](docs/safety-and-recovery.md) · [Android companion](android/README.md)

---

## 1. Run it

Requirements: a modern browser (Chrome, Edge, Firefox, Safari) and anything that serves static files. No install step, no build step, no runtime dependencies.

```bash
cd Vantaflow
python3 -m http.server 8080        # or: npx serve .   /   php -S localhost:8080
```

Open <http://localhost:8080>. Press **F11** for full screen.

> Opening `index.html` straight from disk (`file://`) does not work: browsers block ES modules there. Use a local server.

## 2. Test it

```bash
node tests/logic.test.mjs                              # settings validation, PS4/PS5 libraries, file tree (Node 18+)
node tests/compat.test.mjs                             # compatibility engine, researched data, detection (Node 18+)

python3 -m http.server 8080 &                          # end-to-end in a real browser (needs Playwright installed)
node tests/ui-smoke.cjs http://localhost:8080/

cd android && gradle :core:test                        # Android core: same vectors, Kotlin engine (JDK 17+)
node tools/build-docs.mjs                              # regenerate docs/compatibility.md and docs/customization.md
```

- `tests/compat.test.mjs` (204 checks): integrity of the researched data, every mock console gets its expected status with reasons, targeted rules (e.g. etaHEN 2.4B on 8.20 is Unknown because 2.4B does not restate 8.20), the detection service (timeouts and errors become Not detected), design tokens vs CSS, and **20 000 random configurations** proving that nothing unverified or undocumented is ever rated Compatible.
- `tests/ui-smoke.cjs` (20 checks): every section, carousel, selection and simulated launch, accent colour, animation speed, background preview → apply, profile editing, notifications, File Manager, storage, a simulated gamepad, the Consoles page (all 11 consoles and their statuses, detect again, unknown device refused), switching to a PS5 console (etaHEN, PS5 library, separate settings), preferences after a restart per profile, logo text fallback, window sizes. Playwright is only for this test.
- `android/core` (3 test groups): the Kotlin engine gives the same status as the desktop for every mock console.

### Manual checklist

1. **Games:** ← → slides the coverflow; it wraps at the ends. ✕ flips the cover into the game page; ✕ on **Launch** plays the simulated launch.
2. **L1 / R1 (Q / E)** visit every section. **↑** moves focus to the top bar; there **← →** switches section and **↓** returns.
3. **Settings → Appearance:** choose an image, check the preview, apply it; change accent / highlight; **Restore default appearance**.
4. **Settings → Interface:** turn animations, reflections, sounds and music on/off; change animation speed. Reload the page: everything stays.
5. **Consoles** (top bar, or click the console status top-right): pick **Living room PS5**. The badge becomes etaHEN, the status shows PS5 · FW 8.20, Games shows PS5 titles (white PS5 case band) plus PS4 titles, storage, files and settings change to the PS5 profile. Pick a PS4 console to return; its settings are untouched. △ re-runs detection.
6. **Profile** (top-left): ✕ on Username to rename; ← → on Avatar colour and Online status.
7. Click the **storage** figures (bottom-left) for the storage breakdown, or the **console status** (top-right) for the Consoles page.
8. Resize the window: the 1920×1080 stage scales and letterboxes.

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

Simulated screens carry a yellow **SIMULATED** tag, simulated actions show a yellow "Simulated" message, and demo figures say **MOCK**. Working features carry a green **LIVE** tag.

| Functional (really works) | Demonstration data / simulated |
|---|---|
| Top navigation, section switching, highlight, transitions | Game, app and homebrew titles (mock library) |
| Coverflow: movement, wrap-around, selection, game page, reflections | Launching, cheats, hiding and uninstalling titles |
| Keyboard, gamepad and mouse input | Store items and purchases |
| All Settings, saved on this device | Trophies, friends, media, notification content |
| Custom background: preview, apply, restore | File Manager contents (browsing works, files do not open) |
| Accent / highlight colours, presets, restore defaults | Power: rest mode, restart, power off, close |
| Animation on/off and speed, sounds, generated background music | Console model, firmware, storage figures |
| Profile: username, avatar colour, online status (saved) | GoldHEN and etaHEN status, plugins and tools |
| Favourites and notification read state (saved) | |
| PS4 / PS5 profiles with separate settings, storage maths, clock, "Reload VantaFlow" | Every console on the Consoles page (mock detection provider) |
| Compatibility engine and its reasons (real logic over researched data) | Detection results it is applied to |

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
| Settings profile | `vantaflow.settings.ps4` | `vantaflow.settings.ps5` |
| Logo | `assets/goldhen/goldhen-logo.png` | `assets/etahen/etahen-logo.png` |

**Compatibility states:** Compatible · Partially compatible · Unsupported · Unknown · Not detected. Each check (connection, generation, model, firmware, environment, release, required parts) adds a reason, the worst one wins, and a final guard turns any unverified configuration into Unknown. Full rules and per-release data: [docs/compatibility.md](docs/compatibility.md).

**Consoles page:** connection, network, generation, model, firmware (with evidence), homebrew status, compatibility with every reason, supported / not supported / not verified features, requirements, limitations, customization summary and last detection time. ✕ makes a console active (switching to its PS4 or PS5 profile), △ detects again. A device not identified as PS4 or PS5 cannot be made active.

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
shared/                    Language-neutral data used by desktop and Android
  compatibility/           Researched GoldHEN and etaHEN release data (dated, with sources)
  mock-consoles.json       Demonstration consoles + expected results (shared test vectors)
  customization.json       Customization research
  design-tokens.json       Colours and timing shared with Android
android/                   Android companion: core module (Kotlin) + architecture
docs/                      Compatibility, customization, detection, data models, safety
tools/build-docs.mjs       Generates docs/compatibility.md and docs/customization.md
assets/goldhen/            Official GoldHEN logo
assets/etahen/             Official etaHEN logo
tests/                     logic.test.mjs, compat.test.mjs (Node), ui-smoke.cjs (Playwright, optional)
```

### Replacing mock data later

- **Titles:** `js/data/library.js` is the only place titles come from. Replace `source.load(platformId)` with a loader that reads the console and resolves to `{ games, apps, homebrew }`, each a list of `{ id, title, kind, platform, version, type, size, desc, … }`. The carousel, trophies, storage and file manager follow automatically.
- **Console info:** write a detection provider (see [docs/detection.md](docs/detection.md)) and pass it to `DetectionService` in `js/platform/index.js` instead of the mock provider. Everything else reads `DetectionResult`.
- **Release data:** add new GoldHEN / etaHEN releases to `shared/compatibility/*.json` with evidence and date, then run `node tools/build-docs.mjs` and the tests.
- **Covers:** add `cover: 'assets/covers/<TitleID>.png'` to a title (see `assets/README.md`).

## 7. Settings reference

- **Appearance:** background (Itemzflow-style shader / plain #1F1F1F / custom image with preview), dim, colour preset, accent, selection highlight, restore background, restore colours, restore default appearance.
- **Interface · Animation:** animations on/off, animation speed (coverflow + all transitions), reflections, animated background. The OS "reduce motion" setting is respected.
- **Interface · Sound:** interface sounds, volume, background music (generated ambient loop).
- **Interface · Navigation:** wrap-around, confirm with ○, sort order, button prompts.
- **Interface · Display:** 12/24-hour clock, Title IDs, navigation labels, cover size.
- **Storage (simulated):** each drive with used / free space and a breakdown by Games, Applications, Captures & media, Saved data, System, Backups.
- **Console:** console profile (PS4 · GoldHEN or PS5 · etaHEN, each with its own settings) and a link to the Consoles page.
- **System:** reset everything.

Saved in `localStorage` under `vantaflow.*`: active profile, and per profile the settings, custom background, favourites and selected console; notification read state is shared. Clearing the browser's site data resets VantaFlow.

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

## 10. Boundaries kept in Stage 3

No jailbreak exploits, firmware exploitation, payload execution, authentication or DRM bypass, unauthorised console access, firmware or protected-file changes, PKG or APK installation, Y2JB, automatic updates or downgrades, console communication or real power control. Detection is mock-only and all console information is simulated. Rules for any future console operation (compatibility gate, explicit authorisation, dry run, backup, undo) are in [docs/safety-and-recovery.md](docs/safety-and-recovery.md).

## 11. Researched, simulated, unverified

| | |
|---|---|
| **Researched (primary sources, verified 2026-11-16)** | GoldHEN: per-release firmware from payload files in tagged commits (v1.0–v2.3) and release-note firmware lists (v2.4b17–v2.4b18), features and dates from the changelog and README. etaHEN: per-release firmware statements, requirements and known issues from release notes, features and config from the README, dates from git tags. |
| **Researched (secondary sources)** | PS5 official home-screen customization (retro looks, animated themes, no custom wallpaper); PS5 disc-drive model groups. Marked as secondary in [docs/customization.md](docs/customization.md). |
| **Simulated** | Every console, detection result, firmware value and homebrew status; GoldHEN / etaHEN plugins and tools; all console actions. |
| **Unverified** | GoldHEN betas 2.4b5–2.4b16.2 (not published as releases); etaHEN releases without firmware statements (never rated compatible); release asset file names; PS4 profile customization; anything about real detection, which needs a provider that does not exist yet. |

## 12. Known limits

- On a real console, text entry (username) would use the system keyboard; the browser shows a text field.
- The gamepad was tested with a simulated standard-mapping pad; real pads depend on the browser exposing them.
- Background music is a generated tone loop; reading MP3s from USB needs console access.
- The Android UI module is designed but not written; only `android/core` exists and is tested.
