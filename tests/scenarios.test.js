import { test, before } from "node:test";
import assert from "node:assert/strict";
import { initialize, Simulation } from "../src/physics.js";
import { OPUS_SCENARIOS, generateOpus } from "../src/scenarios.js";
before(initialize);
function vertices(b) {
  return Array.from({ length: b.vertices.length / 2 }, (_, k) => ({
    x: b.x + b.vertices[k * 2],
    y: b.y + b.vertices[k * 2 + 1],
  }));
}
function overlap(a, b) {
  for (const poly of [a, b])
    for (let k = 0; k < poly.length; k++) {
      const v = poly[k],
        w = poly[(k + 1) % poly.length],
        nx = w.y - v.y,
        ny = v.x - w.x;
      const aa = a.map((p) => p.x * nx + p.y * ny),
        bb = b.map((p) => p.x * nx + p.y * ny);
      if (
        Math.max(...aa) <= Math.min(...bb) + 1e-7 ||
        Math.max(...bb) <= Math.min(...aa) + 1e-7
      )
        return false;
    }
  return true;
}
for (const scenario of OPUS_SCENARIOS) {
  test(`${scenario.id}: reproducible geometry without overlap, valid simulation`, () => {
    const blocks = generateOpus(scenario.id, 42);
    assert.deepEqual(blocks, generateOpus(scenario.id, 42));
    assert.ok(blocks.length > 20 && blocks.length < 400);
    const polys = blocks.map(vertices);
    for (const p of polys)
      for (const v of p) {
        assert.ok(v.x >= 1.025 - 1e-7 && v.x <= 10.975 + 1e-7);
        assert.ok(v.y >= 0.015 - 1e-7 && v.y <= 7.75 + 1e-7);
      }
    for (let i = 0; i < polys.length; i++)
      for (let j = i + 1; j < polys.length; j++)
        assert.ok(!overlap(polys[i], polys[j]), `blocks ${i},${j} overlap`);
    const sim = new Simulation();
    try {
      blocks.forEach((b) => sim.add(b));
      const specs = sim.specs();
      assert.deepEqual(specs[0].vertices, blocks[0].vertices);
      assert.equal(specs[0].color, blocks[0].color);
      for (let k = 0; k < 120; k++) sim.step();
      assert.ok(sim.contacts.length > 0);
      for (const i of sim.items)
        assert.ok(
          Number.isFinite(i.body.translation().y) && Number.isFinite(i.torque),
        );
    } finally {
      sim.dispose();
    }
  });
}

for (const id of ["window-regular-bricks", "window-irregular-corners"])
  test(`${id}: empty window and one independent loadable lintel`, () => {
    const blocks = generateOpus(id);
    const lintels = blocks.filter((b) => b.role === "lintel");
    assert.equal(lintels.length, 1);
    const opening = [
      { x: 4.601, y: 1.651 },
      { x: 7.399, y: 1.651 },
      { x: 7.399, y: 4.299 },
      { x: 4.601, y: 4.299 },
    ];
    for (const b of blocks)
      assert.ok(
        !overlap(vertices(b), opening),
        "window must remain empty before playback",
      );
    assert.ok(lintels[0].x === 6);
    if (id === "window-irregular-corners")
      assert.ok(blocks.filter((b) => b.role === "corner-stone").length > 20);
    const sim = new Simulation();
    try {
      blocks.forEach((b) => sim.add(b));
      const lintel = sim.items.find((b) => b.role === "lintel");
      assert.equal(sim.specs().find((b) => b.id === lintel.id).role, "lintel");
      sim.setLoad(lintel, 10);
      for (let k = 0; k < 360; k++) sim.step();
      assert.ok(Number.isFinite(lintel.residual.y));
      assert.ok(
        lintel.body.translation().y > 4.0,
        "lintel should remain supported above the opening",
      );
      sim.remove(lintel);
      assert.ok(!sim.items.some((b) => b.role === "lintel"));
      sim.step();
    } finally {
      sim.dispose();
    }
  });
