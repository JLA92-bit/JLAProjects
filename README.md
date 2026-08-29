# JLAProjects

## Farm World: Outbreak & Empire

A browser game combining farm management, a Stardew-style walkable farm, market/inventory
trading, and a Plague-Inc-style world map where crop blight can weaken (and let you buy out)
rival farming regions.

**Play:** open `index.html` directly, or serve the folder with any static file server. Once
this repo's GitHub Pages is enabled (Settings → Pages → source: GitHub Actions, on the `main`
branch), the game auto-deploys via `.github/workflows/deploy-pages.yml` on every push to `main`.

**Controls**
- Move: WASD / Arrow keys (or the on-screen d-pad on touch devices)
- Action (till / plant / water / harvest): `E` or the Action button
- Cure blight: `C` or the Cure button
- Select seed: `1` Wheat, `2` Corn, `3` Tomato (or tap a seed row)
- World map: `M` or the Map button

Progress autosaves to `localStorage` every 10 seconds.

Placeholder emoji art is used throughout — swap in real sprite sheets/tiles in `game.js`
(the `drawScene` function) whenever assets are ready; no gameplay logic needs to change.
