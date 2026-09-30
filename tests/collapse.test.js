import { test, before } from "node:test";
import assert from "node:assert/strict";
import { initialize, Simulation, actionPattern } from "../src/physics.js";
import {
  collapseAnalysis,
  tieComparison,
  equilibriumReport,
} from "../src/collapse.js";
before(initialize);
const config = { boundary: "free", friction: 0.8, gravity: 9.81 };
const column = (x, id) => ({
  id,
  shape: "rectangle",
  width: 0.4,
  height: 1.2,
  x,
  y: 0.6,
  angle: 0,
});
test("inverse triangular pattern keeps the uniform base shear", () => {
  const blocks = [
    { mass: 1, y: 1 },
    { mass: 2, y: 3 },
  ];
  const u = actionPattern(blocks, "uniform", 10),
    t = actionPattern(blocks, "triangular", 10);
  assert.ok(Math.abs(t[0].x + t[1].x - (u[0].x + u[1].x)) < 1e-9);
  assert.ok(t[1].x / 2 > t[0].x);
});
test("equilibrium report balances a resting block", () => {
  const s = new Simulation(config);
  try {
    s.add(column(6, 1));
    for (let k = 0; k < 360; k++) s.step();
    const r = equilibriumReport(s);
    assert.ok(r.globalError < 0.02, `global error ${r.globalError}`);
    assert.ok(r.maxForceRatio < 0.03);
  } finally {
    s.dispose();
  }
});
test("slender block overturns at λ ≈ b/h", async () => {
  const r = await collapseAnalysis(
    { specs: [column(6, 1)], ties: [], config },
    { lambdaMax: 0.6, steps: 12, bisections: 4 },
  );
  assert.ok(r.selfWeight.stable);
  assert.ok(r.bounded);
  assert.ok(Math.abs(r.lambda - 0.4 / 1.2) < 0.04, `λ = ${r.lambda}`);
});
test("a tie-down anchoring a slender block raises the collapse multiplier", async () => {
  const base = {
      id: 1,
      shape: "rectangle",
      width: 2,
      height: 0.3,
      x: 6,
      y: 0.15,
      angle: 0,
    },
    slender = { ...column(6, 2), y: 0.9 };
  const s = new Simulation(config);
  let ties;
  try {
    const a = s.add(base),
      b = s.add(slender);
    s.addTie(b, a, { x: 5.85, y: 0.4 }, { x: 5.85, y: 0.1 });
    ties = s.tieSpecs();
  } finally {
    s.dispose();
  }
  const { pre, post, gain } = await tieComparison(
    { specs: [base, slender], ties, config },
    { lambdaMax: 1, steps: 10, bisections: 3 },
  );
  assert.ok(pre.bounded && Math.abs(pre.lambda - 1 / 3) < 0.06, `pre ${pre.lambda}`);
  assert.ok(gain > 1.5, `pre ${pre.lambda} post ${post.lambda}`);
  assert.ok(post.mechanism === null || post.mechanism.length === 2);
});
