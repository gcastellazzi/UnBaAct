import RAPIER from "@dimforge/rapier2d-compat";

// Cell-centred beam: U = 1/2 Σ kt h w² + 1/2 Σ Gt/h (Δw)²
//                         + 1/2 Σ EI/h³ (Δ²w)².
// Free ends, vertical DOFs. Collision strips transmit forces in both directions
// through Rapier; they are part of the dynamic system, not prescribed supports.
export const BASE_DEFAULTS = Object.freeze({
  model: "winkler", pattern: "bricks", rows: 2, course: .25, blockWidth: .65,
  margin: .4, k: 2e6, shear: 1e5, EI: 10000, depth: .15,
  density: 2400, damping: .7, segments: 24, seed: 42,
  zone: "full", zoneFraction: .4,
});

export function validateBase(input) {
  if (input == null) return null;
  const p = { ...BASE_DEFAULTS, ...input };
  if (!["winkler", "pasternak"].includes(p.model) ||
      !["bricks", "regular-stone", "irregular-stone", "none"].includes(p.pattern) ||
      !["full", "center", "left", "right"].includes(p.zone))
    throw Error("Invalid elastic foundation model or masonry pattern.");
  for (const [key, min, max] of [
    ["rows", 1, 6], ["course", .05, 1], ["blockWidth", .1, 2], ["margin", 0, 3],
    ["k", 100, 1e10], ["shear", 0, 1e10], ["EI", .01, 1e10],
    ["depth", .02, 1], ["density", 1, 30000], ["damping", 0, 2],
    ["segments", 6, 60], ["seed", 0, 4294967295],
    ["zoneFraction", .1, .9],
    ["left", -100, 100], ["right", -100, 100], ["top", -100, 100],
  ]) {
    if (!Number.isFinite(p[key]) || p[key] < min || p[key] > max)
      throw Error(`Foundation ${key} must be between ${min} and ${max}.`);
  }
  if (![p.rows, p.segments, p.seed].every(Number.isInteger) || p.right - p.left < .3)
    throw Error("Invalid foundation dimensions or mesh.");
  return p;
}

export function baseLayout(p) {
  const h = (p.right - p.left)/p.segments;
  // Retain the full-span mesh spacing; a shorter patch must not silently
  // multiply stiffness by squeezing the same number of strips into it.
  const n = p.zone === "full" ? p.segments : Math.max(3, Math.min(p.segments - 1, Math.round(p.segments*p.zoneFraction)));
  const span = n*h;
  const left = p.zone === "right" ? p.right - span : p.zone === "center" ? (p.left + p.right - span)/2 : p.left;
  const right = left + span;
  const rigid = [];
  if (left > p.left + 1e-9) rigid.push({ left: p.left, right: left, label: "Rigid base left" });
  if (right < p.right - 1e-9) rigid.push({ left: right, right: p.right, label: "Rigid base right" });
  return { n, h, left, right, rigid };
}

export function baseSystem(input, thickness, dt = 1/120) {
  const p = validateBase(input), layout = baseLayout(p);
  const { n, h } = layout;
  if (!(Number.isFinite(thickness) && thickness > 0)) throw Error("Invalid foundation thickness.");
  const mass = p.density*thickness*p.depth*h, spring = p.k*thickness*h;
  const shear = p.model === "pasternak" ? p.shear*thickness/h : 0;
  const bend = p.EI/h**3;
  const K = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) K[i][i] = spring;
  const term = (start, v, coefficient) => {
    for (let a = 0; a < v.length; a++) for (let b = 0; b < v.length; b++)
      K[start + a][start + b] += coefficient*v[a]*v[b];
  };
  for (let i = 0; i < n - 1; i++) term(i, [-1, 1], shear);
  for (let i = 0; i < n - 2; i++) term(i, [1, -2, 1], bend);
  const damping = 2*p.damping*Math.sqrt(mass*spring);
  const omega = Math.sqrt(Math.max(...K.map((row) => row.reduce((s, v) => s + Math.abs(v), 0)))/mass);
  const substeps = Math.max(1, Math.ceil(dt*Math.max(omega, damping/mass)/.35));
  if (substeps > 128)
    throw Error("Foundation too stiff for this mesh: reduce segments or stiffness, or increase transfer-layer depth.");
  return { p, ...layout, mass, spring, shear, K, damping, substeps };
}

