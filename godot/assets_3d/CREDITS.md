# 3D asset credits

All models in this directory are CC0 (public domain) by Kenney (www.kenney.nl),
sourced from the `ETdoFresh/kenney.nl` GitHub mirror. No attribution is legally
required, but it's credited here anyway.

- `nature_kit/` — Kenney "Nature Kit" 2.1 (ground, crops, fences, trees).
  See `nature_kit/LICENSE.txt`.
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

## Procedural (not sourced)

- Chicken and pig scenery models (`_build_animal_scene()` in
  `scripts/Main.gd`) are built from primitive meshes (spheres/boxes/
  cylinders) at runtime, not a sourced asset pack. The usual CC0 low-poly
  farm-animal packs (itch.io, poly.pizza) aren't reachable from this
  sandbox's network, and no GitHub mirror of one turned up either. Good
  enough to read clearly as ambient scenery at the farm's camera distance;
  swap for a real model if one becomes reachable later.

## Known gaps (follow-up work)

- Sheep and cow are still missing (see the procedural note above for why
  a real asset pack couldn't be sourced) - could be added the same way
  the chicken and pig were.
- No farmhouse model.
- Tomato and Pumpkin have no dedicated staged-growth model in Nature Kit;
  both use the generic "leafs" plant for their growing stages, with the
  melon model as tomato's ready-to-harvest stand-in and the pumpkin model
  as pumpkin's (see `_crop_mesh_key()` in `scripts/Main.gd`).
