# Puzzle Cascade

A 10-game puzzle collection that unlocks one puzzle at a time as you clear
each one - sliding tiles, memory match, match-3, a maze, Sokoban, word
search, a 2048-style number merge, a jigsaw, a Simon-style pattern game, and
a Lights Out logic grid as the "final boss." One shared hub screen, one save
file, one visual theme.

Rendered in real 3D with [Three.js](https://threejs.org/): every board is a
tilted tabletop scene with extruded rounded tiles, soft shadows, and
juicy pop/flip/cascade animations, not a flat DOM grid. See
[`CREDITS.md`](./CREDITS.md) for how that's done with zero external art or
audio assets (everything is generated in code at runtime).

## Project structure

```
puzzle-cascade/
  index.html          - the hub screen + game view shell
  manifest.webmanifest - PWA manifest (installable, themed)
  sw.js                - offline-cache service worker
  shared/
    css/               - theme.css (tokens/buttons/stars/modals), layout.css (hub/game-view layout)
    js/
      save-manager.js  - localStorage save/load abstraction (see below)
      sound-manager.js - Web Audio synthesized SFX + music
      ui.js            - particle bursts, toasts, modals, star-rating markup
      app.js           - hub rendering, navigation, timer, star/unlock flow
      three-stage.js   - shared Three.js scaffolding (renderer, camera,
                         lighting, raycasting, tweening) every game builds on
  games/
    01-sliding/ .. 10-lightsout/
                       - one self-contained ES module per puzzle, each
                         registering itself with PC.Games.register(id, {mount})
  vendor/
    three.module.min.js - vendored Three.js (MIT), no CDN dependency
  icons/               - app icons (hand-written SVG)
  assets/              - images/audio/fonts folders, currently empty (see CREDITS.md)
```

### The save system

Everything persists through a single `SaveManager` object
(`shared/js/save-manager.js`) wrapping `localStorage` behind a small API:
`unlock(id)`, `recordResult(id, difficulty, stars, timeMs)`,
`getStreak()`, `completionPercent(ids)`, `setSetting()/getSetting()`,
`resetProgress()`. No other file touches `localStorage` directly, so
swapping in a real backend later (say, synced accounts) is a matter of
rewriting the inside of that one file - every caller stays the same.

### Adding or editing a puzzle

Each game is a standalone ES module that does two things: builds its own
`.pc-canvas3d` host element for HUD/controls, and calls
`createStage(container, opts)` from `three-stage.js` to get a ready
renderer/camera/lighting rig. It registers itself with:

```js
PC.Games.register('my-game', { mount(container, difficulty, api) { ... } });
```

`api` gives the game `sound`, `ui` (particles/toasts/shake), `difficulty`,
`elapsedMs()`, `win(stars, extraStats)`, and `lose(message)`. The hub
(`app.js`) owns the timer, star-recording, and unlock-the-next-puzzle flow -
a game file never touches `SaveManager` directly.

## Running locally

No build step. Any static file server works, e.g.:

```bash
cd puzzle-cascade
python3 -m http.server 8080
# open http://localhost:8080
```

(A plain `file://` double-click of `index.html` will *not* work - ES
modules and the service worker both require `http(s)://`.)

## Deploying to GitHub Pages

1. Push this repository (or just the `puzzle-cascade/` folder, if you want
   it as its own repo) to GitHub.
2. In the repo settings, under **Pages**, set the source to the branch/folder
   containing `puzzle-cascade/index.html` (either the repo root if
   `puzzle-cascade` *is* the repo root, or `/puzzle-cascade` if it's a
   subfolder of a larger repo - GitHub Pages serves from the root or `/docs`,
   so a subfolder deploy needs either a redirect page at the real root or
   publishing `puzzle-cascade` as its own repo).
3. Done - it's fully static, no environment variables, no backend, no build.

## The future Capacitor/APK path

The brief this was built to keeps a native Android wrap in mind, and the
project is already shaped for it:

- **No server calls anywhere.** All state lives in `localStorage` via
  `SaveManager`. Nothing here will break offline or inside a WebView.
- **Three.js is vendored locally**, not loaded from a CDN, so 3D rendering
  works with no network access.
- **Touch-first controls.** Every game exposes on-screen touch controls
  (d-pads, drag/swipe, tap) alongside keyboard - nothing depends on a mouse
  or keyboard existing.
- **Responsive down to phone width**, tested at 390px.
- **A service worker + web manifest** already make this installable as a
  PWA today, which is the easiest proof the offline story works before
  wrapping it.

To actually produce an APK when you're ready:

```bash
npm install -g @capacitor/cli
cd puzzle-cascade
npm init -y
npm install @capacitor/core @capacitor/android
npx cap init "Puzzle Cascade" "com.yourname.puzzlecascade" --web-dir .
npx cap add android
npx cap open android   # builds/opens the project in Android Studio
```

Capacitor copies this folder in as the WebView's asset bundle as-is - no
code changes needed going in. You'd just want to remove or adjust the
service worker registration in `index.html` (Capacitor's WebView doesn't
need it the way a browser does) and swap the Google Fonts `@import` in
`theme.css` for locally-bundled font files, since an Android WebView won't
always have network access to fetch them.
