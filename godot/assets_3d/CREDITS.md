# 3D asset credits

All models in this directory are CC0 (public domain) by Kenney (www.kenney.nl),
sourced from the `ETdoFresh/kenney.nl` GitHub mirror. No attribution is legally
required, but it's credited here anyway.

- `nature_kit/` — Kenney "Nature Kit" 2.1 (ground, crops, fences, trees,
  plus a much wider scatter of rocks/flowers/mushrooms/stumps/bushes/a
  sign/a gate/a stone path for backdrop variety - see
  `_build_backdrop_decor()` in `scripts/Main.gd`, which scatters this set
  across the whole area past the farm instead of just a handful of
  hand-placed pieces near the fence). See `nature_kit/LICENSE.txt`. This
  pack has 329 models total and only a fraction are pulled in here - see
  `ASSET_LIBRARY.md` for the rest of what's available from it and other
  Kenney packs without needing to re-search.
- `character/` — Kenney "Blocky Characters" (player model + skin texture).
  See `character/LICENSE.txt`.
- `textures/kacie_portrait.png` — portrait of Kacie, the game's first NPC,
  provided directly by the project owner for use in the intro dialogue.
  Background checkerboard removed and image cropped/downscaled for use as
  an in-game dialogue portrait.
- `textures/grass_real.webp` — a real, seamless, tileable grass photo
  texture from the official Godot Engine `godot-demo-projects` repository
  (`3d/truck_town/town/materials/grass.webp`), used in place of Kenney's
  flat solid-color grass tile for a more realistic farmland look. That
  repository is MIT licensed (Copyright (c) 2014-present Godot Engine
  contributors); no separate per-asset license file was present for this
  texture, so it falls under the repo's blanket MIT license.
- `fantasy_town_kit/` — pieces from Kenney's "Fantasy Town Kit", sourced
  from the same `ETdoFresh/kenney.nl` mirror as everything else above. No
  per-kit license file exists in that folder of the mirror, so it falls
  under the repo's blanket CC0 README statement - independently
  corroborated against kenney.nl's own listing for this kit. The wall
  pieces are each modeled to occupy one edge of a 1x1x1 cell, so the same
  piece is instantiated 4 times at 90-degree yaw increments to close a
  small box, with a roof piece capping it - see `_build_wall_box_scene()`
  in `scripts/Main.gd`, used for three separate buildings:
  - `wallWood`/`wallWoodDoor`/`roofGable`/`chimney` — the farmhouse.
  - `wallWood`/`wallWoodDoor`/`roofHigh` — a barn (no chimney, taller roof
    for a distinct silhouette next to the farmhouse).
  - `wall`/`wallDoor`/`wallWindowShutters`/`roofGable`/`chimney` — a stone
    cottage (the kit's stone wall set instead of wood, shuttered window
    instead of a door on the front face).
  Plus two single-piece props used as-is: `stall` (a market stall) and
  `cart` (a produce cart) - both placed near the buildings as a small
  village cluster behind the farmhouse (see `_build_village()`), so the
  area past the fence reads as "a farm on the edge of a settlement"
  instead of one lone house facing empty grass.
- `food_kit/tomato.glb` — from Kenney's "Food Kit", same mirror as above,
  replacing the melon model that previously stood in for tomato's
  ready-to-harvest stage. Modeled at Food Kit's own (much smaller,
  kitchen-table) scale, so it's scaled up 2.4x at instantiation time to
  match the other ready-to-harvest crops (see `_update_tile_visual()` in
  `scripts/Main.gd`).

- `animal_models/cow.glb`, `animal_models/sheep.glb` — real, textured 3D
  models by Sirrobzeroone (CC0, https://creativecommons.org/publicdomain/zero/1.0/),
  sourced from the `sirrobzeroone/Animal_Models` GitHub repo (the Auroch
  "cow ancestor" and Mouflon "sheep ancestor" models, made for the
  Minetest game engine but explicitly released for use in any
  software/project). The repo ships `.blend` source files rather than a
  pre-exported glTF, so these were converted headlessly with `bpy`
  (Blender's pip-installable Python module — `pip install bpy`, no GUI
  Blender needed) by opening the `.blend`, wiring the matching texture PNG
  into the material's Base Color via a new `ShaderNodeTexImage` node
  (the source materials had no image hookup at all), and exporting to
  `.glb`. Modeled at Minetest-mob scale (tens of Blender units across),
  much larger than this project's `WORLD_TILE = 1.0` convention, so
  `_build_real_animal_scene()` in `scripts/Main.gd` wraps each in a scaled
  root node tuned to read as a believable size next to the fence/crops.
- `animal_models/chicken.glb` — real, textured model and texture by
  JK Murray (CC0), `animal_models/pig.glb` — real, textured "Pumba" wild
  boar model by Krupnov Pavel / TenPlus1 (MIT License, Copyright (c) 2014
  Krupnov Pavel and 2016 TenPlus1 — see the full text at
  `mobs_animal`'s `license.txt`; MIT requires the copyright/permission
  notice be kept, which this entry does). Both sourced from
  `minetest-mirrors/mobs_animal` (a GitHub mirror of the Minetest
  "Mobs Redo: Animals" mod, `codeberg.org/tenplus1/mobs_animal`), shipped
  as `.b3d` (an older Irrlicht-engine model format) rather than glTF.
  Converted headlessly using the `io_scene_b3d` Blender import addon
  (GreenXenith/joric, GPL-2.0 — a conversion *tool*, not redistributed
  with this repo; using a GPL-licensed tool to convert separately-licensed
  assets doesn't relicense the output, same as opening a CC0 image in GIMP)
  loaded directly into `bpy` without a full addon install. The pig's
  texture had to be manually wired to the material afterward, same pattern
  as the cow/sheep; the chicken model already referenced a texture by name,
  but that particular filename (`mobs_chicken_white.png`) turned out to be
  a blank 16x16 placeholder (a recolor-tint base, not real art) - swapped
  for the actual painted `mobs_chicken.png` (128x128) after import.

## Procedural (not sourced)

None of the four farm animals remain procedural as of this pass (was:
chicken and pig, built from primitive meshes via a now-removed
`_build_animal_scene()`). Kept here as a pointer in case a future source
turns out to be a worse fit than expected and one needs reverting.

## Known gaps (follow-up work)

- Tomato and Pumpkin still use the generic "leafs" plant for their
  growing stages (Nature Kit has no staged-growth model for either) - only
  their ready-to-harvest stage now has a real matching model.
