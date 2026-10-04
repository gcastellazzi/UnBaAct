import { Simulation, DT } from "./physics.js";

export const PATTERNS = {
  uniform: "Horizontal ∝ self-weight (uniform)",
  triangular: "Horizontal ∝ weight × height (inverse triangular, 1st mode)",
  gravity: "Vertical: additional self-weight",
  loads: "Vertical: applied block loads",
};

// Global and local balance of the current snapshot. Reactions are forces
// exerted by the boundaries on the blocks; ΣR + ΣW + ΣF ≈ 0 at equilibrium.
export function equilibriumReport(sim) {
  const g = sim.config.gravity;
  let weight = 0,
    fx = 0,
    fy = 0,
    rx = 0,
    ry = 0,
    kinetic = 0,
    maxForce = 0,
    maxMoment = 0;
  for (const i of sim.items) {
    const m = i.body.mass(),
      v = i.body.linvel(),
      w = m * g;
    weight += w;
    fx += (i.loadX || 0) + (i.actionForce?.x ?? 0);
    fy += -(i.load || 0) + (i.actionForce?.y ?? 0);
    kinetic +=
      0.5 * m * (v.x ** 2 + v.y ** 2) +
      0.5 * i.body.principalInertia() * i.body.angvel() ** 2;
    const scale = Math.max(w + Math.hypot(i.loadX || 0, i.load || 0), 1e-9);
    maxForce = Math.max(
      maxForce,
      Math.hypot(i.residual.x, i.residual.y) / scale,
    );
    maxMoment = Math.max(maxMoment, Math.abs(i.torque) / (scale * i.r));
  }
  for (const c of sim.contacts)
    if (!c.b) {
      rx += -c.normal.x * c.fn + c.normal.y * c.ft;
      ry += -c.normal.y * c.fn - c.normal.x * c.ft;
    }
  const demand = Math.max(weight + Math.hypot(fx, fy), 1e-9);
  return {
    weight,
    applied: { x: fx, y: fy },
    reaction: { x: rx, y: ry },
    // Relative global imbalance |ΣR + ΣW + ΣF| / (W + |F|).
    globalError: Math.hypot(rx + fx, ry + fy - weight) / demand,
    maxForceRatio: maxForce,
    maxMomentRatio: maxMoment,
    kinetic,
    speed: sim.speed || 0,
    quiet: sim.quiet,
    computed: sim.time > 0,
  };
}

function build(state, config) {
  const sim = new Simulation(config);
  for (const s of state.specs) sim.add(s);
  sim.base?.restore(state.baseState);
  for (const t of state.ties)
    sim.addTie(
      sim.items.find((i) => i.id === t.a),
      sim.items.find((i) => i.id === t.b),
      undefined,
      undefined,
      t,
    );
  return sim;
}
const snapshot = (sim) => ({ specs: sim.specs(), ties: sim.tieSpecs(), baseState: sim.base?.snapshot() });

