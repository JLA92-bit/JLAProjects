# Asset library — what's available to pull from

This is a reference catalog of CC0 assets confirmed reachable from this
sandbox (all via `git clone` of `ETdoFresh/kenney.nl`, a GitHub mirror of
Kenney's asset packs — see `CREDITS.md` for the licensing chain). Direct
downloads from itch.io, poly.pizza, OpenGameArt, and similar sites are
network-blocked here; GitHub mirrors are not, which is why every asset
this project uses came from that route. Only a small fraction of what's
listed below has actually been copied into this repo — everything else is
one `git clone --filter=blob:none --sparse` away, listed here so a future
request doesn't have to re-discover it from scratch.

To pull a new file: sparse-clone the pack (see the commands under each
section), copy the specific `.glb` into the relevant `assets_3d/<kit>/`
folder here, add a `world_scenes["key"] = load(...)` line in
`_load_world_assets()`, and run the standard headless editor pass
(`--editor --rendering-driver opengl3 --quit-after 40`) once to generate
its `.import` file — `scripts/Main.gd`'s existing `_load_world_assets()`
and `_build_scenery()` show the pattern for both simple loads and
multi-piece assemblies (see the farmhouse).

## Already in this repo

- `nature_kit/` — 27 of 329 available pieces (ground, crops, fences, trees,
  rocks, flowers, mushrooms, a stump, a sign, a bush).
- `character/` — full Blocky Characters kit (player model + skin).
- `fantasy_town_kit/` — 4 of ~160 available pieces (the farmhouse's walls,
  roof, and chimney).
- `food_kit/` — 1 of 200 available pieces (tomato).
- `textures/` — a real grass photo texture and Kacie's portrait (not from
  Kenney; see CREDITS.md for those two specifically).
- `animal_models/` — real cow and sheep models converted from `.blend`
  source via `bpy` (see the new section below and CREDITS.md).

## Blender `.blend` sources — a whole new asset class, via `bpy`

`pip install bpy` (Blender 5.x as a plain Python module, no GUI install or
network access to blender.org needed beyond PyPI) unlocks any GitHub repo
that ships raw `.blend` files instead of pre-exported glTF/FBX — those were
previously unusable here. This matters because a lot of CC0 model work
(especially older/hobbyist packs) is only ever committed as `.blend`.

Conversion pattern (see the cow/sheep conversion for the working version):
1. `bpy.ops.wm.open_mainfile(filepath=...)` the `.blend`.
2. Check `bpy.data.materials` / node trees — CC0 `.blend` files quite often
   have geometry and a texture PNG sitting right next to each other in the
   repo, but with the two never actually wired together in the material
   (this was true for both the cow and sheep source files here). Fix by
   creating a new material, adding a `ShaderNodeTexImage` node,
   `bpy.data.images.load(png_path)`, and linking it to the Principled
   BSDF's Base Color input, then assigning it to the mesh.
3. `obj.dimensions` to sanity-check scale before exporting — these
   Minetest-authored models were ~10-20x this project's tile scale.
3. `bpy.ops.export_scene.gltf(filepath=..., export_format='GLB')` — GLB
   embeds the texture in the one file, no separate `.png` to track.
4. Sanity-check the result by rendering it in a throwaway Godot project
   (a `Node3D` with a `WorldEnvironment`, one `DirectionalLight3D`, the
   loaded model, and a `Camera3D` backed off far enough for the model's
   actual scale) before touching the real project - headless via
   `--write-movie ... --quit-after 5`, same pattern as verifying any other
   change in this repo.
5. Only then copy the `.glb` into `assets_3d/`, run the standard `.import`-
   generation editor pass, and wire it into `_load_world_assets()`.

Not every `.blend` source is texture-complete - the `Animal_Models` repo's
own Red Junglefowl (chicken) `.blend` had geometry but zero real material
data, and a manual color guess didn't look convincing enough to use. A
*different* source (see below) turned out to have a real, textured chicken
after all - worth checking more than one source for the same animal before
settling for procedural.

**Known good sources**:
- `sirrobzeroone/Animal_Models` (CC0, made for Minetest) — Auroch (cow
  ancestor, used) and Mouflon (sheep ancestor, used). `.blend` format.
