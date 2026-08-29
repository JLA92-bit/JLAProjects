# Farm World: Outbreak & Empire — Godot port

A Godot 4.3 port of the browser game, aimed at a real Android APK build. All game logic
lives in `scripts/Main.gd`; `scenes/Main.tscn` is intentionally a bare root node — the
entire UI (HUD, tool panel, inventory, world map) and the farm grid are built at runtime
in code rather than hand-authored in the scene file, so everything is inspectable and
editable as plain text.

## Opening locally

1. Install [Godot 4.3](https://godotengine.org/download) (standard, non-.NET build).
2. Open Godot, choose **Import**, and select this `godot/` folder's `project.godot`.
3. Press **F5** (or the Play button) to run.

## Building the Android APK

You don't need Android Studio installed locally — pushing to `main` under `godot/`
triggers `.github/workflows/godot-android-build.yml`, which:

1. Downloads the Godot 4.3 editor + Android export templates.
2. Installs the Android SDK build tools via GitHub's runner.
3. Exports a **debug** APK (unsigned for release, fine for sideloading/testing) using
   `export_presets.cfg`.
4. Uploads it as a workflow artifact and attaches it to a rolling `android-latest`
   GitHub Release, so there's always a stable download link for the latest build.

This is a first pass at the CI config — GitHub Actions has full internet access (this
dev environment does not), so the very first run is the real test of the export
pipeline. If it fails, the Actions log will show exactly which step broke (SDK setup,
template download, or the export step itself), and that's fixable from there.

## What's ported so far

- 10x7 farm grid, walk/till/plant/water/harvest loop
- Four selectable tools (Hoe, Watering Can, Seed Bag, Cure Spray) with the same
  wilt-on-neglect / bonus-yield-on-good-care mechanics as the web version
- Seed inventory + fluctuating market with sell
- Blight infection/spread and Cure Spray
- World map: 20 regions across 4 continents, terrain-flavored, buyable for passive income
- On-screen D-pad + buttons for touch (Android), plus WASD/arrows + `1`-`4` + `E`/`M` for
  desktop testing
- Save/load via Godot's `user://` persistent storage

## Not yet ported / next steps

- Sprite-sheet walk animation for the player (currently a static per-direction frame)
- Camera scrolling for a farm/world bigger than one screen
- Proper release signing (a real Play Store build needs your own upload keystore —
  the CI config only produces a debug/sideload APK)
