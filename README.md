# VantaFlow — Stage 1: Interface prototype

VantaFlow is an Itemzflow-inspired PlayStation dashboard concept. It keeps Itemzflow's horizontal coverflow as the centrepiece and adds a subtle top navigation bar for the other PlayStation sections.

**Stage 1 is interface only.** Everything runs in a web browser with mock data and local assets. Nothing talks to a console, installs packages, runs payloads or touches system files.

---

## 1. Launch and test

Requirements: any modern desktop browser (Chrome, Edge, Firefox, Safari) and something that can serve static files. No install step, no build step, no dependencies.

```bash
cd Vantaflow
python3 -m http.server 8080        # or: npx serve .   /   php -S localhost:8080
```

Open <http://localhost:8080>. Press **F11** for full screen to get the TV feel.

> Opening `index.html` straight from disk (`file://`) does not work: browsers block ES modules on `file://`. Use a local server as shown above.

Logic self-check (needs Node 18 or newer):

```bash
node tests/logic.test.mjs
```

### Controls

| Action | Keyboard | Controller (Gamepad API) | Mouse |
|---|---|---|---|
| Move | Arrow keys | D-pad / left stick | Wheel scrolls the carousel |
| ✕ Select / confirm | Enter, Space, X | ✕ (or ○ if "Confirm with ○" is on) | Click the centre cover or a selected row |
| ○ Back | Esc, Backspace, C | ○ | — |
| □ Favorite | S | □ | — |
| △ Reload (simulated) | T | △ | — |
| Options → Settings | M, Tab | OPTIONS | — |
| Previous / next section | Q / E, PageUp / PageDown | L1 / R1 | Click a top-bar icon |

Focus model: **Up** from the content (or **○** on the carousel) moves focus to the top bar. In the top bar, **← →** switches section and **↓ / ✕ / ○** returns to the content.

Any DualShock 4, DualSense or Xbox pad that the browser exposes with the *standard* mapping works. Press a button once after connecting so the browser reports the pad.

### Manual test checklist

1. Games: ← → slides the coverflow with reflections; it wraps around at the ends.
2. ✕ on a cover: the cover backflips and the camera moves to the game page. ✕ on **Launch** plays the simulated launch screen. ○ returns.
3. □ toggles a heart on the cover. The favourite survives a page reload.
4. L1 / R1 (Q / E) cycles through all 12 sections. Up moves focus to the top bar.
5. Settings → Background → **Choose custom image…** → pick a picture → check the preview → **Apply previewed image**. Reload the page: the background stays. **Restore default background** brings back the default.
6. Settings → Colors: ← → on Accent / Selection highlight cycles swatches; ✕ opens the full colour picker; **Color preset** switches both; **Restore default colors** resets.
7. Settings → Animation: turn off reflections, animations and the animated background; change carousel speed.
8. File Manager: ✕ enters folders, ○ goes up a level.
9. Power Options → Enter Rest Mode: confirm dialog, then a black "rest" screen; any button wakes it.
10. Resize the window: the 1920×1080 stage scales and letterboxes, so proportions never change.

---

## 2. What was taken from Itemzflow

The design was built from Itemzflow's own source code ([LightningMods/Itemzflow](https://github.com/LightningMods/Itemzflow), GPL-3.0), not from memory. No Itemzflow code or image assets are copied into this repository; the values below were measured from the source and rebuilt from scratch.

| Element | Itemzflow source | VantaFlow |
|---|---|---|
| Coverflow pieces | `NUM_OF_PIECES = 7` (selected ± 3) | Same |
| Spacing / rotation | items 1.05 units apart, rotated `90° / 3 = 30°` per step, outermost edge-on | Same (`js/carousel.js`) |
| Camera | 60° vertical FOV, covers at z = −3.6 | CSS `perspective` = 3.6 units, 1 unit ≈ 260 px at 1080p |
| Cover size | 1 × 1.25 units, standing on a floor at screen centre | Same; PS4-case style band on generated covers |
| Reflections | mirrored covers fading out (`Reflections=1` in settings.ini) | Same, toggle in Settings |
| Step animation | 0.1976 s, linear | Same (default "Itemzflow" speed) |
| Game page | selected cover backflips 360°, camera moves by (0.70, −0.55, 1.85), option list on the left | Same |
| Title / Title ID | title centred at 80 % of screen height, Title ID below in 75 % white, ✕ below that | Same |
| Button prompts | Options / △ / ○ / □ bottom-right | Same, plus □ Favorite |
| Background | clear colour `#1F1F1F` + animated "PS symbols" shader; optional background image | VantaFlow's own shader with the same idea (glowing controller-symbol outlines), `#1F1F1F` plain mode, custom image |
| Colours | selection `rgb(29,134,240)`, panel grey `rgb(66,66,66)`, white Helvetica text | Same defaults |

