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
  const corners = blocks.filter((b) => b.role === "corner-stone");
  assert.equal(corners.length, 16);
  assert.ok(blocks.filter((b) => b.role === "rounded-stone").length > 60);

  const bounds = (b) => {
    const xs = [], ys = [];
    for (let k = 0; k < b.vertices.length; k += 2) {
      xs.push(b.x + b.vertices[k]);
      ys.push(b.y + b.vertices[k + 1]);
    }
    return {
      left: Math.min(...xs), right: Math.max(...xs),
      bottom: Math.min(...ys), top: Math.max(...ys),
    };
  };
  for (const side of [corners.filter((b) => b.x < 6), corners.filter((b) => b.x > 6)]) {
    const courses = side.map(bounds).sort((a, b) => a.bottom - b.bottom);
    assert.equal(courses.length, 8);
    for (const course of courses)
      assert.ok(Math.abs(course.right - course.left - 1.34) < 1e-9);
    for (let k = 1; k < courses.length; k++)
      assert.ok(Math.abs(courses[k - 1].top - courses[k].bottom) < 1e-9);
  }
});

test("double-width cobble wall doubles the span and beam segmentation", () => {
  const regular = generateOpus("rc-beam-cobble-wall", 42);
  const wide = generateOpus("rc-beam-cobble-wall-wide", 42);
  const extent = (blocks) => {
    const xs = blocks.flatMap((b) => {
      const out = [];
      for (let k = 0; k < b.vertices.length; k += 2)
        out.push(b.x + b.vertices[k]);
      return out;
    });
    return Math.max(...xs) - Math.min(...xs);
  };
  assert.ok(Math.abs(extent(wide) - 2 * extent(regular)) < 1e-9);
  assert.equal(wide.filter((b) => b.role === "rc-beam-segment").length, 16);
  assert.equal(wide.filter((b) => b.role === "corner-stone").length, 16);
  assert.equal(wide.filter((b) => b.role === "rounded-stone").length, 180);
  assert.deepEqual(wide.filter((b) => b.loadX).map((b) => b.loadX), [30000]);
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