function displacement(sim, reference) {
  let max = 0;
  for (const i of sim.items) {
    const r = reference.find((s) => s.id === i.id);
    if (!r) continue;
    const p = i.body.translation();
    max = Math.max(
      max,
      Math.hypot(p.x - r.x, p.y - r.y) +
        Math.abs(i.body.rotation() - r.angle) * i.r,
    );
  }
  return max;
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

// Run until rest, a displacement beyond `limit`, or `hold` s. Rest means that
// no block drifted more than 2% of the limit over the last `rest` seconds, so
// small solver jitter around a fixed configuration (e.g. with ties) counts as
// rest while slow creep or accelerating motion does not.
async function settle(
  sim,
  reference,
  { hold, rest, limit, signal, stopEarly = true },
) {
  const steps = Math.ceil(hold / DT),
    window = Math.max(1, Math.round(rest / DT)),
    tolerance = 0.02 * limit;
  let anchor = sim.specs(),
    since = 0,
    atRest = false;
  for (let k = 1; k <= steps; k++) {
    sim.step();
    if (k % 12 !== 0) continue;
    if (displacement(sim, anchor) > tolerance) {
      anchor = sim.specs();
      since = k;
    } else if (k - since >= window && (!sim.base || sim.base.report().speed < tolerance/rest)) {
      atRest = true;
      break;
    }
    if (k % 24 === 0) {
      if (signal?.aborted) throw Error("Analysis cancelled.");
      await tick();
      if (stopEarly && displacement(sim, reference) > limit) break;
    }
  }
  const delta = displacement(sim, reference);
  return { stable: atRest && delta <= limit, delta };
}

function mechanism(sim, reference) {
  return sim.specs().map((s) => {
    const r = reference.find((q) => q.id === s.id) ?? s;
    return {
      ...s,
      dx: s.x - r.x,
      dy: s.y - r.y,
      rotation: s.angle - r.angle,
      reference: { x: r.x, y: r.y, angle: r.angle },
    };
  });
}

function medianSize(specs) {
  const r = specs.map((s) => s.r).sort((a, b) => a - b);
  return 2 * (r[Math.floor(r.length / 2)] ?? 0.5);
}

/**
 * Incremental quasi-static collapse analysis with rigid blocks. After settling
 * under self-weight, the pattern multiplier λ grows in steps; each level must
 * return to rest with a displacement below the limit. The first failing level
 * is refined by bisection, restarting from the last stable state.
 */
export async function collapseAnalysis(
  scene,
  {
    pattern = "uniform",
    direction = 1,
    lambdaMax = 1,
    steps = 20,
    bisections = 5,
    limitFactor = 0.25,
    hold = 3,
    rest = 0.3,
    signal,
    onProgress = () => {},
  } = {},
) {
  const gravity = scene.config.gravity ?? 9.81,
    limit = limitFactor * medianSize(scene.specs),
    options = { hold, rest, limit, signal };
  let sim = build(scene, scene.config);
  const curve = [];
  try {
    onProgress({ phase: "Settling under self-weight", fraction: 0 });
    // Traced or detected blocks rarely touch exactly: settling is tolerated
    // up to two median block sizes, provided the assembly comes to rest and
    // no block leaves through the floor. λ is measured from the settled state.
    const bottom = scene.config.elasticBase?.top ?? scene.config.bounds?.bottom ?? 0;
    const self = await settle(sim, scene.specs, {
      ...options,
      hold: Math.max(hold, 8),
      rest: 0.5,
      limit: 2 * medianSize(scene.specs),
      stopEarly: false,
    });
    if (sim.items.some((i) => i.body.translation().y < bottom - 0.6))
      self.stable = false;
    const report = equilibriumReport(sim);
    if (!self.stable)
      return {
        pattern,
        direction,
        gravity,
        limit,
        selfWeight: { ...self, report },
        lambda: 0,
        curve,
        mechanism: mechanism(sim, scene.specs),
        ties: scene.ties.length,
        reason: "Not in equilibrium under self-weight.",
      };
    const reference = sim.specs();
    curve.push({ lambda: 0, delta: 0 });
    let lo = 0,
      loState = snapshot(sim),
      hi = null,
      failed = null;
    const increment = lambdaMax / steps;
    for (let k = 1; k <= steps; k++) {
      const lambda = k * increment;
      onProgress({ phase: `λ = ${lambda.toFixed(3)}`, fraction: k / steps });
      sim.setAction(pattern, lambda, direction);
      const level = await settle(sim, reference, options);
      if (!level.stable) {
        hi = lambda;
        failed = sim;
        break;
      }
      lo = lambda;
      loState = snapshot(sim);
      curve.push({ lambda, delta: level.delta });
    }
    if (hi === null)
      return {
        pattern,
        direction,
        gravity,
        limit,
        selfWeight: { ...self, report },
        lambda: lo,
        bounded: false,
        curve,
        mechanism: null,
        ties: scene.ties.length,
        reason: `No collapse up to λ = ${lambdaMax}.`,
      };
    for (let k = 0; k < bisections; k++) {
      const mid = (lo + hi) / 2;
      onProgress({
        phase: `Refining λ = ${mid.toFixed(4)}`,
        fraction: 1,
      });
      const trial = build(loState, scene.config);
      trial.setAction(pattern, mid, direction);
      const level = await settle(trial, reference, options);
      if (level.stable) {
        lo = mid;
        loState = snapshot(trial);
        curve.push({ lambda: mid, delta: level.delta });
        trial.dispose();
      } else {
        hi = mid;
        if (failed !== sim) failed.dispose();
        failed = trial;
      }
    }
    // Let the failing trial develop its mechanism for display.
    for (let k = 0; k < 60 && displacement(failed, reference) < 3 * limit; k++)
      failed.step();
    const result = {
      pattern,
      direction,
      gravity,
      limit,
      selfWeight: { ...self, report },
      lambda: lo,
      upper: hi,
      bounded: true,
      curve: curve.sort((a, b) => a.lambda - b.lambda),
      mechanism: mechanism(failed, reference),
      ties: scene.ties.length,
      reason: `Collapse between λ = ${lo.toFixed(4)} and ${hi.toFixed(4)}.`,
    };
    if (failed !== sim) failed.dispose();
    return result;
  } finally {
    sim.dispose();
  }
}

// Pre/post comparison: the same scene without ties, then with its ties.
export async function tieComparison(scene, options = {}) {
  const progress = options.onProgress ?? (() => {});
  const pre = await collapseAnalysis(
    { ...scene, ties: [] },
    {
      ...options,
      onProgress: (p) => progress({ ...p, phase: "Pre · " + p.phase }),
    },
  );
  const post = await collapseAnalysis(scene, {
    ...options,
    onProgress: (p) => progress({ ...p, phase: "Post · " + p.phase }),
  });
  return { pre, post, gain: collapseGain(pre, post) };
}

export function collapseGain(pre, post) {
  if (!pre.selfWeight.stable) return post.selfWeight.stable ? Infinity : null;
  if (pre.lambda <= 0) return null;
  return post.lambda / pre.lambda;
}
