export function localAnchor(item, p) {
  const q = item.body.translation(),
    a = -item.body.rotation(),
    x = p.x - q.x,
    y = p.y - q.y;
  return {
    x: x * Math.cos(a) - y * Math.sin(a),
    y: x * Math.sin(a) + y * Math.cos(a),
  };
}
export function worldAnchor(item, p) {
  const q = item.body.translation(),
    a = item.body.rotation();
  return {
    x: q.x + p.x * Math.cos(a) - p.y * Math.sin(a),
    y: q.y + p.x * Math.sin(a) + p.y * Math.cos(a),
  };
}
const cross = (a, b) => a.x * b.y - a.y * b.x;
function data(tie) {
  const p = worldAnchor(tie.a, tie.anchorA),
    q = worldAnchor(tie.b, tie.anchorB),
    dx = q.x - p.x,
    dy = q.y - p.y,
    d = Math.hypot(dx, dy);
  const n = d > 1e-9 ? { x: dx / d, y: dy / d } : { x: 1, y: 0 };
  const ca = tie.a.body.worldCom(),
    cb = tie.b.body.worldCom();
  const ra = { x: p.x - ca.x, y: p.y - ca.y },
    rb = { x: q.x - cb.x, y: q.y - cb.y };
  const ma = 1 / tie.a.body.mass(),
    mb = 1 / tie.b.body.mass(),
    ia = 1 / tie.a.body.principalInertia(),
    ib = 1 / tie.b.body.principalInertia();
  return {
    p,
    q,
    n,
    d,
    ra,
    rb,
    ma,
    mb,
    ia,
    ib,
    w: ma + mb + cross(ra, n) ** 2 * ia + cross(rb, n) ** 2 * ib,
  };
}
function shift(item, impulse, rotation) {
  const body = item.body,
    before = body.worldCom(),
    angle = body.rotation() + rotation,
    local = body.localCom();
  const com = {
    x: before.x + impulse.x / body.mass(),
    y: before.y + impulse.y / body.mass(),
  };
  body.setRotation(angle, true);
  body.setTranslation(
    {
      x: com.x - local.x * Math.cos(angle) + local.y * Math.sin(angle),
      y: com.y - local.x * Math.sin(angle) - local.y * Math.cos(angle),
    },
    true,
  );
}
// Bilateral mass/inertia-weighted distance constraints. The projection adds
// no rod mass, collider, gravity or rotational lock to the existing bodies.
export function projectTies(
  ties,
  {
    positions = true,
    velocities = true,
    dt = 1 / 120,
    iterations = 16,
    positionCorrection = () => {},
    velocityCorrection = () => {},
  } = {},
) {
  if (!ties.length) return;
  if (positions)
    for (let k = 0; k < iterations; k++) {
      for (const tie of ties) {
        const t = data(tie),
          lambda = -(t.d - tie.length) / t.w;
        if (Math.abs(t.d - tie.length) < 1e-7) continue;
        shift(
          tie.a,
          { x: -t.n.x * lambda, y: -t.n.y * lambda },
          -cross(t.ra, t.n) * lambda * t.ia,
        );
        shift(
          tie.b,
          { x: t.n.x * lambda, y: t.n.y * lambda },
          cross(t.rb, t.n) * lambda * t.ib,
        );
      }
      positionCorrection();
    }
  if (velocities)
    for (let k = 0; k < iterations; k++) {
      for (const tie of ties) {
        const t = data(tie),
          va = tie.a.body.linvel(),
          vb = tie.b.body.linvel(),
          wa = tie.a.body.angvel(),
          wb = tie.b.body.angvel();
        const relative =
          (vb.x - wb * t.rb.y - va.x + wa * t.ra.y) * t.n.x +
          (vb.y + wb * t.rb.x - va.y - wa * t.ra.x) * t.n.y;
        const lambda = -relative / t.w;
        const impulse = { x: t.n.x * lambda, y: t.n.y * lambda };
        tie.a.body.applyImpulseAtPoint(
          { x: -impulse.x, y: -impulse.y },
          t.p,
          true,
        );
        tie.b.body.applyImpulseAtPoint(impulse, t.q, true);
        tie.force.x += impulse.x / dt;
        tie.force.y += impulse.y / dt;
      }
      velocityCorrection();
    }
}
export function validateTieSpecs(ties, particles) {
  if (!Array.isArray(ties) || ties.length > 400)
    throw Error("Invalid tie list");
  if (
    ties.length &&
    (particles.some((p) => !Number.isInteger(p.id)) ||
      new Set(particles.map((p) => p.id)).size !== particles.length)
  )
    throw Error("Ties require unique block IDs");
  const radius = (p) =>
    Math.max(
      p.r,
      p.shape === "square"
        ? Math.SQRT2 * p.r
        : p.shape === "triangle"
          ? 1.25 * p.r
          : 0,
      ...(p.vertices
        ? Array.from({ length: p.vertices.length / 2 }, (_, k) =>
            Math.hypot(p.vertices[k * 2], p.vertices[k * 2 + 1]),
          )
        : []),
    );
  const pairs = new Set(),
    ids = new Set();
  for (const t of ties) {
    const a = particles.find((p) => p.id === t.a),
      b = particles.find((p) => p.id === t.b);
    const key = [t.a, t.b].sort((a, b) => a - b).join(":");
    if (
      !a ||
      !b ||
      a === b ||
      pairs.has(key) ||
      !Number.isInteger(t.id) ||
      t.id < 1 ||
      ids.has(t.id) ||
      !Number.isFinite(t.length) ||
      t.length < 0.001 ||
      t.length > 300 ||
      ![t.anchorA, t.anchorB].every(
        (p) =>
          p &&
          [p.x, p.y].every((v) => Number.isFinite(v) && Math.abs(v) <= 100),
      ) ||
      Math.hypot(t.anchorA.x, t.anchorA.y) > radius(a) + 0.001 ||
      Math.hypot(t.anchorB.x, t.anchorB.y) > radius(b) + 0.001
    )
      throw Error("Invalid tie endpoints or length");
    pairs.add(key);
    ids.add(t.id);
  }
}