VantaFlow additions: the top navigation bar, profile, clock, console status, storage, GoldHEN panel, toasts and the extra sections.

---

## 3. Framework choice

**Recommendation for Stage 1: plain HTML + CSS + JavaScript ES modules. No framework, no build tools, no npm packages.**

Why:

- **Zero dependencies.** Nothing to install, update or audit. It runs from any static server.
- **CSS 3D is enough for the coverflow.** `perspective`, `preserve-3d` and `rotateY` reproduce Itemzflow's GLES2 geometry directly, so a canvas or WebGL library would add weight without adding fidelity.
- **The screen is small and state is simple.** About a dozen views, one settings object and one focus model don't need React or Vue. Re-rendering a panel's HTML on each move costs microseconds.
- **Easy to port later.** The layout numbers, data shapes and section definitions map one-to-one onto a native renderer if a later stage moves to an on-console app (Itemzflow itself is C++/GLES2).

Only one piece uses WebGL: the animated background, with an automatic fallback to the plain background.

---

## 4. Project structure

```
index.html            Page shell: stage, background layers, top bar, views, prompts, overlays
css/vantaflow.css     All styling (Itemzflow defaults, coverflow, panels, settings, overlays)
js/
  main.js             Boot: top bar, section routing, nav/content focus, theme, clock, stage scaling
  sections.js         The 12 top-bar sections: rows, detail panes, actions (incl. Settings and GoldHEN)
  views.js            FlowView (coverflow + game page) and PanelView (list + detail)
  carousel.js         Coverflow component (Itemzflow geometry in CSS 3D)
  background.js       Background layer: shader / plain / custom image
  settings.js         Settings defaults, validation, localStorage, favourites
  input.js            Keyboard + Gamepad API → abstract actions
  ui.js               Shared helpers: icons, controller glyphs, tags, toasts, sounds, dialog, splash
  art.js              Procedural placeholder cover art and app icons (SVG)
  data.js             All mock data (games, apps, homebrew, store, friends, files, GoldHEN status…)
tests/logic.test.mjs  Node self-check for the DOM-free logic
assets/README.md      Where to drop real cover art and the GoldHEN logo
```

### Reusable components

| Component | Where | Used by |
|---|---|---|
| `Coverflow` | `carousel.js` | Games (box art), Applications and Homebrew (square icons) |
| `FlowView` | `views.js` | Every coverflow section; includes the game page |
| `PanelView` | `views.js` | Store, Settings, Trophies, Friends, Notifications, Media, File Manager, Power, GoldHEN |
| Section definition (`items`, `detail`, `activate`, `adjust`, `back`, `prompts`) | `sections.js` | Adding a section means adding one object to `SECTIONS` |
| `icon()`, `btn()`, `tag()` | `ui.js` | Icons, controller button glyphs, LIVE / SIMULATED tags |
| `toast()`, `simulated()`, `confirmDialog()`, `showSplash()` | `ui.js` | Feedback and overlays everywhere |

---

## 5. Carousel architecture

`Coverflow` (`js/carousel.js`) keeps two numbers:

- `target`: the integer slot the user has selected. It is **unbounded** (it can go to −1, 13, 26…), and the item shown in slot `k` is `items[k mod n]`. That makes wrap-around seamless and allows the same item to appear twice when there are fewer than 7 items.
- `pos`: the animated float position. Each animation frame moves `pos` toward `target` at one step per 0.1976 s (linear, like Itemzflow). If input outruns the animation it speeds up rather than queueing.

