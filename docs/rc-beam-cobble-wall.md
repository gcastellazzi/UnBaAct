# RC ring beam on a cobble wall

This example is a qualitative compatibility experiment for an in-plane action. It does not decide whether a real reinforced-concrete ring beam is suitable, or reproduce a particular wall.

## Model

The wall contains 72 small rounded cobbles between two bands of eight larger and more regular quoin stones. The side boundaries are rigid idealisations of transverse return-wall restraint. All stones remain dry-jointed rigid bodies with unilateral frictional contacts.

The ring beam comprises eight rigid segments. Seven penalty joints transmit axial force, shear and bending moment with:

- axial stiffness: 50 MN/m;
- shear stiffness: 20 MN/m;
- rotational stiffness: 20 MN m/rad;
- damping ratio: 0.12.

A 30 kN horizontal action is applied at the centre of the left segment. Beam-to-wall transfer is only by frictional contact: no bond or anchor is inserted. The physics timestep is subdivided automatically according to joint frequency.

## Suggested in-app comparison

1. Load **Masonry examples → RC ring beam · cobble wall** and press Play.
2. In **Observe**, keep the fixed 100 kN load scale, show force chains and boundary reactions, and compare the current blocks with **Initial configuration**.
3. Select each beam segment in **Block**. Record beam-joint force and moment and the contact reactions from stones below it.
4. Export the loaded state. Reset, select the first beam segment and clear its horizontal force to obtain a self-weight baseline. Run for the same simulated time and export again.
5. Compare the two exported geometries rather than comparing absolute settlement from the un-settled initial scene.
6. Repeat with lower/higher irregular-block friction, or remove one side boundary. Change one input at a time.

Questions for students:

- Why is the beam displacement much more uniform than the displacement field of the cobbles?
- Which part of the 30 kN action reaches each return-wall restraint?
- Does a dark stone have a large resultant, or can it carry large opposing contacts in equilibrium?
- Why does the absence of a beam-to-wall anchor permit relative movement even when the beam itself is stiff?
- Which conclusion changes when a rigid side boundary is removed?

## Reference numerical observation

A deterministic comparison used seed 42, thickness 0.30 m, density 1800 kg/m³, regular/irregular friction 0.70/0.60, both side restraints, and 10 s of simulated time. The self-weight baseline reached the app's numerical equilibrium criterion at 10 s. The 30 kN case had already slowed to about 0.002 m/s at 10 s and reached the criterion by 15 s.

Loaded minus baseline results were:

| Quantity | Value |
| --- | ---: |
| Mean beam translation, x | 44.3 mm |
| Beam non-uniform displacement RMS | 2.69 mm |
| Beam relative-rotation range | 2.06 mrad |
| Maximum core-stone displacement difference | 9.21 mm |
| Core non-uniform displacement RMS | 2.20 mm |
| Maximum beam-joint force | 30.2 kN |
| Maximum beam-joint moment | 8.10 kN m |

The most direct observation is relative sliding: the beam moves about 44 mm as a nearly coherent line while the cobble core changes much less in the matched baseline comparison. This occurs because the idealised beam has no positive connection to the wall and transfers horizontal action only through friction. The load shading still reveals local, non-uniform contact paths below the beam.

These numbers depend on the penalty stiffnesses, friction, rigid return-wall idealisation, solver, comparison time and contact rearrangements. They demonstrate the behaviour of this teaching model, not material stiffness identified from tests and not the adequacy of an actual retrofit.
