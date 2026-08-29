# Tiny Farm

A small, first-playable top-down farming game in the spirit of Stardew
Valley's camera and movement — built with plain HTML, CSS, and vanilla
JavaScript. No build step, no framework, no dependencies. Runs entirely in
the browser on an HTML5 canvas, so it can be hosted directly as a static
site (e.g. GitHub Pages).

## Play it

- **Move**: Arrow keys or WASD
- **Switch tool**: `1` Hoe, `2` Seed, `3` Harvest
- **Use tool**: Space (or click the canvas)

Loop: till a grass tile with the **Hoe** → plant a **Seed** on the tilled
soil → wait for it to grow through its stages → **Harvest** the ripe crop to
add it to your crop count in the HUD.

The tile your character is facing is outlined in white — that's the tile
your selected tool will act on.

## Run it locally

No build step needed. Any static file server works, for example:

```bash
cd farm-game
python3 -m http.server 8000
# then open http://localhost:8000 in a browser
```

(Opening `index.html` directly via `file://` also works in most browsers,
since there are no external asset fetches.)

## What's implemented (v1 scope)

- Tile-based 32x32 grid, ~18x18 farm map with a fenced border, a small pond,
  and a small barn/shed, all of which block movement
- Canvas camera that follows and centers on the player, clamped to the map
  edges
- 4-directional movement (WASD/arrows) with a simple walk bob animation and
  collision against fences, water, and buildings
- Till → plant → grow (3 visual stages, timer-based) → harvest loop for a
  single crop type
- Minimal HUD: selected tool and harvested crop count

Intentionally **not** in v1 (by design, per project scope): day/night
cycle, shop/economy, multiple crop types, save/load, full inventory UI.

## Assets

This build uses procedurally-drawn placeholder graphics rather than a real
sprite pack — the environment this was built in has no network access to
fetch the intended Kenney "Tiny Farm" tileset or an LPC-generated character
spritesheet. See [`assets/README.md`](assets/README.md) for details and how
to swap in real assets later, and [`CREDITS.md`](CREDITS.md) for licensing
notes on the intended asset sources.

## Deploying to GitHub Pages

This repo hosts more than one project, so Pages is deployed via a GitHub
Actions workflow (`.github/workflows/deploy-farm-game.yml`) that publishes
just the `farm-game/` folder, rather than serving the whole repo root.

The workflow runs on pushes to `main` that touch `farm-game/**`. To enable
it:

1. In the GitHub repo, go to **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Merge/push this folder to `main` — the workflow will build and deploy
   automatically. The Pages URL will be shown in the workflow run summary
   and under Settings → Pages (typically
   `https://<owner>.github.io/<repo>/`).
