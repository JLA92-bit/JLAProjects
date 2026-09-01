# Vantage Point — scene shot list & prompt sheet

Art brief for the five `scenes/level-N.jpg` backgrounds of *The Hargrove Affair*.
Positions are taken from the shipped `data/level-N-clues.json` — they are a spec, not a suggestion.
**Compose to these maps and no coordinate rework is needed.** If a scene has already been shot to a
different composition, use `tools/clue-calibrator.html` instead (drop the photo in, click each clue,
export JSON) — that's the fallback, not the plan.

A laid-out version with visual framing maps (dots drawn at each clue's true relative size) is in the
design project alongside this file.

## Deliverable spec

| | |
|---|---|
| Format | `scenes/level-N.jpg` |
| Aspect | **3:4 portrait** — non-negotiable, coordinates are % based |
| Size | 1200×1600 min · 2400×3200 preferred · level 5 **must** be 2400×3200 |
| Look | real photo or photoreal AI render only — no illustration, 3D-render or vector look |
| Grade | warm amber key, cold shadow, deep falloff; one dominant practical per scene |
| Palette | match the UI — amber `#c9932f`, paper `#e8dcc0`, ink `#0f0d0b` |
| Avoid | faces, readable brand signage, motion blur |

Clue diameter as a share of frame width, by level: **L1 10.0% · L2 6.7% · L3 4.7% · L4 3.0% · L5 1.7%**.
In-game hit areas are 1.6× the visual radius, so small clues stay tappable — they only need to be hard to *spot*.

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

*Difficulty:* Magnifier level. ~20px objects on a 1200px image: genuinely small but absolutely sharp. Shoot 2400×3200, deep depth of field, no soft focus where a clue sits.

| # | Object | Placement | x / y | ø |
|---|---|---|---|---|
| 1 | Parking receipt | left of centre, upper | 38% / 22% | 1.7% |
| 2 | Thin gloves | right of centre, upper-middle | 70% / 40% | 1.7% |
| 3 | Sunglasses — DECOY | left of centre, mid-height | 30% / 45% | 1.7% |
| 4 | Vehicle registration | lower-middle, centred | 52% / 62% | 1.7% |
| 5 | Engraved lighter | right, lower-middle | 82% / 70% | 1.7% |
| 6 | Tyre tread | left, lower | 20% / 85% | 1.7% |

---

## After the images land

1. Drop each file at `scenes/level-N.jpg`.
2. Point `levels[N].image` in `data/case.json` at the new path.
3. Spot-check one clue per level against the map above; if a composition drifted, re-export that level's coordinates with `tools/clue-calibrator.html`.
4. Bump `CACHE_NAME` in `sw.js` so installed clients pick up the new art.