On each frame, slots within ±3 of `pos` are rendered. Each one gets `translate3d(d × 1.05u, 0, 0) rotateY(−d × 30°)`, where `d = k − pos`. Elements are pooled by slot, so only covers that enter or leave the window touch the DOM. Each cover has a mirrored reflection child faded with a CSS mask.

The game page applies Itemzflow's camera vector `(0.70, −0.55, 1.85)` as one transform on the row, fades the other covers and spins the selected one 360° with the Web Animations API.

Cover art: if a game entry has `cover` (box art) or an app has `iconImage`, that image is used. Otherwise `art.js` generates an SVG placeholder from the game's colours and motif.

---

## 6. Settings and customisation

- **Store:** `settings.js` holds one flat object. `sanitize()` keeps only known keys with the right type, an allowed enum value, a valid `#rrggbb` colour or a 0–100 range, so bad or old saved data can never break the UI. `set(patch)` validates, saves to `localStorage` and notifies listeners. `main.js` listens and re-applies the theme: CSS variables `--accent` and `--highlight`, body classes and the background layer.
- **Rows:** the Settings section is a list of row descriptors (`toggle`, `choice`, `range`, `color`, `preset`, `action`). All of them work with ← → and ✕, so the whole screen is usable with a controller. Mouse users can also open the native colour and file pickers.
- **Background:** Itemzflow-style shader (default) / plain `#1F1F1F` / custom image, plus a dim level. A chosen image is downscaled to the 1920×1080 stage, shown in a live preview, and saved only when you pick **Apply previewed image**. **Restore default background** deletes it.
- **Colours:** accent, selection highlight, six presets (Itemzflow Blue is the default), restore defaults.
- **Animation:** all animations on/off, carousel speed, reflections, animated background. The OS "reduce motion" setting is respected too.
- **Sound:** interface sounds (Web Audio tones), volume, background music (stored only; simulated).
- **Navigation:** carousel wrap-around, confirm with ○ (controller), sort order, button prompts.
- **Display:** 12/24-hour clock, Title IDs, navigation labels, cover size.
- **Reset all settings.**

---

## 7. Simulated vs. real

Every simulated screen carries a yellow **SIMULATED** tag, and every simulated action shows a yellow "Simulated" toast. Real features carry a green **LIVE** tag.

| Real (works in the browser) | Simulated (mock data / demo only) |
|---|---|
| Coverflow, navigation, focus, controller input | Launching games and apps |
| All Settings (saved in `localStorage`) | Trainers & cheats, hide app, uninstall |
| Custom background preview and apply | Store purchases, downloads |
| Colour customisation and presets | Friends, messages, trophies, notifications content |
| Favourites (saved in `localStorage`) | Media playback |
| File Manager folder browsing (mock tree) | Opening files |
| "Reload VantaFlow" in Power Options | Rest mode, restart, power off, close |
| Clock (uses this computer's time) | GoldHEN status, plugins, tools |
| | Profile, console model, firmware, storage figures |

---

## 8. GoldHEN section

The GoldHEN panel (top-bar badge, or L1/R1 to the last section) shows a mock status indicator, version, uptime, plugins, tools and the GoldHEN feature list.

**About the logo:** the official GoldHEN logo is not in GoldHEN's public GitHub repositories, so it is not bundled here. VantaFlow does not draw its own version of it either. Put the official image at `assets/goldhen/goldhen-logo.png` and it appears in the panel and the top-bar badge automatically. Until then a plain text placeholder is shown. The browser console shows one expected 404 for this file until you add it.

---

## 9. Stage 1 restrictions — how they are met

- No firmware changes, console connections, jailbreak, Y2JB, payloads or PKG installation code exist in this repository.
- The mock file tree contains no packages. The protected `system_data` folder is shown as locked.
- All network-free: the app makes no external requests. Everything is local files and generated SVG.

## 10. Known limits and next steps

- The game list is fixed mock data. Stage 2 will replace `data.js` with a real data source.
- Generated covers are placeholders. Drop real box art into `assets/covers/` (see `assets/README.md`).
- Gamepad support uses the browser's Gamepad API. Real on-console input will be different.
- Stage 2 (GoldHEN and console research) starts only after this interface has been reviewed.
