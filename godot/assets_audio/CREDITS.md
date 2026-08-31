# Audio credits

All sound effects here are CC0 (public domain) by Kenney (www.kenney.nl),
sourced from the `ETdoFresh/kenney.nl` GitHub mirror (`kenney_interfacesounds`
and `kenney_impactsounds` packs — see `LICENSE.txt`, and `assets_3d/ASSET_LIBRARY.md`
for the fuller catalog of what else is available from these two packs).
This is the game's first audio at all - short, punchy one-shots for tool
use, harvesting, and selling, played through a single shared
`AudioStreamPlayer` (`_play_sfx()` in `scripts/Main.gd`). No music or
ambient loops yet - see `ASSET_LIBRARY.md`'s "Audio" section for
`kenney_musicjingles`, a likely next step for something like an Act-cleared
fanfare.

- `till.ogg` (impactMining_000) — hoe tilling grass into soil.
- `water.ogg` (impactSoft_medium_000) — watering can use. Kenney's packs
  have no real water/splash sound, so this soft impact stands in; revisit
  if a proper splash turns up in a future search.
- `plant.ogg` (drop_002) — seed bag planting.
- `harvest.ogg` (confirmation_001) — successful harvest.
- `success.ogg` (confirmation_003) — cure, fertilize, and selling produce/
  processed goods (a different confirmation variant than harvest, so the
  two don't sound identical back-to-back in a typical play session).
- `error.ogg` (error_002) — any failed/invalid tool-use attempt (wrong
  tile type, nothing to act on, insufficient cash/seeds/fertilizer, a
  locked tool) and unlocked-tool selection.
- `click.ogg` (click_003) — tool selection (only on a successful switch,
  not on the locked-tool case, which plays `error.ogg` instead).
