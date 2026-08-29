# Assets

This build ships **no external image assets**. All tiles, the fence, water,
crops, and the player character are drawn procedurally with Canvas 2D
primitives (`game.js`, see `drawTile` / `drawCrop` / `drawPlayer`).

## Why no Kenney / LPC assets

The original plan (see the task this game was built from) was to use:

- Kenney's ["Tiny Farm"](https://kenney.nl/assets/tiny-farm) pack (CC0) for
  tiles/crops/fences, and
- The [Universal LPC Spritesheet Character
  Generator](https://liberatedpixelcup.github.io/Universal-LPC-Spritesheet-Character-Generator/)
  (CC-BY-SA / GPL) for a 4-direction farmer walk cycle.

The sandboxed environment this was built in has no outbound network access
to either site (requests are blocked at the network policy level), so the
files could not be downloaded and committed. Per the task's own fallback
instructions, the game uses simple placeholder graphics instead so movement,
tilling, planting, growth, and harvesting all work end to end.

## Swapping in the real assets later

Everything is drawn in one place, so this is a contained follow-up:

1. Download the Kenney Tiny Farm pack and drop the PNGs in this folder
   (e.g. `assets/tiles.png`, `assets/crops.png`, `assets/fence.png`).
2. Generate a farmer character from the LPC generator and export the
   walk-cycle spritesheet to `assets/player.png`. If you do this, add a
   `CREDITS.md` entry crediting the specific LPC contributors used, per the
   CC-BY-SA/GPL license (a starter `CREDITS.md` already exists at the repo
   root for this).
3. In `game.js`, replace the `ctx.fillRect(...)` calls in `drawTile`,
   `drawCrop`, and `drawPlayer` with `ctx.drawImage(...)` calls against the
   loaded spritesheets (source rects for tile/frame lookup, destination rect
   at `sx, sy, TILE, TILE`).

No other files need to change — the tile grid, movement, and farming logic
are independent of how tiles are rendered.
