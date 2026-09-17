# Masonry examples

Seven configurations inspired by the supplied reference images, in the same order. Load them from **Masonry examples** or use **Import experiment** to open a JSON file.

| Image | Name                    | File                                                                                 |
| ----- | ----------------------- | ------------------------------------------------------------------------------------ |
| 1     | Opus mixtum             | [FCH01_F1_7d_opus_mixtum.json](FCH01_F1_7d_opus_mixtum.json)                         |
| 2     | Opus mixtum reticulatum | [FCH01_F1_7e_opus_mixtum_reticulatum.json](FCH01_F1_7e_opus_mixtum_reticulatum.json) |
| 3     | Opus reticulatum        | [FCH01_F1_7f_opus_reticulatum.json](FCH01_F1_7f_opus_reticulatum.json)               |
| 4     | Opus spicatum           | [FCH01_F1_7g_opus_spicatum.json](FCH01_F1_7g_opus_spicatum.json)                     |
| 5     | Opus testaceum          | [FCH01_F1_7h_opus_testaceum.json](FCH01_F1_7h_opus_testaceum.json)                   |
| 6     | Opus mix vittatum       | [FCH01_F1_7i_opus_mix_vittatum.json](FCH01_F1_7i_opus_mix_vittatum.json)             |
| 7     | Opus vittatum           | [FCH01_F1_7j_opus_vittatum.json](FCH01_F1_7j_opus_vittatum.json)                     |

## Additional examples

- [Defensive wall Bologna](Defensive_wall_Bologna.json): regular bricks at both edges, rounded central stones and two horizontal brick bands, inspired by the supplied wall photo.
- [Window · regular bricks](Window_regular_bricks.json): staggered brickwork around a central opening, with one monolithic lintel.
- [Window · irregular blocks + corner stones](Window_irregular_blocks_corner_stones.json): irregular stonework, regular corner stones and squared jambs supporting one monolithic lintel.

The window spans x = 4.6–7.4 m and y = 1.65–4.3 m. The lintel is a single 4.2 × 0.55 m block with 0.7 m nominal bearing at each end, not a set of bricks or a fixed constraint. It can be selected, moved, removed, shaken or vertically loaded. Small geometric joint clearances apply. Rounded stones are convex polygons with smoothly bevelled corners; no mortar is included.

Labels and filenames follow the references supplied by the project author. The geometries are procedural reconstructions, not exact tracings of individual blocks.

Every block is an independent convex polygon that can be selected, dragged while paused, rotated, removed and loaded. Blocks are clipped at the wall perimeter, with small joints to avoid initial overlap. The random seed controls dimensions and colours in variable patterns; regular-pattern geometry is fixed.

Brick bands are dynamic blocks, not fixed constraints. Loading from the menu enables a container with both walls; boundaries can subsequently be removed independently. Friction and gravity retain their current settings. The initial JSON files use μ = 0.45 and g = 9.81 m/s².

**Physics:** dry rigid 2D blocks, with no mortar, cohesion or three-dimensional masonry core. The simulation does not assess the structural safety of real Roman masonry.

Terminology references: [Italian Ministry of Culture, Roman masonry techniques](https://antiquariumportotorres.cultura.gov.it/it/percorsi-e-collezioni/le-opere-murarie) and [University of Padua, opus spicatum record](https://tess.beniculturali.unipd.it/web/scheda/?recid=11957).

## Load-spreading examples

- [Side-by-side comparison](Load_spread_comparison.json): same 150 N concentrated load on two walls, with a single loaded brick on the left and a wide distributing block on the right.
- [Concentrated load](Load_concentrated.json): a 14-course staggered wall with 150 N on one top brick.
- [Distributing block](Load_distributed.json): the same wall and load, with one wider block spanning two top courses.

These examples open with monochrome load shading and a shared 150 N reference. Press Play to compute the contact loads; shade intensities come from the simulation rather than a predefined spreading pattern.
