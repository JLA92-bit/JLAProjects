# Vantage Point

A mobile-first, noir detective clue-hunt game. Examine photo-realistic crime
scenes, tap to find hidden clues, review your case file, and make a final
accusation. Plain HTML5 + CSS + JavaScript (ES modules, no build step),
installable as a PWA.

**Status: playable MVP.** The full loop works end to end — welcome/name
entry, briefing, 5 levels, case file, accusation, both endings. Branding
(wordmark, app icons, corkboard pin, magnifier tool icon, film grain) is
real, designed art. Scene backgrounds are still **labeled placeholder
images**, not final photo-realistic art — that's the one piece left. See
[Swapping in real art](#swapping-in-real-art) below.

## Running it locally

No build step. Any static file server works, e.g.:

```bash
cd vantage-point
python3 -m http.server 8080
# open http://localhost:8080/index.html on a phone or a resized browser window
```

Because it's plain ES modules + `fetch()` for the JSON data, it must be
served over HTTP(S) — opening `index.html` directly via `file://` will fail
the `fetch()` calls in most browsers.

## How the game is structured

```
vantage-point/
  index.html              all screen markup, as inert <template> blocks
  manifest.webmanifest     PWA manifest
  sw.js                    offline-caching service worker
  icons/                   PWA icons — real designed art (icon-192/512, maskable-512)
  scenes/                  one image per level: level-N.svg (placeholder) or .jpg (final)
  data/
    case.json               case metadata: title, briefing, suspects, motives,
                             evidence, the solution, and the 5 level definitions
    level-N-clues.json       hotspot map for level N (see below)
  src/
    style.css               noir visual style, mobile-first
    main.js                  state machine / screen router
    state/store.js           localStorage save/load
    brand/                   real SVG art: wordmark(-stacked), pin, magnifier, grain
    components/
      panzoom.js             custom pinch-zoom + pan (no library)
      scene.js                tap-to-inspect, magnifier, hints, toast feedback
      casefile.js             corkboard of found clues
      accusation.js           final suspect/motive/evidence picker
  scripts/make-placeholders.py   regenerates the placeholder scene SVGs
  tools/clue-calibrator.html     drop in a real scene photo, click clues, export level JSON
  SHOT-LIST.md                   per-level art brief for the 5 scene backgrounds
```

### Game flow (state machine, driven by `src/main.js`)

```
welcome (name entry, once) → intro/briefing → level intro (Day N) → scene
  → [repeat per level] → accusation → ending (Case Closed / Case Cold)
```

Case file is a modal-like screen reachable from any scene via the 🗂 button;
closing it returns to the scene in progress.

### Adding a new case

1. Duplicate `data/case.json` (or edit it directly) — update `id`, `title`,
   `briefing`, `suspects`, `motives`, `evidence`, `solution`, and the 5
   entries in `levels`.
2. For each level, add `data/level-N-clues.json` with this shape:

   ```json
   {
     "level": 1,
     "baseImageWidth": 1200,
     "clues": [
       {
         "id": "unique-id",
         "type": "real",           // "real" or "noise" (dead-end distractor)
         "x": 62.0,                 // % of image width
         "y": 54.0,                 // % of image height
         "radius": 60,               // px at baseImageWidth; scales with the displayed image
         "title": "Short label",
         "flavor": "Flavor text shown when tapped.",
         "evidenceId": "letter-opener"  // optional — must match an id in case.json's "evidence" list
       }
     ]
   }
   ```

3. Drop a scene image at `scenes/level-N.jpg` (or `.svg` while placeholder)
   and point `case.json`'s `levels[N].image` at it.
4. Tune `requiredClues` (the "good enough" threshold to unlock Continue)
   and `clueGoal` (total real clues, used for the HUD pip count) per level.

### Difficulty scaling

Difficulty is entirely data-driven per level, via the clue JSON:

- **Size** — `radius` shrinks level over level (roughly 60 → 40 → 28 → 18 → 10px
  in the shipped case).
- **Count/density** — more clues per scene in later levels.
- **Distraction** — `"type": "noise"` hotspots (from level 3 on) give flavor
  text but don't count toward progress — dead ends that look plausible.
- **Camouflage** — this one lives in the *art*, not the code: later scene
  images should color/texture-match clues to their surroundings. The
  placeholder art can't demonstrate this; it'll show up once real/AI photos
  are dropped in.
- The magnifying glass (`level.magnifierUnlocked`) is available from level 3
  on in the shipped case, with a limited number of uses per level
  (`MAGNIFIER_USES_PER_LEVEL` in `src/components/scene.js`).

## Swapping in real art

Every scene is currently a generated placeholder SVG (regenerate them via
`python3 scripts/make-placeholders.py`) — a solid noir-toned background with
the level name stamped on it, clearly **not** final art.

To finish the game, replace each `scenes/level-N.svg` with a real photo or
photo-realistic AI-generated image (`scenes/level-N.jpg`), then update the
`"image"` field for that level in `data/case.json`. Hotspot coordinates are
stored as **percentages** of the image, so a same-aspect-ratio replacement
image needs no coordinate changes — only re-check placement if the new
image's composition differs meaningfully from the placeholder's implied
layout.

**[`SHOT-LIST.md`](./SHOT-LIST.md)** is the actual art brief — deliverable
spec (3:4 portrait, 1200×1600 min, level 5 needs 2400×3200), grade/palette
notes, and a per-level table of every clue's exact target position and
size as a % of frame width, taken directly from the shipped
`data/level-N-clues.json`. Compose to it and no coordinate rework is
needed. If a scene gets shot to a different composition anyway, use
`tools/clue-calibrator.html` instead — drop the photo in, click each clue,
export ready-to-paste JSON.

## Mobile/PWA notes

- Page-level pinch-zoom and double-tap-zoom are disabled (`touch-action:
  none` + `gesturestart`/`touchend` guards in `index.html`) so the only zoom
  gesture on the page is the custom one on the scene image.
- Progress (found clues, hints used, current level, accusation, detective
  name) is saved to `localStorage` after every action, so closing and
  reopening mid-case resumes exactly where you left off.
- `sw.js` caches the app shell, data, and scene images for offline play once
  a case has been opened once. Bump `CACHE_NAME` in `sw.js` after changing
  any cached file so clients pick up the update.
- Hit areas are intentionally larger than the visual clue radius (1.6x, see
  `positionHotspotSize` in `src/components/scene.js`) so tiny late-game
  clues stay hard to *spot* without being physically unreachable on a touch
  screen.

## Known follow-ups (flagged, not blocking)

- **Final scene art** — see above; this is the only real placeholder left.
- Only one case ships (`the-hargrove-affair`). A case-select menu is a
  natural next step once more cases exist.
- No sound design yet (a soft "miss" tick and a satisfying "found" chime
  would sell the tap-to-inspect loop well).
