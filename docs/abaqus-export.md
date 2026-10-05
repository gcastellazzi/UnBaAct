# Abaqus export

Open **Observe → Export Abaqus · 3D solids** and download `unbaact-model.inp`.
The file runs in Abaqus/Standard; no Abaqus installation is needed to export it.
The exporter follows aLoTiA's implicit quasi-static analysis and frictional contact
settings, with the boundary geometry taken from UnBaAct.

## Leaves and through stones

- **Equal:** divide the app wall thickness by N.
- **Specify each leaf thickness:** enter N positive thicknesses in metres. Their
  sum becomes the masonry thickness of the exported model.
- **Each leaf = wall thickness:** repeat the app thickness N times.
- An optional gap separates adjacent leaves. Leaf 1 starts on the negative Y
  side; successive leaves run towards positive Y. X is app x, Z is app y.
- Motion is free in 3D by default. The planar option fixes only the depth
  displacement of masonry nodes. Independent leaves interact by contact and
  friction, with no shared nodes or automatic ties between them.
- The through-stone percentage refers to **2D block sites**, including footing
  blocks and fillers. The selected count is `round(sites × percentage / 100)`.
  A seeded shuffle selects sites without replacement. **All leaves** replaces
  all copies at each selected site by one continuous solid (diatono). **Two
  adjacent leaves** chooses one adjacent pair per selected site; other copies
  remain independent. The exported comments record spans, seed and actual count.
  A solid that spans a gap fills that gap with masonry, increasing its true mass.

The geometry constructor is `src/masonry-3d.js`, independent of the FE mesh and
solver. These options currently affect Abaqus only. The existing simulation
remains Rapier 2D; a separate Rapier 3D simulation panel is not included.

## Loads and boundaries

The applied block forces (`load`, `loadX`) retain their **total force in N**,
regardless of N or thickness. Choose all leaves (distributed in proportion to
leaf thickness), or a numbered leaf that receives the entire force. Each force
acts at that leaf's mid-depth. Consistent in-plane nodal weights and linear depth
interpolation preserve the force and its moment, including on a through stone.
This represents the app's centre-applied block resultant, not a point-load stress
singularity or a pressure applied to a specified top-face patch.

Self-weight follows actual volume. A supplied particle mass is scaled by the
extrusion thickness; faceted disks retain their analytical mass. Active analysis
forces in the current scene scale with thickness, as mass-proportional actions;
the concentrated-load leaf selector does not redirect these actions.

The floor, active cup walls and discrete side supports are separate deformable
solids with fixed **back faces**, not fixed masonry nodes. Their default modulus
is 1,000 times the block modulus. All exposed masonry and support surfaces
participate in hard normal contact and Coulomb friction. Each pair uses the
arithmetic mean of its two app group/boundary friction coefficients.

Elastic soil retains the app's moving strips, damping and stiffness matrix,
including the free-end EI term, Winkler/Pasternak choice and central/left/right
region. Rigid complementary patches remain explicit support objects. Positive
springs for first and second displacement differences reproduce the matrix
without user subroutines or negative spring stiffnesses. Transfer strips span
all leaves and retain the app's vertical-only translation: this is an extrusion
of the **2D foundation law**, not a general 3D soil continuum or independently
rotating footing. Soil stiffness, mass, damping and EI scale by the ratio of total
masonry thickness to app thickness; empty interleaf gaps add no soil stiffness.

Existing ties are repeated at each leaf centre. AXIAL connectors, distributing
couplings and connector motion/stops represent bilateral/tension-only ties.
The coupled blocks remain deformable. With massless tie reference nodes the step
uses `IMPACT=NO`, avoiding singular mass corrections in implicit dynamics.

## Mesh, material and state

Units are **m, kg, N, s, Pa**. Defaults are E = 30 GPa and ν = 0.2, corresponding
to aLoTiA's SI elastic modulus after converting its kN-based convention to N.
E, ν, support stiffness ratio, load-ramp duration and refinement are editable.

