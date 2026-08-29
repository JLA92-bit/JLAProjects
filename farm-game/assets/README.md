# Assets

All sprites in this folder are cropped from the **Sprout Lands - Sprites -
Basic pack** by Cup Nooble. See `../CREDITS.md` for the full file list,
license terms, and the non-commercial restriction that comes with them.

## Why only cropped pieces, not the original pack files

The Sprout Lands (and Cute Fantasy) licenses explicitly allow using the
assets *within* a project, but forbid redistributing the pack itself, even
modified. Committing the original `.zip`/`.rar` downloads to this public
repo would count as redistributing the pack — so only the individual sprite
crops actually used by the game are committed here, which the license does
permit.

## Where the source packs are

Four free packs were supplied for this project during development:

1. Farm RPG FREE 16x16 - Tiny Asset Pack (itch.io)
2. Cute Fantasy Free
3. **Sprout Lands - Sprites - Basic pack** ← currently used
4. Pixel Crawler - Free Pack

They were extracted and inspected in the session's scratch directory, which
does **not** persist between sessions — so if a future session needs to
pull more sprites from any of these (e.g. switching to Cute Fantasy's water
tile, or Farm RPG's taller character), the pack will need to be re-supplied
by the user rather than assumed to still be on disk.

## Regenerating or changing the crops

The crops here were sliced with a small Python/Pillow script (grid-overlay
the sheet, read off pixel coordinates, crop). If you want different frames
or a different source pack:

1. Get the sheet's exact pixel dimensions and tile grid (Sprout Lands tiles
   are 16x16; the character sheet uses 48x48 cells).
2. Crop the specific `(x0, y0, x1, y1)` box for the piece you want.
3. Save it into this folder with a clear name, and update the `IMG_NAMES`
   list and the relevant `draw*` function in `../game.js` to reference it.

Current tile scale: source art is 16x16px, drawn at `TILE = 32`px (2x, see
the `SRC`/`TILE` constants at the top of `game.js`). The player sheet uses
48x48px cells, drawn at `48 * (TILE/SRC) = 96`px so it scales consistently
with the tiles.
