# Vantage Point — scene art brief

Art brief for the five `scenes/level-N.svg` backgrounds of *The Hargrove Affair*.

**Art direction (revised):** illustrated/vector noir, not photo-realistic. Built directly as SVG —
by Claude Design, or any hand-drawn/vector tool — so it can be dropped straight into the game with
no format conversion. This replaced an earlier photo-realistic direction; see the note at the bottom
of this file for why.

Positions are taken from the shipped `data/level-N-clues.json` — they are a spec, not a suggestion.
**Because this is vector art built in code, clue objects should be placed at these exact
coordinates** — unlike a photo shoot or an AI photo render, there's no reason for the final
composition to drift from the spec at all. If it does anyway, `tools/clue-calibrator.html` is still
the fallback (drop the image in, click each clue, export JSON).

## Deliverable spec

| | |
|---|---|
| Format | `scenes/level-N.svg`, viewBox `0 0 1200 1600` (matches `baseImageWidth` in the clue JSON) |
| Aspect | **3:4 portrait** — non-negotiable, coordinates are % based |
| Look | illustrated noir — flat/limited color, strong shapes, moody lighting via gradients and shadow shapes. Not photo-realistic, not a literal line-art sketch, not clip-art flat. Think noir graphic-novel panel, not a UI icon. |
| Grade | warm amber key, cold shadow, deep falloff; one dominant light source per scene |
| Palette | match the UI already shipped in `src/style.css` — ink `#0f0d0b`, panel `#171310`, amber `#c9932f`, amber-bright `#e8a93a`, paper `#e8dcc0` |
| Avoid | faces (silhouette or off-frame is fine), readable text/signage baked into the art |

Clue diameter as a share of frame width, by level: **L1 10.0% · L2 6.7% · L3 4.7% · L4 3.0% · L5 1.7%**.
In-game hit areas are 1.6× the visual radius, so small clues stay tappable — they only need to be hard to *spot*.
Camouflage (levels 3-5) means matching the clue object's fill color and simplified shape closely to
whatever's around it in the illustration, not literally hiding it off-canvas.

---

## Level 1 — The Study

**5 real clues · radius 60px @1200 · ø 10.0% of frame width**

A private study behind the gallery, late evening. Walnut desk shot from a slightly high three-quarter angle; a green banker's lamp is the only warm source, cold rain-light from a window camera-left, black falloff at the edges. Cold fireplace bottom-left.

*Difficulty:* Tutorial scene — no camouflage. Every object ~10% of frame width and legible at a glance on a phone. Keep the desktop otherwise clear.

| # | Object | Placement | x / y | ø |
|---|---|---|---|---|
| 1 | Overturned photo frame | right, upper-middle | 74% / 32% | 10.0% |
| 2 | Engraved letter opener | right of centre, mid-height | 62% / 54% | 10.0% |
| 3 | Two wine glasses | left of centre, lower-middle | 28% / 61% | 10.0% |
| 4 | Bloodstain on the blotter | lower-middle, centred | 46% / 68% | 10.0% |
| 5 | Cold fireplace grate | left, lower | 18% / 78% | 10.0% |

---

## Level 2 — The Gallery Floor

**6 real clues · radius 40px @1200 · ø 6.7% of frame width**

Main exhibition hall an hour after the reception. Houselights at half, track lighting on the canvases, polished concrete with reflections. Shot from the entrance so the far wall, a side wall of paintings, the reception plinth and the office door are all in frame.

*Difficulty:* Clues sit in real reception debris but each should still resolve without the magnifier. Scatter extra glasses and napkins as noise; keep the six hero objects physically separated.

| # | Object | Placement | x / y | ø |
|---|---|---|---|---|
| 1 | Unplugged security camera | right, upper | 84% / 22% | 6.7% |
| 2 | Mismatched signature | left, upper-middle | 22% / 40% | 6.7% |
| 3 | Guest sign-in sheet | right of centre, lower-middle | 68% / 58% | 6.7% |
| 4 | Sticky note by office door | left, lower-middle | 12% / 66% | 6.7% |
| 5 | Champagne flute, lipstick | left of centre, lower | 40% / 72% | 6.7% |
| 6 | Dropped cufflink | lower, centred | 55% / 85% | 6.7% |

---

## Level 3 — The Loading Alley

**7 real clues + 2 decoys · radius 28px @1200 · ø 4.7% of frame width**

Dim service alley behind the gallery, late night after rain. Steel service door with a caged bulb centre-right, dumpsters left, chain-link right, wet asphalt and puddles under sodium light. One hard practical; everything else near black.

*Difficulty:* Camouflage starts here. Keycard tonally close to wet asphalt, receipt close to concrete. Shoot the two decoys with exactly the same prominence as real clues. Magnifier unlocks this level.

