# Josh Makes Puzzles

A 40-game puzzle collection that unlocks one puzzle at a time as you clear
each one - sliding tiles, memory match, match-3, a maze, Sokoban, word
search, a 2048-style number merge, a jigsaw, a Simon-style pattern game, a
Lights Out logic grid, Tic-Tac-Toe vs an AI, Whack-a-Mole, Connect Four vs
an AI, Minesweeper, Tower of Hanoi, Peg Solitaire, Snake, Brick Breaker
(Breakout), Color Flood, Mini Sudoku, Reversi vs an AI, Checkers vs an AI,
Battleship vs an AI, a Mastermind-style code breaker, a Nonogram picture
logic puzzle, a Flow-Free-style pipe connector, Ball Sort, Bubble Shooter,
Dots & Boxes vs an AI, Pyramid Solitaire, Tangram, Word Scramble, a
Wordle-style word guesser, Air Hockey vs an AI, Marble Maze, mini Block
Drop (Tetris-style), an endless Lane Runner, mini Tower Defense, Rhythm
Tap, and Domino Match. One shared hub screen, one save file, one visual
theme.

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
    01-sliding/ .. 40-dominoes/
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

## The Capacitor/APK path

The app is wrapped for Android with [Capacitor](https://capacitorjs.com/),
and the project is shaped to make that painless:

- **No server calls for gameplay.** All state lives in `localStorage` via
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
- **An in-app update checker** (`shared/js/update-checker.js`) fetches
  `version.json` from the live GitHub Pages deployment on every launch -
  see "Staying up to date" below.

### Project layout for the Android wrap

```
puzzle-cascade/
  package.json              - @capacitor/core, @capacitor/android, @capacitor/cli
  capacitor.config.json     - appId com.joshmakespuzzles.app, webDir "www"
  scripts/prepare-android-www.js
                             - copies just the real site files (index.html,
                               shared/, games/, vendor/, icons/, manifest,
                               sw.js, version.json) into www/, since
                               Capacitor refuses to use the project root
                               itself as webDir. Never edit www/ directly -
                               it's regenerated from the real source files.
  android/                  - the generated native project, committed to
                               source control (build outputs are
                               .gitignore'd, the project itself isn't)
```

### Building the APK

This repo's own dev sandbox has no route to `dl.google.com`, so an actual
Android SDK / Gradle build can't run there - only the Capacitor
JS-side scaffolding (`cap add android`, syncing `www/`) is possible
locally. The real build happens in CI, where GitHub-hosted runners
already have the Android SDK preinstalled:

**`.github/workflows/build-android-apk.yml`** - run it from the Actions
tab (`workflow_dispatch`) or just push to `main` with changes under
`puzzle-cascade/`. It installs deps, regenerates `www/`, runs
`npx cap sync android`, builds a debug APK with `./gradlew assembleDebug`,
uploads it as a workflow artifact, and refreshes a `latest-apk` GitHub
Release with the APK attached so there's always one stable download link.

To build locally on a machine that *does* have the Android SDK:

```bash
cd puzzle-cascade
npm install
node scripts/prepare-android-www.js   # regenerate www/ from the real site files
npx cap sync android
cd android
./gradlew assembleDebug               # -> android/app/build/outputs/apk/debug/
# or: npx cap open android            # open in Android Studio instead
```

The debug APK is debug-signed (Android's default debug keystore) - fine
for sideloading and testing, not for a Play Store release. For that you'd
add a real signing config to `android/app/build.gradle` and build
`assembleRelease` instead.

### Staying up to date

Because a native app bundle can't silently patch its own compiled code,
"checking for updates" here means: on every launch, `update-checker.js`
fetches `version.json` from the live Pages deployment (falling back to
the known `https://jla92-bit.github.io/...` URL when the origin isn't
`http(s)` - i.e. when running inside the Capacitor WebView) and compares
it to the last version this device has seen. If it's newer, the new
changelog entries are logged to the console, saved to a persisted
"update log" (`localStorage`, separate from save data), and surfaced as
a toast; the full history is browsable from **Settings > What's New**.
`version.json` itself is regenerated on every `deploy-pages.yml` run with
a monotonically increasing version, the deployed commit SHA, and a
changelog built from the commit subjects since the last deploy - no
manual bookkeeping required.
