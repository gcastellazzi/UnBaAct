import { test, before } from "node:test";
import assert from "node:assert/strict";
import {
  generateJointFillers,
  clearance,
  outline,
} from "../src/joint-fillers.js";
import { generateOpus } from "../src/scenarios.js";
import { initialize, Simulation, DT } from "../src/physics.js";
before(initialize);
test("horizontal force persists, reverses and clears, with legacy load compatibility", () => {
  const s = new Simulation({ gravity: 0, boundary: "free" });
  try {
    const i = s.add({ x: 6, y: 5 });
    s.setLoad(i, 0, 10);
    s.step();
    assert.ok(Math.abs(i.residual.x - 10) < 0.001);
    assert.ok(Math.abs(i.body.linvel().x - (10 * DT) / i.body.mass()) < 0.001);
    assert.equal(s.specs()[0].loadX, 10);
    s.setLoad(i, 0, -10);
    s.step();
    assert.ok(Math.abs(i.residual.x + 10) < 0.001);
    s.setLoad(i, 0);
    assert.equal(i.loadX, 0);
    const vx = i.body.linvel().x;
    s.step();
    assert.ok(Math.abs(i.body.linvel().x - vx) < 0.001);
  } finally {
    s.dispose();
  }
});
for (const kind of ["imperfection", "sneck"])
  test(`${kind}: deterministic void placement, no overlaps and finite simulation`, () => {
    const base = generateOpus("load-oblique-irregular");
    const fillers = generateJointFillers(base, kind, 42);
    assert.ok(fillers.length > 10);
    assert.deepEqual(fillers, generateJointFillers(base, kind, 42));
    assert.notDeepEqual(fillers, generateJointFillers(base, kind, 43));
    for (let k = 0; k < fillers.length; k++) {
      const f = fillers[k];
      for (const b of base) assert.ok(clearance(f, outline(b)) >= f.r - 1e-8);
      for (let j = 0; j < k; j++)
        assert.ok(
          Math.hypot(f.x - fillers[j].x, f.y - fillers[j].y) >=
            f.r + fillers[j].r,
        );
    }
    const s = new Simulation();
    try {
      [...base, ...fillers].forEach((f) => s.add(f));
      for (let k = 0; k < 240; k++) s.step();
      for (const i of s.items)
        assert.ok(Object.values(i.body.translation()).every(Number.isFinite));
      assert.ok(
        s.contacts.some((c) => c.a.role === kind || c.b?.role === kind),
      );
    } finally {
      s.dispose();
    }
  });
