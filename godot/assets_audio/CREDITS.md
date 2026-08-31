# Audio credits

All sound effects here are CC0 (public domain) by Kenney (www.kenney.nl),
sourced from the `ETdoFresh/kenney.nl` GitHub mirror - `kenney_interfacesounds`
(`LICENSE_interfacesounds.txt`), `kenney_impactsounds`
(`LICENSE_impactsounds.txt`), and `kenney_musicjingles`
(`LICENSE_musicjingles.txt`); see `assets_3d/ASSET_LIBRARY.md` for the
fuller catalog of what else is available from these three packs. Short,
punchy one-shots for tool use/harvesting/selling plus one longer fanfare
for Act-cleared/victory, all played through a single shared
`AudioStreamPlayer` (`_play_sfx()` in `scripts/Main.gd`). No ambient/
looping background music yet.

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
- `act_complete.ogg` (8-Bit jingles/jingles_NES00, 1.76s — the longest of
  the pack's 17 short NES-style jingles, picked over the rest for reading
  as more of a complete fanfare rather than a single blip) — plays when an
  Act's goal is reached (`_check_act_progress()`, right as the title card
  for the next Act appears) and again on the final victory banner when
  every region is owned.
