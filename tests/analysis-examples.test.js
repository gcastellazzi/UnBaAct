import { test, before } from "node:test";
import assert from "node:assert/strict";
import { initialize, Simulation } from "../src/physics.js";
import { tieComparison, collapseAnalysis } from "../src/collapse.js";
import { validateTieSpecs } from "../src/ties.js";
import { decomposePolygon } from "../src/geometry.js";
import {
  ANALYSIS_EXAMPLES,
  EXAMPLE_SETTINGS,
  analysisExample,
} from "../src/analysis-examples.js";
before(initialize);
const config = {
  boundary: "free",
  friction: EXAMPLE_SETTINGS.friction,
  gravity: 9.81,
  thickness: EXAMPLE_SETTINGS.thickness,
  materialDensity: EXAMPLE_SETTINGS.materialDensity,
};
const scene = (id) => {
  const e = analysisExample(id);
  return { specs: e.particles, ties: e.ties, config, example: e };
};

test("analysis examples are valid, inside the floor and stand under self-weight", async () => {
  for (const { id } of ANALYSIS_EXAMPLES) {
    const s = scene(id);
    validateTieSpecs(s.ties, s.specs);
    for (const p of s.specs) {
      decomposePolygon(p.vertices);
      for (let k = 0; k < p.vertices.length; k += 2) {
        const x = p.x + p.vertices[k],
          y = p.y + p.vertices[k + 1];
        assert.ok(x > 1 && x < 11 && y >= 0, `${id}: vertex outside floor`);
      }
    }
    const r = await collapseAnalysis(s, {
      pattern: s.example.pattern,
      lambdaMax: s.example.lambdaMax,
      steps: 10,
      bisections: 2,
    });
    assert.ok(r.selfWeight.stable, `${id} unstable under self-weight`);
  }
});

test("calibration block overturns at λ ≈ b/h", async () => {
  const r = await collapseAnalysis(scene("calibration-block"), {
    lambdaMax: 0.6,
    steps: 12,
  });
  assert.ok(Math.abs(r.lambda - 1 / 3) < 0.04, `λ = ${r.lambda}`);
});

test("tied voussoir joints and arcade chains raise the collapse multiplier", async () => {
  const arch = await tieComparison(scene("arch-tied"), {
    lambdaMax: 1,
    steps: 20,
    bisections: 3,
  });
  assert.ok(arch.gain > 1.2, `arch ${arch.pre.lambda} → ${arch.post.lambda}`);
  const arcade = await tieComparison(scene("arcade-chains"), {
    pattern: "loads",
    lambdaMax: 20,
    steps: 20,
    bisections: 3,
  });
  assert.ok(
    arcade.gain > 1.15,
    `arcade ${arcade.pre.lambda} → ${arcade.post.lambda}`,
  );
});

test("tension-only tie pulls but never pushes", () => {
  const s = new Simulation({ boundary: "free", gravity: 0 });
  try {
    const a = s.add({ id: 1, shape: "rectangle", width: 0.4, height: 0.4, x: 5, y: 3 }),
      b = s.add({ id: 2, shape: "rectangle", width: 0.4, height: 0.4, x: 6, y: 3 });
    s.addTie(a, b, { x: 5, y: 3 }, { x: 6, y: 3 }, { tension: true });
    b.body.setLinvel({ x: -1, y: 0 }, true);
    for (let k = 0; k < 24; k++) s.step();
    assert.ok(b.body.translation().x < 5.9, "approach is free");
    b.body.setLinvel({ x: 2, y: 0 }, true);
    for (let k = 0; k < 120; k++) s.step();
    const d = b.body.translation().x - a.body.translation().x;
    assert.ok(d <= 1.001, `extension ${d}`);
    assert.equal(s.tieSpecs()[0].tension, true);
  } finally {
    s.dispose();
  }
});
