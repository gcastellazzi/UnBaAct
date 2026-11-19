import { test, before } from "node:test";
import assert from "node:assert/strict";
import { initialize, Simulation } from "../src/physics.js";
import { generateOpus } from "../src/scenarios.js";
import { flexibleBeamPairs } from "../src/flexible-beam.js";

before(initialize);

test("segmented beam transfers an end force with equal-and-opposite internal reactions", () => {
  const sim = new Simulation({ gravity: 0, boundary: "free", materialDensity: 100 });
  try {
    const common = {
      shape: "rectangle", width: 1, height: 0.4,
      role: "rc-beam-segment", beamId: "test", beamLength: 1,
      beamAxial: 1e4, beamShear: 1e4, beamRotation: 1e3, beamDamping: 0.5,
    };
    const a = sim.add({ ...common, x: 3, y: 5, beamIndex: 0, loadX: 10 });
    const b = sim.add({ ...common, x: 4, y: 5, beamIndex: 1 });
    for (let k = 0; k < 480; k++) sim.step();
    assert.equal(sim.flexJoints.length, 1);
    assert.ok(Math.abs(a.body.linvel().x - b.body.linvel().x) < 1e-4);
    assert.ok(Math.abs(sim.flexJoints[0].force.x) > 4);
    assert.ok(Math.abs(sim.flexJoints[0].force.x) < 6);
    assert.ok(Math.abs(b.body.translation().x - a.body.translation().x - 1) < 6e-4);
    assert.equal(flexibleBeamPairs(sim.items).length, 1);
    const saved = sim.specs();
    assert.equal(saved[0].beamAxial, 1e4);
    assert.equal(saved[1].beamIndex, 1);
  } finally {
    sim.dispose();
  }
});

test("cobble-wall preset separates corner, core and deformable RC-beam roles", () => {
  const blocks = generateOpus("rc-beam-cobble-wall", 42);
  const beam = blocks.filter((b) => b.role === "rc-beam-segment");
  assert.equal(beam.length, 8);
  assert.deepEqual(beam.map((b) => b.beamIndex), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(beam.filter((b) => b.loadX).map((b) => b.loadX), [30000]);
  assert.equal(blocks.filter((b) => b.role === "corner-stone").length, 16);
  assert.ok(blocks.filter((b) => b.role === "rounded-stone").length > 60);
});

test("short side boundaries idealise return walls without touching the top beam", () => {
  const sim = new Simulation({
    boundary: "cup",
    bounds: { left: 1, right: 11, bottom: 0, top: 8, sideWallTop: 6.5 },
  });
  try {
    const sides = sim.walls.filter((w) => /wall/i.test(w.label));
    assert.equal(sides.length, 2);
    assert.ok(sides.every((w) => Math.abs(w.translation().y - 3.25) < 1e-9));
    assert.ok(sides.every((w) => Math.abs(w.shape.halfExtents.y - 3.25) < 1e-9));
  } finally {
    sim.dispose();
  }
});
