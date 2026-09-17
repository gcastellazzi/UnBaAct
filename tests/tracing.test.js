import { test, before } from "node:test";
import assert from "node:assert/strict";
import {
  validateContour,
  contourSpec,
  decomposePolygon,
  polygonArea,
} from "../src/geometry.js";
import { initialize, Simulation } from "../src/physics.js";
import { transformTracedSpecs } from "../src/photo.js";
before(initialize);
const square = [
  { x: 4, y: 0 },
  { x: 5, y: 0 },
  { x: 5, y: 1 },
  { x: 4, y: 1 },
];
const concave = [
  { x: 4, y: 0 },
  { x: 6, y: 0 },
  { x: 6, y: 1 },
  { x: 5, y: 1 },
  { x: 5, y: 2 },
  { x: 4, y: 2 },
];
test("tracing accepts either winding and removes a closing duplicate", () => {
  const a = contourSpec(square, "test-photo"),
    b = contourSpec([...square].reverse(), "test-photo");
  assert.equal(a.x, b.x);
  assert.equal(a.y, b.y);
  assert.equal(validateContour([...square, square[0]]).length, 4);
  assert.equal(decomposePolygon(a.vertices).length, 1);
});
test("crossed and degenerate outlines are rejected", () => {
  assert.throws(
    () =>
      contourSpec([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
        { x: 1, y: 0 },
      ]),
    /crosses/,
  );
  assert.throws(
    () =>
      contourSpec([
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ]),
    /area/,
  );
  assert.throws(() => contourSpec(square.slice(0, 2)), /vertices/);
});
test("concave outline is one rigid body with area-preserving compound contacts", () => {
  const spec = contourSpec(concave, "photo");
  const pieces = decomposePolygon(spec.vertices);
  assert.ok(pieces.length > 1);
  assert.ok(
    Math.abs(
      pieces.reduce(
        (sum, v) =>
          sum +
          polygonArea(
            Array.from({ length: v.length / 2 }, (_, k) => ({
              x: v[k * 2],
              y: v[k * 2 + 1],
            })),
          ),
        0,
      ) - 3,
    ) < 1e-9,
  );
  const s = new Simulation({
    boundary: "free",
    thickness: 0.5,
    materialDensity: 1000,
  });
  try {
    const i = s.add(spec);
    assert.equal(s.items.length, 1);
    assert.equal(i.colliders.length, pieces.length);
    assert.ok(Math.abs(i.body.mass() - 1500) < 0.01);
    assert.equal(s.specs()[0].photoId, "photo");
    for (let k = 0; k < 600; k++) s.step();
    const floor = s.contacts.filter((c) => !c.b);
    assert.ok(floor.length > 0);
    const reaction = floor.reduce((sum, c) => sum - c.normal.y * c.fn, 0);
    assert.ok(Math.abs(reaction - i.body.mass() * 9.81) < 1);
    s.remove(i);
    assert.equal(s.items.length, 0);
  } finally {
    s.dispose();
  }
});
test("thickness and volumetric density update mass and inertia immediately", () => {
  const s = new Simulation({ gravity: 0 });
  try {
    const i = s.add(contourSpec(square));
    const m = i.body.mass(),
      inertia = i.body.principalInertia();
    s.configure({ thickness: 0.4, materialDensity: 2000 });
    assert.ok(Math.abs(i.body.mass() - m * 800) < 0.01);
    assert.ok(Math.abs(i.body.principalInertia() - inertia * 800) < 0.01);
  } finally {
    s.dispose();
  }
});
test("photo scaling preserves registration, scales area and ignores other bodies", () => {
  const a = contourSpec(square, "photo"),
    other = contourSpec(concave, "other");
  const [scaled, untouched] = transformTracedSpecs(
    [a, other],
    { x: 1, y: 0, width: 10 },
    { x: 2, y: 1, width: 20 },
    "photo",
  );
  assert.equal(scaled.x, 9);
  assert.equal(scaled.y, 2);
  assert.equal(scaled.r, a.r * 2);
  assert.deepEqual(
    scaled.vertices,
    a.vertices.map((v) => v * 2),
  );
  assert.deepEqual(untouched, other);
});