export class ElasticBase {
  constructor(world, input, thickness, friction) {
    Object.assign(this, baseSystem(input, thickness));
    this.world = world;
    this.referenceY = this.p.top - this.p.depth/2;
    this.strips = Array.from({ length: this.n }, (_, i) => {
      const x = this.left + (i + .5)*this.h;
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, this.referenceY).enabledTranslations(false, true)
        .lockRotations().setCanSleep(false).setCcdEnabled(true));
      const collider = world.createCollider(RAPIER.ColliderDesc.cuboid(this.h/2, this.p.depth/2)
        .setDensity(this.p.density*thickness).setFriction(friction)
        // Strip/strip collision is disabled; masonry still contacts each strip.
        .setCollisionGroups(0x00020001), body);
      collider.label = "Elastic base";
      return { body, collider, x };
    });
  }
  apply() {
    const u = this.strips.map((s) => s.body.translation().y - this.referenceY);
    this.strips.forEach((s, i) => {
      const elastic = -this.K[i].reduce((sum, k, j) => sum + k*u[j], 0);
      s.body.resetForces(true);
      s.body.addForce({ x: 0, y: elastic - this.damping*s.body.linvel().y }, true);
    });
  }
  snapshot() {
    return this.strips.map((s) => ({ y: s.body.translation().y, vy: s.body.linvel().y }));
  }
  restore(state) {
    if (!state) return;
    if (!Array.isArray(state) || state.length !== this.n ||
      state.some((s) => !Number.isFinite(s.y) || !Number.isFinite(s.vy) || Math.abs(s.y) > 200 || Math.abs(s.vy) > 1000))
      throw Error("Invalid elastic foundation state.");
    this.strips.forEach((s, i) => {
      s.body.setTranslation({ x: s.x, y: state[i].y }, true);
      s.body.setLinvel({ x: 0, y: state[i].vy }, true);
    });
  }
  report() {
    const w = this.strips.map((s) => this.referenceY - s.body.translation().y);
    const samples = this.strips.map((s, i) => {
      const soil = this.spring*w[i] + this.shear*((i ? w[i] - w[i - 1] : 0) + (i < this.n - 1 ? w[i] - w[i + 1] : 0));
      return { x: s.x, w: w[i], reaction: soil/this.h };
    });
    return { samples, maxSettlement: Math.max(...w), minSettlement: Math.min(...w),
      soilReaction: samples.reduce((s, p) => s + p.reaction*this.h, 0),
      mass: this.mass*this.n, speed: Math.max(...this.strips.map((s) => Math.abs(s.body.linvel().y))) };
  }
  dispose() {
    for (const s of this.strips) this.world.removeRigidBody(s.body);
  }
}

// Separate the masonry-to-rigid contact reactions from the elastic soil.
// Their sum balances masonry + moving-layer weight at rest (open sides).
export function baseSupportReport(sim) {
  if (!sim.base) return null;
  const beam = sim.base.report();
  const rigid = { x: 0, y: 0 };
  for (const c of sim.contacts) if (!c.b && c.wall?.startsWith("Rigid base")) {
    rigid.x += -c.normal.x*c.fn + c.normal.y*c.ft;
    rigid.y += -c.normal.y*c.fn - c.normal.x*c.ft;
  }
  return { ...beam, rigidReaction: rigid, totalVertical: beam.soilReaction + rigid.y,
    elasticLeft: sim.base.left, elasticRight: sim.base.right,
    elasticFraction: (sim.base.right - sim.base.left)/(sim.base.p.right - sim.base.p.left) };
}
