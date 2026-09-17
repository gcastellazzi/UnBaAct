import { test, before } from "node:test";
import assert from "node:assert/strict";
import { initialize, Simulation } from "../src/physics.js";
import { worldAnchor, validateTieSpecs } from "../src/ties.js";
before(initialize);
const error = (t) => {
  const p = worldAnchor(t.a, t.anchorA),
    q = worldAnchor(t.b, t.anchorB);
  return Math.abs(Math.hypot(p.x - q.x, p.y - q.y) - t.length);
};
test("tie resists tension and compression without adding mass, and exposes equal/opposite reactions", () => {
  const s = new Simulation({ gravity: 0, boundary: "free" });
  try {
    const a = s.add({ x: 3, y: 5, r: 0.4 }),
      b = s.add({ x: 7, y: 5, r: 0.4 }),
      tie = s.addTie(a, b),
      mass = a.body.mass() + b.body.mass();
    for (const force of [10, -10]) {
      s.setLoad(b, 0, force);
      for (let k = 0; k < 120; k++) {
        s.step();
        assert.ok(error(tie) < 1e-5);
      }
      assert.ok(Math.abs(a.residual.x - force / 2) < 0.001);
      assert.ok(Math.abs(tie.force.x + force / 2) < 0.001);
    }
    assert.equal(s.world.bodies.len(), 2);
    assert.equal(a.body.mass() + b.body.mass(), mass);
  } finally {
    s.dispose();
  }
});
test("centre ties leave rotations free; offset click anchors retain their separation", () => {
  for (const offset of [0, 0.2]) {
    const s = new Simulation({ gravity: 0, boundary: "free" });
    try {
      const a = s.add({ x: 3, y: 5, r: 0.4, shape: "square" }),
        b = s.add({ x: 7, y: 5, r: 0.4 });
      const tie = s.addTie(
        a,
        b,
        { x: 3, y: 5 + offset },
        { x: 7, y: 5 - offset },
      );
      a.body.setAngvel(1, true);
      for (let k = 0; k < 120; k++) {
        s.step();
        assert.ok(error(tie) < 1e-5);
      }
      assert.ok(Math.abs(a.body.rotation()) > 0.1);
    } finally {
      s.dispose();
    }
  }
});
test("tie networks survive roundtrip, manual movement and endpoint deletion", () => {
  const s = new Simulation({ gravity: 0, boundary: "free" });
  let restored;
  try {
    const a = s.add({ x: 3, y: 4 }),
      b = s.add({ x: 6, y: 4 }),
      c = s.add({ x: 5, y: 6 });
    s.addTie(a, b);
    s.addTie(a, c);
    s.addTie(b, c);
    const specs = s.tieSpecs();
    validateTieSpecs(specs, s.specs());
    assert.throws(() => s.addTie(a, a));
    assert.throws(() => s.addTie(a, b));
    restored = new Simulation({ gravity: 0, boundary: "free" });
    s.specs().forEach((p) => restored.add(p));
    for (const spec of specs)
      restored.addTie(
        restored.items.find((i) => i.id === spec.a),
        restored.items.find((i) => i.id === spec.b),
        undefined,
        undefined,
        spec,
      );
    assert.deepEqual(restored.tieSpecs(), specs);
    a.body.setTranslation({ x: 2.5, y: 3.5 }, true);
    s.enforceTies();
    for (const t of s.ties) assert.ok(error(t) < 1e-5);
    s.remove(a);
    assert.equal(s.ties.length, 1);
    s.step();
    s.removeTie(s.ties[0]);
    assert.equal(s.ties.length, 0);
    assert.throws(() =>
      validateTieSpecs([{ ...specs[0], b: 999 }], restored.specs()),
    );
    assert.throws(() =>
      validateTieSpecs([{ ...specs[0], length: -1 }], restored.specs()),
    );
    validateTieSpecs([], restored.specs());
  } finally {
    s.dispose();
    restored?.dispose();
  }
});

test("falling ties preserve floor and side supports and balanced ground reactions", () => {
  const s = new Simulation();
  try {
    const a = s.add({ x: 4, y: 4 }),
      b = s.add({ x: 7, y: 4 }),
      c = s.add({ x: 5, y: 6 });
    s.addTie(a, b);
    s.addTie(a, c);
    s.setLoad(a, 0, 10);
    for (let k = 0; k < 600; k++) {
      s.step();
      for (const t of s.ties) assert.ok(error(t) < 1e-5);
      for (const i of s.items) {
        const p = i.body.translation();
        assert.ok(p.y - i.r >= -1e-5);
        assert.ok(p.x - i.r >= 1 - 1e-5);
        assert.ok(p.x + i.r <= 11 + 1e-5);
      }
    }
    const ground = s.contacts
        .filter((c) => !c.b && c.wall === "Floor")
        .reduce((sum, c) => sum + c.fn, 0),
      weight = s.items.reduce((sum, i) => sum + i.body.mass() * 9.81, 0);
    assert.ok(Math.abs(ground - weight) < 0.01);
  } finally {
    s.dispose();
  }
});
