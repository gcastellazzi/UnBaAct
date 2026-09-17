import { test, before } from "node:test";
import assert from "node:assert/strict";
import { blockLoads, loadShade } from "../src/load-colors.js";
import { initialize, Simulation } from "../src/physics.js";
import { generateOpus } from "../src/scenarios.js";
before(initialize);
test("load shades darken monotonically and clamp to a shared reference", () => {
  const values = [0, 25, 50, 100, 200].map((n) =>
    Number(loadShade(n, 100).match(/\d+/)[0]),
  );
  assert.deepEqual(values, [248, 194, 141, 33, 33]);
});
test("contact-load indicator counts both neighbours and includes applied load and weight", () => {
  const a = { id: 1, load: 10, body: { mass: () => 2 } },
    b = { id: 2, load: 0, body: { mass: () => 1 } };
  const result = blockLoads(
    [a, b],
    [
      { a, b, fn: 20 },
      { a: b, b: null, fn: 40 },
    ],
    10,
  );
  assert.equal(result.get(1), 25);
  assert.equal(result.get(2), 35);
});
test("wide distributing block spreads the identical load across more supports", () => {
  const results = [];
  for (const id of ["load-concentrated", "load-distributed"]) {
    const sim = new Simulation();
    try {
      generateOpus(id).forEach((b) => sim.add(b));
      const initial = sim.specs();
      for (let k = 0; k < 2400; k++) sim.step();
      assert.match(sim.status(initial), /Equilibrium/);
      const loaded = sim.items.filter((i) => i.load);
      assert.equal(loaded.length, 1);
      assert.equal(loaded[0].load, 150);
      const supports = new Map();
      for (const c of sim.contacts)
        if (c.a === loaded[0] || c.b === loaded[0]) {
          const other = c.a === loaded[0] ? c.b : c.a;
          if (
            other &&
            other.body.translation().y < loaded[0].body.translation().y
          )
            supports.set(
              other.id,
              (supports.get(other.id) || 0) + Math.abs(c.normal.y * c.fn),
            );
        }
      const total = [...supports.values()].reduce((a, b) => a + b, 0);
      assert.ok(Math.abs(total - 150 - loaded[0].body.mass() * 9.81) < 0.2);
      results.push({
        count: supports.size,
        peakShare: Math.max(...supports.values()) / total,
      });
    } finally {
      sim.dispose();
    }
  }
  assert.equal(results[0].count, 2);
  assert.equal(results[1].count, 3);
  assert.ok(results[1].peakShare < results[0].peakShare);
});
