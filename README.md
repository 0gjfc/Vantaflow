# VantaFlow — Stage 2: Functional interface

VantaFlow is an Itemzflow-inspired PlayStation dashboard. Itemzflow's horizontal coverflow is the centrepiece, and a subtle top navigation bar adds the other PlayStation sections.

**Stage 2 status:** every section works, the carousel is fully interactive, settings change the interface and are saved, and PS4 (GoldHEN) and PS5 (etaHEN) are separate experiences. Everything that would need a console is **demonstration data**, clearly labelled. Nothing talks to a console, installs packages, runs payloads or touches system files.

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
node tests/logic.test.mjs                              # logic: settings validation, PS4/PS5 libraries, file tree (Node 18+)

python3 -m http.server 8080 &                          # end-to-end in a real browser (needs Playwright installed)
node tests/ui-smoke.cjs http://localhost:8080/
```

`tests/ui-smoke.cjs` runs 18 checks: every section, carousel movement and wrap-around, game selection and simulated launch, accent colour, animation speed, background preview → apply, profile editing, notifications, File Manager with Enter / Backspace, storage, a simulated gamepad (D-pad, ✕, ○, L1, R1), the PS4 → PS5 switch, no script errors, preferences after a restart, restore default appearance, the logo text fallback, and window sizes from 390×844 to 2560×1440. Playwright is only for this test; the app itself does not use it.

### Manual checklist

1. **Games:** ← → slides the coverflow; it wraps at the ends. ✕ flips the cover into the game page; ✕ on **Launch** plays the simulated launch.
2. **L1 / R1 (Q / E)** visit every section. **↑** moves focus to the top bar; there **← →** switches section and **↓** returns.
3. **Settings → Appearance:** choose an image, check the preview, apply it; change accent / highlight; **Restore default appearance**.
4. **Settings → Interface:** turn animations, reflections, sounds and music on/off; change animation speed. Reload the page: everything stays.
5. **Settings → Console:** switch to PS5. The badge becomes etaHEN, the status shows PS5 · FW 4.03, Games shows PS5 titles (white PS5 case band) plus PS4 titles, storage and files change. Switch back for GoldHEN.
6. **Profile** (top-left): ✕ on Username to rename; ← → on Avatar colour and Online status.
7. Click the **storage** figures (bottom-left) or the **console status** (top-right): they open the matching Settings rows.
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
| PS4 / PS5 switch, storage breakdown maths, clock, "Reload VantaFlow" | |

## 5. PS4 and PS5

PS4 and PS5 are kept apart in code and on screen:

| | PS4 | PS5 |
|---|---|---|
| Console info | `js/platform/ps4/console.js` — PS4 Pro, FW 9.00 | `js/platform/ps5/console.js` — PS5, FW 4.03 |
| Homebrew enabler | `js/platform/ps4/goldhen.js` → **GoldHEN** section | `js/platform/ps5/etahen.js` → **etaHEN** section |
| Logo | `assets/goldhen/goldhen-logo.png` | `assets/etahen/etahen-logo.png` |
| Games | PS4 titles (CUSA) | PS5 titles (PPSA) + backward-compatible PS4 titles |
| Storage | Internal 862 GB + USB0 | Internal SSD 667 GB (PS5 titles) + USB extended storage (PS4 titles) |
| File Manager | `/data/GoldHEN/…` | `/data/etaHEN/…` |

The GoldHEN and etaHEN sections have different ids, data, plugins and tools, and only the one for the selected console appears in the navigation. Pick the console in **Settings → Console**; the choice is saved.

**Logos:** each logo is requested once at start-up. If a file is missing, a plain text name is shown instead, so the browser logs at most one "not found" per logo, not one per screen. VantaFlow never draws its own version of either logo.

## 6. Project structure

```
index.html                 Page shell: stage, background, top bar, views, prompts, overlays
css/vantaflow.css          All styling
js/
  main.js                  Start-up: scale the stage, load library + logos, start modules
  core/                    App plumbing
    store.js               Local persistence (namespaced JSON in localStorage)
    settings.js            Preferences: defaults, validation, change events, favourites
    appearance.js          Applies settings: colours, animation speed, background, music
    navigation.js          Top bar, section order, routing, focus, prompts, dispatch()
    input.js               Keyboard + Gamepad API → actions
  platform/                Console information, kept separate per console
    index.js               Active console, storage breakdown, logo probe / text fallback
    ps4/console.js         PS4 model, firmware, drives
    ps4/goldhen.js         GoldHEN status, plugins, tools, files
    ps5/console.js         PS5 model, firmware, drives
    ps5/etahen.js          etaHEN status, plugins, tools, files
  data/
    mock.js                All demonstration content
    library.js             Title provider (Games / Applications / Homebrew)
  sections/                What each top-bar section shows and does
    index.js               Section registry and order
    settings.js            Settings
    hen.js                 GoldHEN and etaHEN sections
    content.js             Profile, Store, Trophies, Friends, Notifications, Media, Files, Power
  ui/                      Reusable interface components
    views.js               FlowView (coverflow + game page) and PanelView (list + detail)
    carousel.js            Coverflow (Itemzflow geometry in CSS 3D)
    background.js          Animated shader / plain / image background
    art.js                 Generated placeholder covers and icons
    ui.js                  Icons, glyphs, tags, widgets, toasts, sounds, music, dialogs
assets/goldhen/            Official GoldHEN logo
assets/etahen/             Official etaHEN logo
tests/                     logic.test.mjs (Node), ui-smoke.cjs (Playwright, optional)
```

### Replacing mock data later

- **Titles:** `js/data/library.js` is the only place titles come from. Replace `source.load(platformId)` with a loader that reads the console and resolves to `{ games, apps, homebrew }`, each a list of `{ id, title, kind, platform, version, type, size, desc, … }`. The carousel, trophies, storage and file manager follow automatically.
- **Console info:** replace the objects in `js/platform/ps4|ps5/console.js` with real readings (same fields).
- **GoldHEN / etaHEN:** replace the objects in `ps4/goldhen.js` and `ps5/etahen.js`. Keep them separate.
- **Covers:** add `cover: 'assets/covers/<TitleID>.png'` to a title (see `assets/README.md`).

## 7. Settings reference

- **Appearance:** background (Itemzflow-style shader / plain #1F1F1F / custom image with preview), dim, colour preset, accent, selection highlight, restore background, restore colours, restore default appearance.
- **Interface · Animation:** animations on/off, animation speed (coverflow + all transitions), reflections, animated background. The OS "reduce motion" setting is respected.
- **Interface · Sound:** interface sounds, volume, background music (generated ambient loop).
- **Interface · Navigation:** wrap-around, confirm with ○, sort order, button prompts.
- **Interface · Display:** 12/24-hour clock, Title IDs, navigation labels, cover size.
- **Storage (simulated):** each drive with used / free space and a breakdown by Games, Applications, Captures & media, Saved data, System, Backups.
- **Console:** PS4 Pro · GoldHEN or PS5 · etaHEN.
- **System:** reset everything.

Saved in `localStorage` under `vantaflow.*`: settings, custom background, favourites and notification read state. Clearing the browser's site data resets VantaFlow.

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

## 10. Boundaries kept in Stage 2

No jailbreak exploits, firmware changes, payload execution, system-file changes, PKG or APK installation, Y2JB, console communication or real power control. All console information is simulated.

## 11. Known limits

- On a real console, text entry (username) would use the system keyboard; the browser shows a text field.
- The gamepad was tested with a simulated standard-mapping pad; real pads depend on the browser exposing them.
- Background music is a generated tone loop; reading MP3s from USB needs console access.