- `minetest-mirrors/mobs_animal` (mirror of the "Mobs Redo: Animals"
  Minetest mod, mixed CC0/MIT/CC-BY-SA per-model — see its `license.txt`
  in full, reproduced in `CREDITS.md`) — real textured chicken (CC0) and
  "Pumba" wild boar (MIT), both used; also has rat, bunny, kitten, panda,
  penguin, bee models if this game ever wants more animal variety. Ships
  `.b3d` (Irrlicht engine format) rather than `.blend`/glTF - needs the
  `io_scene_b3d` Blender addon (GreenXenith/joric on GitHub, GPL-2.0)
  loaded into `bpy` (not installed as a real addon, just its Python module
  imported directly with `bpy`/`mathutils`/etc. patched into its namespace
  since it assumes Blender's addon-relative-import context) before the
  same open→wire-texture→export pipeline works. A `.b3d` file's texture
  reference can point at a placeholder/tint-only image rather than the
  real painted texture (this happened with the chicken) - check the
  referenced PNG's actual pixel content isn't blank before trusting it.

## Kenney "Nature Kit" 2.1 — `kenney_natureKit_2.1/Models/GLTF format/`
329 models total. Already a rich decoration set beyond what's copied in:

- **More crops**: `crop_carrot.glb`, `crop_turnip.glb` — real models for
  crop types beyond wheat/corn/tomato/pumpkin, if the game ever adds them.
  `crops_bambooStageA/B.glb` also exists as another staged-growth plant.
- **More trees**: every tree comes in `_dark` and `_fall` color variants
  (e.g. `tree_oak.glb`, `tree_oak_dark.glb`, `tree_oak_fall.glb`) — could
  tie the backdrop's tree color to the game's existing season system
  (Spring/Summer/Fall/Winter) instead of using one tree year-round. Also:
  `tree_palm*`, `tree_pine*` (many size variants), `tree_blocks`,
  `tree_plateau`, `tree_thin`, `tree_tall`, `tree_small`.
- **Water/river tiles**: `ground_river*.glb` (straight/bend/corner/cross/
  end/split, plus a stone-bank variant) — a real water feature if the
  farm ever gets a pond or stream.
- **Paths**: `ground_path*.glb` (straight/bend/corner/cross/end/split) and
  `path_stone*.glb` / `path_wood*.glb` — could lay an actual walking path
  from the fence gate to the farmhouse instead of bare grass.
- **Cliffs**: a full `cliff_*_rock.glb` / `cliff_*_stone.glb` modular set
  (blocks, slopes, corners, steps, waterfalls) — enough for real terrain
  elevation if the flat farm ever needs a hill or cliff edge.
- **More rocks/stones**: `rock_large{A-F}`, `rock_small{A-I}`,
  `rock_tall{A-J}`, `stone_large{A-F}`, `stone_small{A-I}`,
  `stone_tall{A-J}` — dozens of unused variants for scatter variety.
- **More flowers**: 3 variants each of red/yellow/purple
  (`flower_redA/B/C.glb` etc.) — only one of each color used so far.
- **Bushes**: `plant_bush.glb` (used), plus `plant_bushDetailed`,
  `plant_bushLarge`, `plant_bushLargeTriangle`, `plant_bushSmall`,
  `plant_bushTriangle`.
- **Logs/stumps**: `log.glb`, `log_large.glb`, `log_stack.glb`,
  `log_stackLarge.glb`, `stump_old(Tall)`, `stump_square(Detailed(Wide))`.
- **Water plants**: `lily_large.glb`, `lily_small.glb`, `hanging_moss.glb`.
- **Camp/rustic props**: `campfire_bricks/logs/planks/stones.glb`,
  `pot_large.glb`, `pot_small.glb`, `canoe.glb` + paddle, `bridge_*`
  (wood and stone, many variants), `sign.glb` (used, one instance).
- **Ruins/statues** (less farm-appropriate, but available):
  `statue_block/column/columnDamaged/head/obelisk/ring.glb`.
- **Cactus, tents** (desert/camping, unlikely to fit this game's theme):
  `cactus_short/tall.glb`, `tent_*.glb`.

```bash
git clone --filter=blob:none --sparse https://github.com/ETdoFresh/kenney.nl.git kenney_mirror
cd kenney_mirror && git sparse-checkout set "kenney_natureKit_2.1/Models/GLTF format"
```

## Kenney "Fantasy Town Kit" — `fantasy-town-kit-1.0/Models/GLTF format/`
~160 models, a full modular medieval/fantasy town-building kit (CC0,
confirmed independently against kenney.nl - see CREDITS.md). Only the
plain wood wall, door wall, gable roof, and chimney are used (the
farmhouse). Still available:

- **More wall variants**: stone walls (`wall.glb`, `wallBlock`,
  `wallCorner`, `wallCurved`, `wallBroken`, arches, etc. - a full parallel
  stone set to the wood one already used), plus `wallWoodWindowGlass`,
  `wallWoodWindowRound`, `wallWoodWindowShutters`, `wallWoodWindowSmall`,
  `wallWoodWindowStone` (window variety - the farmhouse tried the glass
  one and reverted to plain walls because the glass read as a solid black
  square at this camera's distance; the *small* or *shutters* window
  might read better and is worth trying if the farmhouse gets revisited).
- **More roofs**: `roofFlat`, `roofHigh` (+ corner/gable/flat variants),
  `roofCorner`, `roofCornerRound` — could build a second, differently-
  shaped building (a barn or shed) alongside the farmhouse.
- **Fences/hedges**: `fence.glb`, `fenceBroken`, `fenceCurved`,
  `fenceGate.glb`, `hedge.glb`, `hedgeCurved`, `hedgeGate` — an
  alternative fence style if the Nature Kit one ever needs variety.
  `fenceGate`/`hedgeGate` in particular could mark the farm's entrance.
  visually rather than a plain fence segment.
  - a `pillarWood`/`pillarStone`, `lantern.glb`, `chimney` variants, and
  `cart.glb`/`cartHigh.glb` (a produce cart - thematically perfect for a
  farm stand or market stall if that's ever added as a feature).

```bash
cd kenney_mirror && git sparse-checkout add "fantasy-town-kit-1.0/Models/GLTF format"
```

## Kenney "Food Kit" — `foodKit_v1.2/Models/GLTF format/`
~200 models of real food items. Only `tomato.glb` used so far. Relevant
if crop variety expands, though Nature Kit's own `crop_carrot`/
`crop_turnip` (above) are a better style match for garden crops than Food
Kit's kitchen-table-scale items (tomato needed a 2.4x scale-up to match).
Worth checking for specific produce names if a new crop type is added.

```bash
cd kenney_mirror && git sparse-checkout add "foodKit_v1.2"
```

## Kenney "Holiday Pack" — `kenney_holidaypack/Models/GLTF format/`
A full winter-cabin building kit (`cabinWall/Roof/Door/Window/Corner...`,
much like Fantasy Town Kit's wood set) plus standalone winter/holiday
props: `present.glb` (+ Low/Round variants), `candyCane.glb` (+ Mint),
`lightsGreen/Multi/Red.glb`, `lightpost.glb`, `sled.glb`,
`rockFormationLarge/Medium/Small.glb`, `bench.glb`. Not pulled in - would
only make sense tied to the game's existing Winter season, e.g. seasonal
decoration that only appears during the Winter season_idx.

```bash
cd kenney_mirror && git sparse-checkout add "kenney_holidaypack"
```

## Audio — 8 clips now in use, everything else still available
`assets_audio/` (see its own `CREDITS.md`) now has 8 sound effects - 7
short one-shots for tool use/harvest/sell feedback plus one longer
Act-cleared/victory fanfare - via a single shared `AudioStreamPlayer`
(`_play_sfx()` in `scripts/Main.gd`). All three source packs have plenty
more still unused:
- `kenney_interfacesounds/` — 100 short UI sound effects total, 4 pulled
  in (drop/confirmation/error/click - see `assets_audio/CREDITS.md`).
  Remaining categories (`back`, `bong`, `close`, `glass`, `glitch`,
  `maximize`, `minimize`, `open`, `pluck`, `question`, `scratch`,
  `scroll`, `select`, `switch`, `tick`, `toggle`) could round out menu-
  open/close feedback if the UI grows more panels.
- `kenney_impactsounds/` — 130 short impact/hit sounds total, 3 pulled in
  (mining/soft-medium for till/water, grass footstep for player movement).
  Remaining footstep surfaces (carpet/concrete/snow/wood) are unused -
  could swap in if the farm ever gets a real path/floor surface underfoot
  instead of always grass. More impact material types (bell, glass,
  metal, plank, plate, punch, tin, wood) also unused if specific actions
  want a more distinct sound.
- `kenney_musicjingles/` — 1 of ~59 clips pulled in (`jingles_NES00` from
  the "8-Bit jingles" subfolder, for Act-cleared/victory - see
  `assets_audio/CREDITS.md`). Also has "Hit jingles" (17), "Pizzicato
  jingles" (17), and "Sax jingles" (9) subfolders, plus the other 16
  NES-style clips, all untried - a different jingle per Act, or a
  jingle picked by which crop/upgrade triggered the milestone, would be
  easy variety to add later.

No ambient/looping background music has been added at all yet.

```bash
cd kenney_mirror && git sparse-checkout add "kenney_interfacesounds" "kenney_impactsounds" "kenney_musicjingles"
```

## Not useful for this game (surveyed and ruled out)
- `kenney-animalpack/`, `kenney_animalpackredux/` — 2D icon sprites (zoo
  animals, not farm animals), not 3D models. This is why the farm animals
  in this game are procedural rather than sourced - see the "Procedural"
  section below in CREDITS.md for the fuller explanation.
- `kenney_foliagepack` - listed in the mirror's top-level directory but
  contains no `.glb`/`.gltf` files when checked (2D-only or empty in this
  mirror).
