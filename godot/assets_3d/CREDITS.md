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

## Known gaps (follow-up work)

- No farm animal models sourced yet (pig/sheep/cow/chicken) — the animal
  scenery from the old 2D art was dropped rather than left as inconsistent
  flat sprites in the new 3D scene.
- No farmhouse model — dropped for the same reason.
- Tomato and Pumpkin have no dedicated staged-growth model in Nature Kit;
  both use the generic "leafs" plant for their growing stages, with the
  melon model as tomato's ready-to-harvest stand-in and the pumpkin model
  as pumpkin's (see `_crop_mesh_key()` in `scripts/Main.gd`).