Convex quadrilaterals and paired triangles form HEX8 (`C3D8`) cells. Remaining
triangles use WEDGE6 (`C3D6`); there are no tetrahedral elements. Refinement is
conforming within each block. Each body is extruded independently, with positive
volume/Jacobian and volume-conservation checks. Through stones receive the
requested number of depth elements times the number of spanned leaves. Meshes
stop at 500,000 solid nodes or 300,000 solid elements. Disk outlines use 8–48
segments (32 by default).

Irregular outlines can still produce distorted-element warnings in Abaqus.
Positive volume does not establish stress accuracy: inspect mesh quality and
perform refinement checks for the particular model. The bundled irregular-wall
datacheck passes but reports such warnings.

Choose current or initial geometry. This starts a **new analysis**, with gravity
and applied forces ramped smoothly; it is not a restart of Rapier. Velocities,
contact stresses, transient shaking and accumulated history are not transferred.
For a deformed elastic base, the initial soil force is included so the spring
reference remains the original foundation level. Large initial interpenetrations
or an unstable assembly can still prevent convergence. The output includes
displacements, reactions, stresses, contact variables and energy histories.

## Verification

`npm test` checks topology, volume, Jacobians, force/moment conservation, independent
leaves, custom thicknesses, deterministic through stones, support faces, friction,
localized soil energy and ties. With the dev server running:

```sh
node scripts/abaqus-browser-check.mjs
node scripts/abaqus-fixtures.mjs
```

With an installed, licensed Abaqus, run from `tmp/abaqus`:

```text
abaqus job=gravity interactive
abaqus job=elastic interactive
abaqus job=eccentric interactive
abaqus job=tied interactive
abaqus job=mixed datacheck interactive
abaqus python ../../scripts/abaqus-results.py
```

The result reader verifies completed steps and compares support reactions with
weight plus load, soil reaction with the complete supported weight, and the
out-of-plane reaction moment with the eccentric applied force. It writes
`verification.json`. The mixed fixture combines irregular stones, unequal leaves,
partial through stones, both tie types, Pasternak soil and a single side wall.
Datacheck validates its input, not its convergence under loading.

Checked with Abaqus 2025 on 2026-10-05: four complete analyses and the mixed
input datacheck. The rigid-base reaction was 5,397.4004 N (expected 5,397.4 N);
the eccentric reaction moment was −17.50011 N·m (expected −17.5 N·m). The elastic
case gave 6,475.63 N against a static target of 6,456.88 N, a 0.29% residual after
the finite two-second ramp. The tied case also completed and balanced its load.
The irregular mixed mesh reported 1,332 distorted elements out of 3,800; it
requires mesh-quality review before interpreting local stresses. Abaqus can
still print massless-connector advisory messages despite `IMPACT=NO`.

## Provenance and keyword references

Triangulation and element-volume/Jacobian helpers are adapted from aLoTiA commit
`c73f66cf1c0898d9a92522c36dc9b160775ec763`, under its MIT license preserved in
`src/vendor/alotia-LICENSE.txt`. Boundary and leaves construction are implemented
in UnBaAct. The hosted build includes the notice at `licenses/alotia-MIT.txt`.

- [General-contact property assignments](https://docs.software.vt.edu/abaqusv2025/English/SIMACAEITNRefMap/simaitn-c-contactpropassignstd.htm)
- [Springs](https://docs.software.vt.edu/abaqusv2025/English/SIMACAEKEYRefMap/simakey-r-spring.htm)
- [AXIAL connectors and absolute stop lengths](https://docs.software.vt.edu/abaqusv2025/English/SIMACAEELMRefMap/simaelm-c-connectiontypedesc-axial.htm)
- [Distributing couplings](https://docs.software.vt.edu/abaqusv2025/English/SIMACAEKEYRefMap/simakey-r-distributing.htm)
