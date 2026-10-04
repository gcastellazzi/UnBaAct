import test from "node:test";
import assert from "node:assert/strict";
import { solveFoundation, FOUNDATION_DEFAULTS } from "../src/foundation.js";

const near = (actual, expected, tolerance = 1e-7) =>
  assert.ok(Math.abs(actual - expected) <= tolerance*Math.max(1e-8, Math.abs(expected)), `${actual} ≠ ${expected}`);

test("Uniform load: exact rigid settlement q/(kt), zero bending for both soils", () => {
  for (const model of ["winkler", "pasternak"]) {
    const r = solveFoundation({ model, point: 0 });
    const exact = (r.parameters.q + r.selfWeight)/r.kw;
    for (const s of r.samples) {
      near(s.w, exact, 1e-6);
      assert.ok(Math.abs(s.moment) < .05);
      assert.ok(Math.abs(s.shear) < .1);
    }
    near(r.totalLoad, r.totalReaction);
  }
});

test("Pasternak with zero shear stiffness equals Winkler", () => {
  const w = solveFoundation({ model: "winkler" });
  const p = solveFoundation({ model: "pasternak", shear: 0 });
  assert.deepEqual(w.samples, p.samples);
});

test("Centred point load has symmetric settlement and moment, antisymmetric shear", () => {
  for (const model of ["winkler", "pasternak"]) {
    const r = solveFoundation({ model, q: 0, density: 0 });
    r.samples.forEach((s, i) => {
      const other = r.samples.at(-1 - i);
      near(s.w, other.w, 2e-6);
      assert.ok(Math.abs(s.moment - other.moment) < .03);
      assert.ok(Math.abs(s.shear + other.shear) < .1);
    });
  }
});

test("Off-centre and end loads balance force and moment including Pasternak edge forces", () => {
  for (const model of ["winkler", "pasternak"])
    for (const position of [0, 2.37, 10]) {
      const r = solveFoundation({ model, position, shear: 2e7 });
      assert.ok(r.balanceError < 1e-7);
      assert.ok(r.momentError < 1e-7);
    }
});

test("Linear response and convergent peak settlement for a point load", () => {
  const input = { model: "pasternak", density: 0, q: 0, position: 3.37 };
  const coarse = solveFoundation({ ...input, elements: 40 });
  const fine = solveFoundation({ ...input, elements: 80 });
  near(coarse.maxSettlement, fine.maxSettlement, 5e-4);
  const doubled = solveFoundation({ ...input, point: 2*FOUNDATION_DEFAULTS.point });
  near(doubled.maxSettlement, 2*fine.maxSettlement);
});

test("Shear coupling reduces settlement under the centred point load", () => {
  const winkler = solveFoundation({ density: 0, q: 0 });
  const pasternak = solveFoundation({ density: 0, q: 0, model: "pasternak", shear: 2e7 });
  assert.ok(pasternak.maxSettlement < winkler.maxSettlement);
});

test("Long Winkler beam matches the infinite-beam point-load solution", () => {
  const r = solveFoundation({ length: 40, position: 20, height: .5,
    young: 1e9, elements: 200, q: 0, density: 0 });
  const beta = (r.kw/(4*r.EI))**.25;
  // Free boundaries are over 16 characteristic lengths from the point load.
  near(r.maxSettlement, r.parameters.point/(8*r.EI*beta**3), 2e-4);
  const centre = r.samples.find((s) => s.x === 20);
  near(centre.moment, r.parameters.point/(4*beta), .005);
});

test("Zero load gives zero response; invalid geometry and stiffness are rejected", () => {
  const r = solveFoundation({ density: 0, q: 0, point: 0 });
  assert.equal(r.maxSettlement, 0);
  for (const input of [{ k: 0 }, { young: NaN }, { length: -1 }, { position: 11 },
    { elements: 10000 }, { elements: 4.5 }, { shear: -1 }, { model: "unknown" }])
    assert.throws(() => solveFoundation(input));
});
