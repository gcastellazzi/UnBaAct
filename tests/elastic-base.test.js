import test, { before } from "node:test";
import assert from "node:assert/strict";
import { initialize, Simulation } from "../src/physics.js";
import { BASE_DEFAULTS, baseSystem } from "../src/elastic-base.js";
import { foundationMasonry, blockBounds } from "../src/foundation-masonry.js";
import { equilibriumReport, collapseAnalysis } from "../src/collapse.js";
before(initialize);
const config = (changes = {}) => ({ boundary: "free", gravity: 9.81, friction: .6,
  thickness: .3, materialDensity: 1800,
  elasticBase: { ...BASE_DEFAULTS, pattern: "none", left: 3, right: 7, top: 0, segments: 16, ...changes } });
const settle = (s, steps = 900) => { for (let i = 0; i < steps; i++) s.step(); };

test("Flexible base: self-weight gives exact Winkler settlement and force balance", () => {
  for (const model of ["winkler", "pasternak"]) {
    const s = new Simulation(config({ model }));
    try {
      settle(s, 480);
      const r = s.base.report(), exact = BASE_DEFAULTS.density*BASE_DEFAULTS.depth*9.81/BASE_DEFAULTS.k;
      assert.ok(Math.abs(r.maxSettlement/exact - 1) < .01);
      assert.ok(Math.abs(r.soilReaction/(r.mass*9.81) - 1) < .01);
      assert.ok(r.speed < 1e-4);
      assert.ok(!s.walls.some((w) => w.label === "Floor"));
    } finally { s.dispose(); }
  }
});

test("Masonry load reaches soil through beam contacts; unloading recovers", () => {
  const s = new Simulation(config());
  try {
    const block = s.add({ shape: "rectangle", width: 1, height: .4, x: 5, y: .205, load: 5000 });
    settle(s);
    const r = s.base.report();
    const expected = (block.body.mass() + r.mass)*9.81 + 5000;
    assert.ok(Math.abs(r.soilReaction/expected - 1) < .025, `${r.soilReaction} / ${expected}`);
    assert.ok(equilibriumReport(s).globalError < .025);
    assert.ok(s.contacts.some((c) => c.wall === "Elastic base"));
    assert.ok(r.samples[8].w > r.samples[0].w);
    s.setLoad(block, 0);
    settle(s);
    assert.ok(s.base.report().maxSettlement < r.maxSettlement*.5);
  } finally { s.dispose(); }
});

test("Foundation masonry is deterministic, below the wall, replaceable and tagged", () => {
  const wall = [{ id: 1, shape: "rectangle", x: 5, y: .5, width: 2, height: 1, r: Math.sqrt(5)/2, angle: 0 }];
  for (const pattern of ["bricks", "regular-stone", "irregular-stone", "none"]) {
    const a = foundationMasonry(wall, { pattern }), b = foundationMasonry(wall, { pattern });
    assert.deepEqual(a, b);
    assert.deepEqual(a.particles[0], wall[0]);
    assert.equal(foundationMasonry(a.particles, { pattern }).particles.length, a.particles.length);
    for (const s of a.particles.slice(1)) {
      assert.ok(s.foundationBlock);
      assert.ok(s.y < 0 && blockBounds(s).bottom >= a.config.top - 1e-6);
    }
  }
});

test("Snapshots and side-boundary changes preserve a deformed support", () => {
  const a = new Simulation(config());
  const b = new Simulation(config());
  try {
    settle(a, 300);
    const snapshot = a.base.snapshot();
    b.base.restore(JSON.parse(JSON.stringify(snapshot)));
    assert.deepEqual(b.base.snapshot(), snapshot);
    a.configure({ boundary: "cup" });
    assert.deepEqual(a.base.snapshot(), snapshot);
    b.step();
    assert.ok(b.base.report().speed < 1e-4);
    assert.throws(() => b.base.restore([]));
  } finally { a.dispose(); b.dispose(); }
});

test("Greater beam stiffness spreads load and reduces differential settlement", () => {
  const responses = [];
  for (const EI of [100, 100000]) {
    const s = new Simulation(config({ EI }));
    try {
      s.add({ shape: "rectangle", width: .5, height: .3, x: 5, y: .16, load: 5000 });
      settle(s);
      const r = s.base.report();
      responses.push(r.maxSettlement - r.minSettlement);
    } finally { s.dispose(); }
  }
  assert.ok(responses[1] < .7*responses[0]);
});

test("Tied blocks settle onto the moving beam without rigid-floor projection", () => {
  const s = new Simulation(config({ k: 1e5 }));
  try {
    const a = s.add({ shape: "rectangle", width: .8, height: .4, x: 4.5, y: .205, load: 2000 });
    const b = s.add({ shape: "rectangle", width: .8, height: .4, x: 5.5, y: .205, load: 2000 });
    s.addTie(a, b);
    settle(s, 1400);
    assert.ok(a.body.translation().y < .18);
    assert.ok(b.body.translation().y < .18);
    assert.ok(equilibriumReport(s).globalError < .04);
  } finally { s.dispose(); }
});

test("Excessive stiffness and malformed configurations are rejected", () => {
  assert.throws(() => baseSystem({ ...config().elasticBase, EI: 1e10, segments: 60 }, .3));
  assert.throws(() => baseSystem({ ...config().elasticBase, k: -1 }, .3));
  const s = new Simulation(config());
  try {
    const before = s.base;
    assert.throws(() => s.configure({ elasticBase: { ...s.config.elasticBase, EI: 1e10, segments: 60 } }));
    assert.equal(s.base, before);
    s.step();
    assert.ok(Number.isFinite(s.base.report().maxSettlement));
  } finally { s.dispose(); }
});

test("Collapse analysis accepts a wall with masonry footing on elastic soil", async () => {
  const wall = [{ id: 1, shape: "rectangle", x: 5, y: .2, width: 1, height: .4, r: .54, angle: 0 }];
  const footing = foundationMasonry(wall, { rows: 1, segments: 8 });
  const r = await collapseAnalysis({ specs: footing.particles, ties: [],
    config: { ...config(), elasticBase: footing.config } },
    { lambdaMax: .05, steps: 2, bisections: 1 });
  assert.ok(r.selfWeight.stable, r.reason);
  assert.ok(r.selfWeight.report.globalError < .03);
});
