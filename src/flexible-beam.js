const DEFAULTS = Object.freeze({
  axial: 5e7,
  shear: 2e7,
  rotation: 2e7,
  damping: 0.12,
});

const cross = (w, r) => ({ x: -w * r.y, y: w * r.x });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const rotate = (p, a) => ({
  x: p.x * Math.cos(a) - p.y * Math.sin(a),
  y: p.x * Math.sin(a) + p.y * Math.cos(a),
});
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const localEnd = (item, side) => ({ x: (item.beamLength ?? item.width ?? item.r * 2) * side / 2, y: 0 });
const worldPoint = (item, local) => add(item.body.translation(), rotate(local, item.body.rotation()));
const pointVelocity = (item, local) => add(item.body.linvel(), cross(item.body.angvel(), rotate(local, item.body.rotation())));

export function flexibleBeamPairs(items) {
  const groups = new Map();
  for (const item of items.filter((i) => i.role === "rc-beam-segment")) {
    const id = item.beamId ?? "rc-beam";
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(item);
  }
  const pairs = [];
  for (const [id, members] of groups) {
    members.sort((a, b) => (a.beamIndex ?? 0) - (b.beamIndex ?? 0));
    for (let k = 0; k < members.length - 1; k++)
      pairs.push({ id, index: k, a: members[k], b: members[k + 1] });
  }
  return pairs;
}

function properties(a, b) {
  return {
    axial: a.beamAxial ?? b.beamAxial ?? DEFAULTS.axial,
    shear: a.beamShear ?? b.beamShear ?? DEFAULTS.shear,
    rotation: a.beamRotation ?? b.beamRotation ?? DEFAULTS.rotation,
    damping: a.beamDamping ?? b.beamDamping ?? DEFAULTS.damping,
  };
}

// Penalty joint between adjacent rigid segments. The centre-line spring carries
// axial/shear force and the rotational spring carries the bending couple.
// Impulses are applied every substep so the reactions remain equal and opposite.
export function stepFlexibleBeams(items, dt) {
  const joints = [];
  for (const pair of flexibleBeamPairs(items)) {
    const { a, b } = pair, pa = localEnd(a, 1), pb = localEnd(b, -1);
    const p = worldPoint(a, pa), q = worldPoint(b, pb);
    const va = pointVelocity(a, pa), vb = pointVelocity(b, pb);
    const d = { x: q.x - p.x, y: q.y - p.y };
    const dv = { x: vb.x - va.x, y: vb.y - va.y };
    const pr = properties(a, b);
    const ma = Math.max(a.body.mass(), 1e-9), mb = Math.max(b.body.mass(), 1e-9);
    const reducedMass = 1 / (1 / ma + 1 / mb);
    const cx = 2 * pr.damping * Math.sqrt(pr.axial * reducedMass);
    const cy = 2 * pr.damping * Math.sqrt(pr.shear * reducedMass);
    const force = { x: pr.axial * d.x + cx * dv.x, y: pr.shear * d.y + cy * dv.y };
    a.body.applyImpulseAtPoint({ x: force.x * dt, y: force.y * dt }, p, true);
    b.body.applyImpulseAtPoint({ x: -force.x * dt, y: -force.y * dt }, q, true);

    const ia = Math.max(a.body.principalInertia(), 1e-9), ib = Math.max(b.body.principalInertia(), 1e-9);
    const reducedInertia = 1 / (1 / ia + 1 / ib);
    const ct = 2 * pr.damping * Math.sqrt(pr.rotation * reducedInertia);
    const moment = pr.rotation * wrap(b.body.rotation() - a.body.rotation()) +
      ct * (b.body.angvel() - a.body.angvel());
    a.body.applyTorqueImpulse(moment * dt, true);
    b.body.applyTorqueImpulse(-moment * dt, true);
    joints.push({ ...pair, pointA: p, pointB: q, force, moment });
  }
  return joints;
}

export function flexibleBeamSubsteps(items, dt = 1 / 120) {
  let omega = 0;
  for (const { a, b } of flexibleBeamPairs(items)) {
    const p = properties(a, b);
    const m = 1 / (1 / Math.max(a.body.mass(), 1e-9) + 1 / Math.max(b.body.mass(), 1e-9));
    const i = 1 / (1 / Math.max(a.body.principalInertia(), 1e-9) + 1 / Math.max(b.body.principalInertia(), 1e-9));
    omega = Math.max(omega, Math.sqrt(p.axial / m), Math.sqrt(p.shear / m), Math.sqrt(p.rotation / i));
  }
  return Math.max(1, Math.min(96, Math.ceil(dt * omega / 0.22)));
}
