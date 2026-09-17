# UnBaAct

An interactive granular equilibrium laboratory written in JavaScript. The rigid-body 2D simulation runs entirely in the browser, with no application server or account required.

## Live application

Open [UnBaAct on GitHub Pages](https://gcastellazzi.github.io/UnBaAct/). The browser runs the complete simulation, including local photo tracing; no server installation is needed.

The [Deploy GitHub Pages workflow](.github/workflows/pages.yml) tests and builds the app with Node.js 24, then publishes `dist` on each push to `main`. GitHub Pages uses **GitHub Actions** as its publishing source. Manual deployment is available through the workflow’s **Run workflow** button.

## Run locally

Requires Node.js 22.12+ (or Node 24 LTS) and npm.

```sh
npm install
npm start
```

Open http://localhost:5173. If that port is busy, use the address printed by Vite. Stop the server with Ctrl+C. The optional Python `.venv` is not required by the JavaScript application.

```sh
npm test
npm run build
npm run preview
```

## Interface

The application occupies the viewport without document scrolling. **01 Build** stays to the left of the canvas, and the **03 Inspector** stays to its right with **Observe**, **Groups** and **Block** tabs. Particle count, active contacts and maximum speed sit alongside Play/Pause. Experiment controls occupy the bar below them. The Block tab contains the selected block diagram, measurements, vertical load and removal controls. Panel contents scroll internally on small windows; the canvas resizes without changing physical dimensions.

**Menu → Credits** contains the project introduction and credits. **Menu → Model & controls** explains the physics and keyboard shortcuts. All interface text is in English; OPUS names retain their supplied Latin terminology.

## Experiments

- Generate disks, squares, triangles, rectangles or mixed shapes with a reproducible random seed.
- Choose a container, an open-sided floor or a floor with side supports. Toggle left and right boundaries independently, including during playback.
- Load the corner stone configuration: two columns of seven rectangular blocks, alternating 1.60/0.95 m widths and 0.65 m height, with granular material inside. Every block is dynamic and can be dragged or rotated while paused. This creates a new scene.
- While paused, click to add particles or select and drag them. R rotates, arrow keys move the selection and Space toggles Play.
- Remove a selected block with its button, Delete/Backspace or the Remove particle tool, including during playback.
- Use Play, slow motion or Single step (1/120 s).
- Compare zero and nonzero friction, gravity levels and different boundaries.
- Shake left or right with an adjustable horizontal velocity change: a simultaneous impulse J = m Δv is applied to all blocks and playback starts. The floor stays fixed. This is an idealised impulse, not a seismic acceleration record or moving-base simulation.
- Apply a constant downward force from 0 to 100 N to the selected block’s centre of mass. Press Play to observe the response. The force stays active until Remove load is clicked, is shown in blue and is saved in JSON exports. It introduces no external moment because it acts at the centre of mass.
- Display force chains, normal/tangential contact forces and unbalanced resultants. Arrows use a logarithmic scale; the selection panel provides numerical values.
- Filter contacts by intensity and highlight the component connected to the selected particle, including floor and walls. This shows connectivity, not a unique decomposition of load paths.
- Export/import the current configuration as JSON. Reset returns to the initial geometry while retaining current physics parameters. Import starts a new experiment from the exported configuration.

## Photo tracing

1. Open **Photo & tracing** in **01 Build** and choose **Load photo / new tracing** (JPEG, PNG or WebP, up to 20 MB). Loading a new photo starts an empty tracing scene, sets thickness to 0.3 m and material density to 1800 kg/m³ as editable example values, and activates Trace blocks. These are assumed material properties, not measurements extracted from the image.
2. Set the photo width in metres and its X/Y placement. Alternatively enter a known distance, click **Calibrate · click 2 points**, and select the two endpoints on the photo. Scale is uniform: perspective and lens distortion are not corrected.
3. Adjust photo opacity and block fill opacity to see the contours clearly. Hide/show the background without changing registration.
4. Left click to add vertices. **Right click, Enter or C** closes the current block; clicking the first vertex also closes it. Trace blocks stays active so the next click starts another block. Use **Backspace** to undo a point and **Esc** to cancel. The sidebar also has Close, Undo and Cancel buttons for touch use.
5. Select or drag traced blocks using the usual editing tool. The normal Add particle mode remains available. A block supports 3–48 vertices; crossed or degenerate outlines are rejected. Concave outlines retain their shape and are triangulated into colliders attached to one rigid body, rather than being replaced by a convex hull. Numerical contact seams from decomposition are a limitation of this approximation.
6. Thickness and material density determine areal density, mass and rotational inertia: mass = polygon area × thickness × material density. Changing material properties updates existing blocks. The simulation remains planar and has no out-of-plane failure model. Downward applied loads can range from 0 to 1,000,000 N.
7. Rescaling or moving the photo also transforms its traced blocks, including the contact geometry. This pauses playback and starts a new trial from the transformed scene. Removing the image preserves the calibrated viewport and boundaries; generated examples start their own default viewport.
8. Export the experiment as JSON to preserve geometry, physical parameters and the embedded photo. Import restores the complete reference. The reference image remains stationary during playback while traced bodies move over it.

Photos are decoded and processed locally in the browser, reduced to a maximum 2048-pixel longest dimension and embedded as JPEG in exports. No photo upload server, external image API or recognition service is used. Images are not written into the repository by the app. Automatic edge detection/stone recognition is not implemented; the current workflow is manual tracing.

## Masonry examples

Choose a pattern under **Masonry examples**, click **Load masonry example**, then Play. The library includes ten masonry patterns, **Defensive wall Bologna** with regular brick edges and rounded central stones, and two window walls: regular bricks or irregular blocks with corner stones. Each window has a single dynamic monolithic lintel, labelled LINTEL on the canvas. Every stone is an independent convex rigid body. JSON examples and reference filenames are in [`examples/`](examples/README.md).

The examples are procedural approximations of the supplied images. They have no mortar, cohesion or three-dimensional masonry core.

## Physics and limitations

Rigid 2D bodies with areal density determined by material density × wall thickness (default 1 kg/m³ × 1 m), gravity, non-cohesive contacts and Coulomb friction. Friction is assigned by block group, initially Regular blocks (bricks, corner stones, lintels and regular polygon primitives) and Irregular blocks (other polygons and disks). Custom groups can be created and selected blocks reassigned in the Groups tab. Boundary friction is independent. A contact uses the arithmetic mean of its two collider coefficients (Rapier Average rule); no rolling resistance is modeled. Groups and assignments are included in JSON exports; older files initialize both groups from their original coefficient. Disks are not 3D spheres. Numerical penetration tolerances apply.

Rapier 2D compat is pinned to 0.12.0 to keep contact impulse extraction reproducible. The solver uses one substep and 16 internal PGS iterations. Contact impulses are divided by the 1/120 s physical timestep to estimate forces. Changing the engine version or substep count requires repeating the reaction-equals-weight check. Point-contact pressure is not computed.

Resultants are m Δv/Δt; residual moments are I Δω/Δt. These include the effect of gravity and applied loads. Forces are unavailable before the first physics step. Contact networks update after each step.

Equilibrium requires small speeds for at least 0.8 s and small force/moment residuals relative to weight and size. Collapse is a teaching classification: particles falling below the floor or displacement exceeding two radii for more than 45% of particles. Random deposition can therefore register as a large rearrangement. This is not a certified structural assessment or a guarantee of future stability.

Construction supports free placement and rotation rather than a complete Tetris game. Side supports are predefined; arbitrary boundary drawing and static force analysis before motion are future extensions.

## Verification

`npm test` includes 25 checks covering reproducibility, reaction equal to weight, free fall, zero gravity, network connectivity, mixed shapes, removal, independent boundaries, impulses for different masses, reaction equal to weight plus applied load and overlap-free masonry geometries, empty window openings, independent loadable lintels, outline validation, compound concave contacts, thickness/density mass updates and photo registration under rescaling.

Optional browser checks, with the local server running:

```sh
npx playwright install chromium
node scripts/browser-check.mjs
node scripts/opus-browser-check.mjs
node scripts/layout-browser-check.mjs
node scripts/photo-browser-check.mjs
```

## Files

- `src/geometry.js`: outline validation, centroids and concave polygon decomposition.
- `src/photo.js`: local image processing, embedded-photo validation and calibration transforms.
- `src/physics.js`: rigid bodies, contacts, generation and diagnostics.
- `src/scenarios.js`: ten masonry patterns, clipping and polygonal stone generation.
- `src/ui.js`: English interface, credits and model dialogs.
- `src/main.js`: rendering, interaction and JSON exchange.
- `src/style.css`: responsive canvas and control layout.
- `tests/`: physics and scenario verification.

## GitHub and static hosting

The source can be published as a regular GitHub repository. No server credentials or API keys are required. `node_modules/`, `dist/` and `.venv/` are excluded by `.gitignore`; user photos remain in the browser unless explicitly exported by the user. The existing procedural JSON examples contain no imported photos.

For a hosted application, build with `npm run build` and serve `dist/` through a static host such as GitHub Pages. Vite uses relative asset URLs so a project subdirectory is supported. Publishing the source repository alone does not host the built app. No repository push or deployment is performed by the application.

### Inspector tabs

- **Observe:** independently show or hide normal forces, tangential forces, unbalanced resultants, applied loads and boundary reactions. Boundary totals show Rx and Ry in newtons for each active support; these are forces exerted by the boundary on the blocks.
- **Groups:** adjust μ independently for each group, create groups, assign the selected block and enable colour by group.
- **Block:** inspect the selected block with force arrows and labels in newtons (Fn, Ft, R, Load, W and ΣF), apply a downward load or remove the block. The diagram always shows all forces independently of Observe visibility switches, with neighbour IDs on contact arrows and a numerical summary of the reaction from each neighbouring block or boundary. Weight W is included to explain the balance. Arrow lengths use a logarithmic scale; numerical labels give their actual magnitudes. Reaction arrows represent total normal plus tangential support force; they are not additional forces to add again to Fn and Ft.

### Monochrome load shading and load spreading

In **Observe → Block colouring**, choose **Load shading · darker = higher**. This replaces the default chain-and-arrow display with grayscale fills; overlays can be re-enabled individually. Material and group colours remain available. Use **Scene maximum** for automatic normalization or **Fixed reference** to compare cases with the same scale. Values at or above the reference use the darkest shade. Fill opacity still applies.

The scalar indicator is **(sum of incident normal-contact force magnitudes + sum of tie-force magnitudes + weight + magnitude of applied force) / 2**, in newtons. It is a conventional block-load indicator, not stress, pressure, a tensor or an unbalanced resultant; it includes the external forces to avoid underrepresenting a loaded boundary block. It is computed from the current simulation snapshot, so allow the wall to settle before comparing. No fixed spreading angle or illustrative force path is imposed.

Load **Load spread · side-by-side** from Masonry examples and press **Play**. Both walls receive **150 N**: the left wall has one loaded top brick; the right has a wide monolithic distributing block occupying two courses. They use identical brick dimensions and material properties within the comparison, with a common **150 N** grayscale reference. The walls are scaled copies of the standalone **Load spread · concentrated** and **Load spread · distributing block** examples. The standalone examples reach equilibrium with two and three direct supporting blocks respectively. All configurations can be edited, loaded, shaken and exported; load colouring and its reference are also saved.

### Oblique loads and joint fillers

In **Block**, set **Horizontal load Fx (N)** (positive right, negative left) and **Downward load** (nonnegative magnitude; Fy is negative). Apply force sets both persistent components at the block centre; Clear force removes both. Main-canvas and Block diagrams show the horizontal/vertical components and their combined vector. The combined arrow is not another force to add. Exports store `loadX`; old files default to zero horizontal load. Load shading now uses the magnitude of the applied force vector in its conventional scalar indicator.

**Oblique load · irregular masonry** is a procedural interpretation of the reference: rounded irregular stones and a force of **Fx +85 N, Fy −150 N** on one upper stone. The contact paths and colours come from the solver; the image's diagonal path is not imposed.

Open **Build → Joints & small fillers** while paused:

- **Imperfections** inserts up to 40 tiny free rigid disks into random, initially clear joints. Unchecking removes only these tagged disks. The current Random seed makes placement repeatable. These disks create local contact paths and may move or fall, rather than being fixed artificial supports. Their thin orange circles have a minimum visible marker size of 2.2 screen pixels; the actual collision radius stays unchanged.
- **Insert snecks / flakes** inserts up to 60 small five-sided rigid pieces into available joint/corner voids, without initial overlap. Repeat to fill additional available spaces. They use the Irregular blocks friction group and can be dragged or removed independently. Large openings are not filled wholesale. If no suitably sized void exists, zero pieces are inserted.

Insertion checks the current block geometry, respects the 400-body import/export limit, and starts a new paused trial configuration. Fillers, force components and their group assignments are preserved by export/import and Reset. Thickness and density also apply to fillers. Extremely fine inclusions are a conventional teaching approximation, not a resolved surface-roughness or mortar model.

### Ties between blocks

Choose **Build → Editing tool → Tie blocks · 2 clicks**, then click inside two different blocks. The clicked points become body-local attachments and their current separation becomes the fixed tie length. A blue line and pin markers show the tie. Continue with another click pair to create more ties; Esc or right click cancels an unfinished pair. Creation pauses playback. There is at most one tie per block pair.

A tie is a bilateral, massless distance constraint: it resists both extension and shortening, permits pin rotation, and introduces no rod collider, added mass, or imposed relative block orientation. The simulation projects anchor positions and relative axial velocities before/after each rigid-body timestep using mass and rotational inertia; lengths are enforced to numerical tolerance. Complex tightly constrained assemblies can retain small solver/contact errors. Tie forces are estimates from the velocity-correction impulses divided by the timestep and appear independently in the **Block** diagram and reaction list. Load shading includes tie-force magnitudes.

Use **Joints & small fillers → Clear all ties** or **Block → Remove this block’s ties** while paused. Deleting a block removes its attached ties. Paused dragging/rotation also moves the linked bodies as needed to preserve the attachments’ separation. Export/import and Reset preserve ties, anchors and rest lengths; older JSON files without ties remain supported. Photo calibration transforms the photo-linked anchors and recalibrates the tie length along with the blocks.