| # | Object | Placement | x / y | ø |
|---|---|---|---|---|
| 1 | Spray-painted camera | upper, centred | 50% / 18% | 4.7% |
| 2 | Cigarette butts | left, upper-middle | 15% / 30% | 4.7% |
| 3 | Torn fabric on fence | right, mid-height | 82% / 44% | 4.7% |
| 4 | Trash bag — DECOY | left, mid-height | 20% / 50% | 4.7% |
| 5 | Cloned keycard | left of centre, lower-middle | 30% / 62% | 4.7% |
| 6 | Pawn shop receipt | right of centre, lower-middle | 58% / 66% | 4.7% |
| 7 | Oil puddle — DECOY | right, lower-middle | 74% / 68% | 4.7% |
| 8 | Tyre tracks | right of centre, lower | 68% / 80% | 4.7% |
| 9 | Partial footprints | left of centre, lower | 40% / 90% | 4.7% |

---

## Level 4 — Elena's Office

**5 real clues + 2 decoys · radius 18px @1200 · ø 3.0% of frame width**

Cluttered co-director's office, mid-morning, blinds half-shut throwing hard slats across a paper-buried desk. Filing cabinet right, wastebasket in the footwell, pinned papers on the left wall. Shot from the doorway.

*Difficulty:* The camouflage level. Every real clue is paper on a desk covered in paper at 3% of frame width — match tone, differentiate by one cue each (scorch, tape, handwriting). Use the blind slats to break up the paper field.

| # | Object | Placement | x / y | ø |
|---|---|---|---|---|
| 1 | Printed email thread | upper, centred | 46% / 18% | 3.0% |
| 2 | Bank transfer statement | left, upper-middle | 18% / 28% | 3.0% |
| 3 | Hidden second ledger | right of centre, upper-middle | 60% / 40% | 3.0% |
| 4 | Desk calendar — DECOY | left of centre, mid-height | 28% / 50% | 3.0% |
| 5 | Unsent letter | right, lower-middle | 76% / 62% | 3.0% |
| 6 | Half-burned ledger page | left of centre, lower | 34% / 74% | 3.0% |
| 7 | Stapler — DECOY | right of centre, lower | 66% / 80% | 3.0% |

---

## Level 5 — The Car

**5 real clues + 1 decoys · radius 10px @1200 · ø 1.7% of frame width**

Interior of a compact sedan in an underground garage, shot from the rear seat toward the dash and open glove box, driver's door ajar. Cold fluorescents through the windshield, near-black footwells. Visor, dash, glove box, door pocket and a sliver of tyre all in frame.

*Difficulty:* Magnifier level. ~20px objects on a 1200px canvas: genuinely small but drawn with clean, crisp linework — no object a clue sits on should be rendered soft or blurred, since the in-game magnifier will zoom straight into it.

| # | Object | Placement | x / y | ø |
|---|---|---|---|---|
| 1 | Parking receipt | left of centre, upper | 38% / 22% | 1.7% |
| 2 | Thin gloves | right of centre, upper-middle | 70% / 40% | 1.7% |
| 3 | Sunglasses — DECOY | left of centre, mid-height | 30% / 45% | 1.7% |
| 4 | Vehicle registration | lower-middle, centred | 52% / 62% | 1.7% |
| 5 | Engraved lighter | right, lower-middle | 82% / 70% | 1.7% |
| 6 | Tyre tread | left, lower | 20% / 85% | 1.7% |

---

## After the art lands

1. Drop each file at `scenes/level-N.svg` (already the path `data/case.json` points to — placeholder art lives there today, so this is a straight overwrite).
2. Spot-check one clue per level against the map above; because this is vector art placed at exact coordinates, it should match without rework. If it doesn't, re-plot that level's coordinates with `tools/clue-calibrator.html`.
3. Bump `CACHE_NAME` in `sw.js` so installed clients pick up the new art.

## Why this changed from a photo brief to an illustration brief

This file originally specified real photos / photoreal AI renders, generated externally (Gemini) and
manually dropped in — because that's what a "photo-realistic crime scene" strictly requires, and no
tool in this project's own toolchain can generate photorealistic pixels. That pipeline worked (see
git history), but it meant two tools and a manual per-level handoff/recalibration step for every
scene. The art direction changed to illustrated/vector noir specifically so the whole pipeline could
live in one place — Claude Design draws directly in SVG with clues placed at the exact spec
coordinates, and it drops straight into the game with no conversion or recalibration step. The
trade-off is real: illustrated art is a genuine departure from the original "photo-realistic, texture-
camouflaged" brief, and camouflage on levels 3-5 now relies on matched flat color/shape rather than
matched photo texture. That trade was made deliberately in favor of a single-tool pipeline.
