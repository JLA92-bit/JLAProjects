# 3D asset credits

All models in this directory are CC0 (public domain) by Kenney (www.kenney.nl),
sourced from the `ETdoFresh/kenney.nl` GitHub mirror. No attribution is legally
required, but it's credited here anyway.

- `nature_kit/` — Kenney "Nature Kit" 2.1 (ground, crops, fences, trees,
  plus scattered rocks/flowers/mushrooms/a stump/a sign/a bush for
  backdrop variety). See `nature_kit/LICENSE.txt`. This pack has 329
  models total and only a fraction are pulled in here - see
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
- `fantasy_town_kit/` — a handful of pieces (`wallWood`, `wallWoodDoor`,
  `roofGable`, `chimney`) from Kenney's "Fantasy Town Kit", sourced from
  the same `ETdoFresh/kenney.nl` mirror as everything else above, used as
  the farmhouse landmark (see `_build_farmhouse_scene()` in
  `scripts/Main.gd`). No per-kit license file exists in that folder of the
  mirror, so it falls under the repo's blanket CC0 README statement -
  independently corroborated against kenney.nl's own listing for this kit.
  The wall pieces are each modeled to occupy one edge of a 1x1x1 cell, so
  the same piece is instantiated 4 times at 90-degree yaw increments to
  close a small box, with the gable roof capping it.
- `food_kit/tomato.glb` — from Kenney's "Food Kit", same mirror as above,
  replacing the melon model that previously stood in for tomato's
  ready-to-harvest stage. Modeled at Food Kit's own (much smaller,
  kitchen-table) scale, so it's scaled up 2.4x at instantiation time to
  match the other ready-to-harvest crops (see `_update_tile_visual()` in
  `scripts/Main.gd`).

## Procedural (not sourced)

- Chicken, pig, sheep, and cow scenery models (`_build_animal_scene()` in
  `scripts/Main.gd`) are built from primitive meshes (spheres/boxes/
  cylinders) at runtime, not a sourced asset pack. The usual CC0 low-poly
  farm-animal packs (itch.io, poly.pizza) aren't reachable from this
  sandbox's network, and no GitHub mirror of one turned up either. Good
  enough to read clearly as ambient scenery at the farm's camera distance;
  swap for real models if one becomes reachable later.

## Known gaps (follow-up work)

- Tomato and Pumpkin still use the generic "leafs" plant for their
  growing stages (Nature Kit has no staged-growth model for either) - only
  their ready-to-harvest stage now has a real matching model.
