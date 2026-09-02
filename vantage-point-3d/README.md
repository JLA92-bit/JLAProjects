# Vantage Point 3D (prototype)

A Three.js reimagining of [Vantage Point](../vantage-point/) — instead of tapping
hotspots on a flat illustrated scene, the player stands in a fully explorable
3D room, drags to look around, pinches (or scrolls) to zoom, and taps 3D
objects to inspect them.

**Status: Level-1-only prototype.** "The Study" is fully playable end to
end — welcome/name entry, briefing, the 3D room, case file, and a real
accusation/ending using whatever evidence you actually found. Levels 2-5 are
not modeled. This is additive: it does not touch or replace the 2D game at
`../vantage-point/`, which remains the complete, shipped version.

## Why this exists, and its real limitation

This was built in response to "build this game in Three.js." Two things are
worth understanding before extending it:

1. **No 3D model generation is available**, the same way no photorealistic
   image generation was available for the 2D game's scene art. The room and
   every object in it (desk, lamp, letter opener, wine glasses, fireplace,
   bloodstain, photo frame, bookshelf) is built from primitive Three.js
   geometry — boxes, cylinders, spheres, planes — composed in code, not
   imported models. That reads as a distinct "low-poly noir" look, not
   photoreal. Getting real modeled furniture would need either hand-authored
   `.glb`/`.gltf` assets from an artist/asset store, or a 3D-model-generation
   tool, neither of which is available here.
2. **Camera is fixed-point, not free-walk.** The player stands at one spot
   per room and looks around (drag = look, pinch/wheel = zoom via FOV) —
   this was a deliberate scope choice to keep touch controls close to what
   the 2D game already had proven on mobile, rather than adding movement,
   collision, and a virtual joystick.

## Running it locally

```bash
cd /path/to/JLAProjects  # repo root — index.html loads ../vantage-point/src/style.css
python3 -m http.server 8080
# open http://localhost:8080/vantage-point-3d/index.html
```

Must be served over HTTP (same as the 2D game) — `fetch()` for the case
JSON and ES module imports don't work over `file://`.

## Structure

```
vantage-point-3d/
  index.html              screen templates + import map for Three.js
  vendor/three.module.min.js   Three.js r160, vendored locally (MIT license
                                in vendor/THREE-LICENSE) rather than loaded
                                from a CDN — this environment's network
                                policy blocks CDN hosts entirely, so a CDN
                                import map would fail to load. Bump the
                                version by re-running the vendoring step
                                below if you need a newer Three.js.
  data/
    case.json               same case content as the 2D game (copied)
    level-1-clues.json      same Level 1 clue list as the 2D game (copied) —
                             titles/flavor/evidenceId are reused; x/y/radius
                             fields are unused here (3D positions live in
                             code, in scene3d.js)
  src/
    style-3d.css             incremental styles on top of
                              ../vantage-point/src/style.css
    main.js                  state machine / screen router (single-level
                              version of the 2D game's main.js)
    state/store.js            localStorage save/load, separate keys from
                               the 2D game so both can coexist
    components/
      scene3d.js               the 3D room, camera controls, and
                                raycast-based clue interaction
      casefile.js               corkboard (adapted for one level)
      accusation.js              copied unchanged from the 2D game — the
                                  accusation logic itself is level-agnostic
```

### Re-vendoring Three.js

The CDN import map approach (the normal way to use Three.js with no build
step) doesn't work in this environment because outbound network access to
CDN hosts (`unpkg.com`, `cdn.jsdelivr.net`, `cdnjs.cloudflare.com`) is
blocked by network policy. `npm`'s registry is reachable, though, so the
module was vendored by installing the package and copying its build output:

```bash
mkdir /tmp/three-vendor && cd /tmp/three-vendor
npm install three@0.160.0 --no-save
cp node_modules/three/build/three.module.min.js /path/to/vantage-point-3d/vendor/
cp node_modules/three/LICENSE /path/to/vantage-point-3d/vendor/THREE-LICENSE
```

If CDN access is available in whatever environment you're extending this
from, switching back to a CDN import map works too — it's a one-line change
in `index.html`'s `<script type="importmap">`.

## Extending to Levels 2-5

Each level needs, in `src/components/scene3d.js`:

1. A `buildRoom()`-equivalent for that level's space (currently only "The
   Study" — a `buildRoomForLevel(levelId, scene)` dispatcher would be the
   natural refactor once there's more than one room).
2. A `buildClues()`-equivalent placing that level's clue objects (ids come
   from `data/level-N-clues.json`, which would need to be added the same
   way `level-1-clues.json` was copied from the 2D game).
3. Noise/decoy objects (levels 3+) — same idea as real clues, registered
   with `type: 'noise'` in the data and no `onClueFound` evidence linkage.

`main.js` would also need to go from single-level to the same
`goToLevel(index)` loop the 2D game's `main.js` already has — that part
doesn't need reinventing, just porting.

## What's not built

- Levels 2-5 (see above).
- Hints and the magnifier tool (the 2D game has both; this prototype has
  neither — zoom via pinch/scroll covers some of what the magnifier did,
  but there's no hint-pulse equivalent yet).
- Sound.
- Any mobile performance tuning beyond what Three.js gives by default —
  this hasn't been profiled on real mid-range hardware, only tested
  headlessly.
