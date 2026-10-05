import { localAnchor, projectTies } from "./ties.js";
import { decomposePolygon } from "./geometry.js";
import RAPIER from "@dimforge/rapier2d-compat";
import { ElasticBase, baseSystem } from "./elastic-base.js";
export async function initialize() {
  await RAPIER.init();
}
export const DT = 1 / 120;
export function random(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function inferGroup(spec) {
  return ["brick", "corner-stone", "lintel", "load-spreader"].includes(
    spec.role,
  ) || ["rectangle", "square", "triangle"].includes(spec.shape)
    ? "regular"
    : "irregular";
}
// Near-degenerate convex parts (area tiny relative to their longest edge²)
// make Rapier's contact generation panic; drop them while others remain.
export function withoutSlivers(parts) {
  const quality = (v) => {
    let area = 0,
      edge = 0;
    for (let k = 0; k < v.length; k += 2) {
      const n = (k + 2) % v.length;
      area += v[k] * v[n + 1] - v[n] * v[k + 1];
      edge = Math.max(edge, Math.hypot(v[n] - v[k], v[n + 1] - v[k + 1]));
    }
    return Math.abs(area) / 2 / Math.max(edge * edge, 1e-12);
  };
  const kept = parts.filter((v) => quality(v) > 0.005);
  return kept.length ? kept : [parts.reduce((a, b) => (quality(b) > quality(a) ? b : a))];
}
export class Simulation {
  constructor(config = {}) {
    this.config = {
      boundary: "cup",
      friction: 0.45,
      gravity: 9.81,
      thickness: 1,
      materialDensity: 1,
      leftWall: true,
      rightWall: true,
      ...config,
    };
    if (this.config.elasticBase) baseSystem(this.config.elasticBase, this.config.thickness);
    this.world = new RAPIER.World({ x: 0, y: -this.config.gravity });
    this.world.timestep = DT;
    this.world.integrationParameters.switchToStandardPgsSolver();
    // Standard PGS selects an aggressive ERP (0.8). Start gently because
    // traced masonry may contain a whole network of nominally coincident edges.
    this.world.integrationParameters.erp = 0.2;
    this.world.integrationParameters.numSolverIterations = 1;
    this.world.integrationParameters.numInternalPgsIterations = 16;
    this.items = [];
    this.ties = [];
    this.tieBoundaryContacts = new Map();
    this.nextTieId = 1;
    this.walls = [];
    this.contacts = [];
    this.time = 0;
    this.quiet = 0;
    this.nextId = 1;
    this.action = null;
    this.makeWalls();
  }
  makeWalls() {
    const baseState = this.base?.snapshot();
    const oldBaseRange = this.base && [this.base.left, this.base.right, this.base.p.top];
    this.base?.dispose();
    this.base = null;
    for (const c of this.walls) this.world.removeCollider(c, true);
    this.walls = [];
    const wall = (x, y, hx, hy, label) => {
      const c = this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(hx, hy)
          .setTranslation(x, y)
          .setFriction(this.config.friction),
      );
      c.label = label;
      this.walls.push(c);
      return c;
    };
    const {
      left = 1,
      right = 11,
      bottom = 0,
      top = 8,
    } = this.config.bounds || {};
    const width = right - left,
      height = top - bottom;
    if (this.config.elasticBase) {
      this.base = new ElasticBase(this.world, this.config.elasticBase, this.config.thickness, this.config.friction);
      for (const patch of this.base.rigid)
        wall((patch.left + patch.right)/2, this.base.p.top - .2, (patch.right - patch.left)/2, .2, patch.label)
          .setCollisionGroups(0x00010001);
      if (baseState?.length === this.base.n && oldBaseRange?.every((v, i) => v === [this.base.left, this.base.right, this.base.p.top][i])) this.base.restore(baseState);
    } else wall((left + right) / 2, bottom - 0.2, width / 2, 0.2, "Floor");
    if (this.config.boundary === "cup") {
      if (this.config.leftWall)
        wall(left - 0.2, (bottom + top) / 2, 0.2, height / 2, "Left wall");
      if (this.config.rightWall)
        wall(right + 0.2, (bottom + top) / 2, 0.2, height / 2, "Right wall");
    }
    if (this.config.boundary === "supports") {
      if (this.config.leftWall)
        wall(left + width * 0.1, bottom + 1, 0.3, 1, "Left support");
      if (this.config.rightWall)
        wall(right - width * 0.1, bottom + 1, 0.3, 1, "Right support");
    }
  }
  add(spec) {
    const s = { shape: "disk", r: 0.34, angle: 0, load: 0, loadX: 0, ...spec };
    s.group ??= inferGroup(s);
    let desc, parts;
    if (s.shape === "disk") desc = RAPIER.ColliderDesc.ball(s.r);
    else if (s.shape === "square") desc = RAPIER.ColliderDesc.cuboid(s.r, s.r);
    else if (s.shape === "rectangle") {
      s.width ??= s.r * 4;
      s.height ??= s.r * 2;
      s.r = Math.hypot(s.width, s.height) / 2;
      desc = RAPIER.ColliderDesc.cuboid(s.width / 2, s.height / 2);
    } else if (s.shape === "polygon")
      parts = withoutSlivers(decomposePolygon(s.vertices)).map((v) =>
        RAPIER.ColliderDesc.convexHull(new Float32Array(v)),
      );
    else {
      s.vertices = [0, s.r * 1.25, -s.r, -s.r * 0.75, s.r, -s.r * 0.75];
      desc = RAPIER.ColliderDesc.convexHull(new Float32Array(s.vertices));
    }
    const b = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(s.x, s.y)
        .setRotation(s.angle)
        .setCanSleep(false)
        .setCcdEnabled(true),
    );
    const colliders = (parts || [desc]).map((d) =>
      this.world.createCollider(
        d
          .setDensity(this.config.thickness * this.config.materialDensity)
          .setFriction(this.groupFriction(s.group))
          .setRestitution(0),
        b,
      ),
    );
    const item = {
      ...s,
      id:
        Number.isInteger(s.id) && !this.items.some((i) => i.id === s.id)
          ? s.id
          : this.nextId++,
      body: b,
      collider: colliders[0],
      colliders,
      residual: { x: 0, y: 0 },
      torque: 0,
    };
    this.nextId = Math.max(this.nextId, item.id + 1);
    this.items.push(item);
    return item;
  }
  addTie(a, b, p = a?.body.translation(), q = b?.body.translation(), spec) {
    if (!this.items.includes(a) || !this.items.includes(b) || a === b)
      throw Error("Choose two different blocks.");
    if (this.ties.length >= 400) throw Error("Maximum 400 ties.");
    if (
      this.ties.some(
        (t) => (t.a === a && t.b === b) || (t.a === b && t.b === a),
      )
    )
      throw Error("These blocks already have a tie.");
    const anchorA = spec?.anchorA ?? localAnchor(a, p),
      anchorB = spec?.anchorB ?? localAnchor(b, q);
    const length = spec?.length ?? Math.hypot(p.x - q.x, p.y - q.y);
    if (length < 0.001) throw Error("Choose two distinct attachment points.");
    const tie = {
      id: spec?.id ?? this.nextTieId++,
      a,
      b,
      anchorA: { ...anchorA },
      anchorB: { ...anchorB },
      length,
      tension: spec?.tension === true,
      force: { x: 0, y: 0 },
    };
    this.nextTieId = Math.max(this.nextTieId, tie.id + 1);
    this.ties.push(tie);
    this.quiet = 0;
    return tie;
  }
  tieSpecs() {
    return this.ties.map((t) => ({
      id: t.id,
      a: t.a.id,
      b: t.b.id,
      anchorA: { ...t.anchorA },
      anchorB: { ...t.anchorB },
      length: t.length,
      ...(t.tension ? { tension: true } : {}),
    }));
  }
  removeTie(tie) {
    this.ties = this.ties.filter((t) => t !== tie);
    this.quiet = 0;
  }
  tieBoundaryConstraints() {
    const constraints = [];
    const linked = new Set(this.ties.flatMap((t) => [t.a, t.b]));
    const bounds = this.config.bounds ?? {
      left: 1,
      right: 11,
      bottom: 0,
      top: 8,
    };
    for (const item of linked) {
      const p = item.body.translation(),
        angle = item.body.rotation();
      let points;
      if (item.shape === "disk")
        points = [
          { x: p.x, y: p.y - item.r },
          { x: p.x - item.r, y: p.y },
          { x: p.x + item.r, y: p.y },
        ];
      else {
        const w = item.width ?? item.r * 2,
          h = item.height ?? item.r * 2;
        const v = item.vertices ?? [
          -w / 2,
          -h / 2,
          w / 2,
          -h / 2,
          w / 2,
          h / 2,
          -w / 2,
          h / 2,
        ];
        points = Array.from({ length: v.length / 2 }, (_, k) => ({
          x: p.x + v[k * 2] * Math.cos(angle) - v[k * 2 + 1] * Math.sin(angle),
          y: p.y + v[k * 2] * Math.sin(angle) + v[k * 2 + 1] * Math.cos(angle),
        }));
      }
      // One constraint per vertex touching a boundary: a flat face resting on
      // the floor is supported at both ends, instead of only at its lowest
      // corner, which created a spurious moment and rocking jitter. Only the
      // deepest vertex (primary) drives the position correction.
      const touching = (candidates, gap, normal, label) => {
        if (!candidates.length) return;
        const deepest = Math.min(...candidates.map(gap));
        for (const q of candidates)
          if (gap(q) - deepest <= 2e-3)
            constraints.push({
              item,
              point: q,
              normal,
              gap: gap(q),
              label,
              primary: gap(q) === deepest,
            });
      };
      if (!this.base) touching(
        points.filter((q) => q.x >= bounds.left && q.x <= bounds.right),
        (q) => q.y - bounds.bottom,
        { x: 0, y: 1 },
        "Floor",
      );
      else for (const patch of this.base.rigid) touching(
        points.filter((q) => q.x >= patch.left && q.x <= patch.right),
        (q) => q.y - this.base.p.top,
        { x: 0, y: 1 },
        patch.label,
      );
      if (this.config.boundary === "cup") {
        const inside = points.filter(
          (q) => q.y >= bounds.bottom && q.y <= bounds.top,
        );
        if (this.config.leftWall)
          touching(inside, (q) => q.x - bounds.left, { x: 1, y: 0 }, "Left wall");
        if (this.config.rightWall)
          touching(
            inside,
            (q) => bounds.right - q.x,
            { x: -1, y: 0 },
            "Right wall",
          );
      }
    }
    return constraints;
  }
  projectTieBoundaries(velocities = false) {
    for (const c of this.tieBoundaryConstraints()) {
      const body = c.item.body;
      if (!velocities) {
        if (c.primary && c.gap < 0) {
          const p = body.translation();
          body.setTranslation(
            { x: p.x - c.normal.x * c.gap, y: p.y - c.normal.y * c.gap },
            true,
          );
        }
        continue;
      }
      if (c.gap > 1e-5) continue;
      const com = body.worldCom(),
        r = { x: c.point.x - com.x, y: c.point.y - com.y };
      const velocity = () => {
        const v = body.linvel(),
          w = body.angvel();
        return { x: v.x - w * r.y, y: v.y + w * r.x };
      };
      const mass = 1 / body.mass(),
        inertia = 1 / body.principalInertia();
      let v = velocity();
      const vn = v.x * c.normal.x + v.y * c.normal.y;
      if (vn >= 0) continue;
      const fn =
        -vn / (mass + (r.x * c.normal.y - r.y * c.normal.x) ** 2 * inertia);
      body.applyImpulseAtPoint(
        { x: c.normal.x * fn, y: c.normal.y * fn },
        c.point,
        true,
      );
      const tangent = { x: -c.normal.y, y: c.normal.x };
      v = velocity();
      const mu = (this.groupFriction(c.item.group) + this.config.friction) / 2;
      const ft = Math.max(
        -mu * fn,
        Math.min(
          mu * fn,
          -(v.x * tangent.x + v.y * tangent.y) /
            (mass + (r.x * tangent.y - r.y * tangent.x) ** 2 * inertia),
        ),
      );
      body.applyImpulseAtPoint(
        { x: tangent.x * ft, y: tangent.y * ft },
        c.point,
        true,
      );
      const key = c.item.id + ":" + c.label;
      const reaction = this.tieBoundaryContacts.get(key) ?? {
        a: c.item,
        b: null,
        wall: c.label,
        normal: { x: -c.normal.x, y: -c.normal.y },
        point: c.point,
        fn: 0,
        ft: 0,
      };
      const weight = fn / DT;
      const total = reaction.fn + weight;
      reaction.point = {
        x: (reaction.point.x * reaction.fn + c.point.x * weight) / total,
        y: (reaction.point.y * reaction.fn + c.point.y * weight) / total,
      };
      reaction.fn = total;
      reaction.ft += ft / DT;
      this.tieBoundaryContacts.set(key, reaction);
    }
  }
  enforceTies() {
    projectTies(this.ties, {
      velocities: false,
      iterations: 48,
      positionCorrection: () => this.projectTieBoundaries(),
    });
  }
  specs() {
    return this.items.map((i) => ({
      ...Object.fromEntries(
        [
          "shape",
          "r",
          "vertices",
          "id",
          "width",
          "height",
          "load",
          "loadX",
          "color",
          "role",
          "photoId",
          "group",
          "foundationBlock",
        ].map((k) => [k, i[k]]),
      ),
      ...i.body.translation(),
      angle: i.body.rotation(),
    }));
  }
  groupFriction(group) {
    return (
      this.config.groups?.find((g) => g.id === group)?.friction ??
      this.config.friction
    );
  }
  assignGroup(item, group) {
    if (!this.items.includes(item)) return;
    item.group = group;
    for (const c of item.colliders) c.setFriction(this.groupFriction(group));
    this.quiet = 0;
  }
  configure(config) {
    const nextConfig = { ...this.config, ...config };
    if (nextConfig.elasticBase) baseSystem(nextConfig.elasticBase, nextConfig.thickness);
    const oldDensity = this.config.thickness * this.config.materialDensity;
    const oldBounds = JSON.stringify(this.config.bounds);
    const oldBase = JSON.stringify(this.config.elasticBase);
    const oldThickness = this.config.thickness;
    const boundary = ["boundary", "leftWall", "rightWall"].some(
      (k) => config[k] !== undefined && config[k] !== this.config[k],
    );
    Object.assign(this.config, config);
    this.world.gravity.y = -this.config.gravity;
    if (boundary || oldBounds !== JSON.stringify(this.config.bounds) ||
        oldBase !== JSON.stringify(this.config.elasticBase) ||
        (this.base && oldThickness !== this.config.thickness)) {
      this.makeWalls();
      this.contacts = [];
    }
    for (const c of this.walls) c.setFriction(this.config.friction);
    for (const s of this.base?.strips ?? []) s.collider.setFriction(this.config.friction);
    for (const item of this.items)
      for (const c of item.colliders)
        c.setFriction(this.groupFriction(item.group));
    if (oldDensity !== this.config.thickness * this.config.materialDensity)
      for (const i of this.items) {
        for (const c of i.colliders)
          c.setDensity(this.config.thickness * this.config.materialDensity);
        i.body.recomputeMassPropertiesFromColliders();
      }
    this.quiet = 0;
  }
  remove(item) {
    if (!this.items.includes(item)) return;
    this.ties = this.ties.filter((t) => t.a !== item && t.b !== item);
    this.world.removeRigidBody(item.body);
    this.items = this.items.filter((i) => i !== item);
    this.contacts = this.contacts.filter((c) => c.a !== item && c.b !== item);
    this.quiet = 0;
  }
  impulse(deltaV) {
    for (const i of this.items)
      i.body.applyImpulse({ x: i.body.mass() * deltaV, y: 0 }, true);
    this.quiet = 0;
  }
  setLoad(item, force, horizontal = 0) {
    if (
      !this.items.includes(item) ||
      !Number.isFinite(force) ||
      force < 0 ||
      !Number.isFinite(horizontal)
    )
      return;
    item.load = force;
    item.loadX = horizontal;
    this.quiet = 0;
  }
  // Load multiplier pattern: additional forces λ·F_i at each centre of mass.
  // Horizontal patterns use the heights frozen when the action is set.
  setAction(pattern = "none", lambda = 0, direction = 1) {
    if (pattern === "none" || !lambda) {
      this.action = null;
      for (const i of this.items) i.actionForce = { x: 0, y: 0 };
      this.quiet = 0;
      return;
    }
    const forces = actionPattern(
      this.items.map((i) => ({
        mass: i.body.mass(),
        y: i.body.worldCom().y,
        load: i.load,
        loadX: i.loadX,
      })),
      pattern,
      this.config.gravity,
      this.config.bounds?.bottom ?? 0,
    );
    const sign = ["uniform", "triangular"].includes(pattern) ? direction : 1;
    this.items.forEach((i, k) => {
      i.actionForce = {
        x: forces[k].x * lambda * sign,
        y: forces[k].y * lambda,
      };
    });
    this.action = { pattern, lambda, direction };
    this.quiet = 0;
  }
  step() {
    for (const i of this.items) {
      i.body.resetForces(true);
      const fx = i.loadX + (i.actionForce?.x ?? 0),
        fy = -i.load + (i.actionForce?.y ?? 0);
      if (fx || fy) i.body.addForce({ x: fx, y: fy }, true);
    }
    const prev = this.items.map((i) => ({
      v: i.body.linvel(),
      w: i.body.angvel(),
    }));
    for (const tie of this.ties) tie.force = { x: 0, y: 0 };
    this.tieBoundaryContacts.clear();
    const substeps = this.base?.substeps ?? 1;
    const subdt = DT/substeps;
    this.world.timestep = subdt;
    const contactSteps = new Map();
    for (let substep = 0; substep < substeps; substep++) {
      this.base?.apply();
      projectTies(this.ties, {
        positions: true,
        velocities: true,
        dt: subdt,
        positionCorrection: () => this.projectTieBoundaries(),
        velocityCorrection: () => this.projectTieBoundaries(true),
      });
      this.world.step();
      // Only the import/initialization step needs the gentler correction.
      if (this.time === 0) this.world.integrationParameters.erp = 0.8;
      projectTies(this.ties, {
        positions: true,
        velocities: true,
        dt: subdt,
        iterations: 48,
        positionCorrection: () => this.projectTieBoundaries(),
        velocityCorrection: () => this.projectTieBoundaries(true),
      });
      this.readContacts();
      // readContacts divides each impulse by the OUTER timestep; summing
      // substeps gives a mean force, not a substep-count multiple of it.
      for (const c of this.contacts) {
        const previous = contactSteps.get(c.key);
        if (!previous) contactSteps.set(c.key, c);
        else {
          const total = previous.fn + c.fn;
          previous.point = { x: (previous.point.x*previous.fn + c.point.x*c.fn)/total,
            y: (previous.point.y*previous.fn + c.point.y*c.fn)/total };
          previous.fn = total;
          previous.ft += c.ft;
        }
      }
    }
    for (const tie of this.ties) {
      tie.force.x /= substeps;
      tie.force.y /= substeps;
    }
    this.world.timestep = DT;
    this.time += DT;
    let speed = 0;
    for (let k = 0; k < this.items.length; k++) {
      const i = this.items[k],
        v = i.body.linvel();
      i.residual = {
        x: (i.body.mass() * (v.x - prev[k].v.x)) / DT,
        y: (i.body.mass() * (v.y - prev[k].v.y)) / DT,
      };
      i.torque =
        (i.body.principalInertia() * (i.body.angvel() - prev[k].w)) / DT;
      speed = Math.max(
        speed,
        Math.hypot(v.x, v.y),
        Math.abs(i.body.angvel()) * i.r,
      );
    }
    this.contacts = [...contactSteps.values()];
    this.contacts.push(...this.tieBoundaryContacts.values());
    if (this.base) speed = Math.max(speed, this.base.report().speed);
    this.quiet = speed < 0.025 ? this.quiet + DT : 0;
    this.speed = speed;
  }
  readContacts() {
    this.contacts = [];
    const lookup = new Map(
      this.items.flatMap((i) => i.colliders.map((c) => [c.handle, i])),
    );
    const seen = new Set();
    for (const a of this.items)
      for (const collider of a.colliders) {
        this.world.contactPairsWith(collider, (b) => {
          const key = [collider.handle, b.handle]
            .sort((x, y) => x - y)
            .join(":");
          if (seen.has(key)) return;
          seen.add(key);
          this.world.contactPair(collider, b, (m, flipped) => {
            const n = m.normal();
            for (let k = 0; k < m.numContacts(); k++) {
              const fn = m.contactImpulse(k) / DT,
                ft = m.contactTangentImpulse(k) / DT;
              if (fn < 0.001) continue;
              const local = flipped
                ? m.localContactPoint2(k)
                : m.localContactPoint1(k);
              if (!local) continue;
              const p = a.body.translation(),
                ang = a.body.rotation();
              this.contacts.push({
                key: key + ":" + k,
                a,
                b: lookup.get(b.handle) || null,
                wall: b.label || "Boundary",
                point: {
                  x: p.x + local.x * Math.cos(ang) - local.y * Math.sin(ang),
                  y: p.y + local.x * Math.sin(ang) + local.y * Math.cos(ang),
                },
                normal: {
                  x: n.x * (flipped ? -1 : 1),
                  y: n.y * (flipped ? -1 : 1),
                },
                fn,
                ft,
              });
            }
          });
        });
      }
  }
  status(initial) {
    if (!this.items.length) return "Empty scene";
    if (this.time === 0) return "Ready to test";
    const moved = this.items.filter((i) => {
      const start = initial.find((p) => p.id === i.id);
      return (
        start &&
        Math.hypot(
          i.body.translation().x - start.x,
          i.body.translation().y - start.y,
        ) >
          i.r * 2
      );
    }).length;
    const escaped = this.items.some(
      (i) => i.body.translation().y < (this.base?.p.top ?? this.config.bounds?.bottom ?? 0) - 0.6,
    );
    if (escaped || moved > this.items.length * 0.45)
      return this.quiet > 0.8
        ? "Collapse → settled"
        : "Collapse / large displacements";
    if (this.quiet > 0.8) {
      const balanced = this.items.every(
        (i) =>
          Math.hypot(i.residual.x, i.residual.y) <
            Math.max(0.01, i.body.mass() * this.config.gravity * 0.03) &&
          Math.abs(i.torque) <
            Math.max(0.005, i.body.mass() * this.config.gravity * i.r * 0.03),
      );
      if (balanced)
        return moved ? "Stable after settling" : "Equilibrium reached";
    }
    return "In motion";
  }
  dispose() {
    this.world.free();
  }
}
// Unit (λ = 1) force pattern per block. "uniform": F = m g (horizontal,
// α0-type seismic coefficient). "triangular": F = m g z ΣW / Σ(W z), the
// inverse-triangular first-mode distribution with the same base shear.
// "gravity": additional self-weight. "loads": applied block loads.
export function actionPattern(blocks, pattern, gravity, base = 0) {
  if (pattern === "uniform")
    return blocks.map((b) => ({ x: b.mass * gravity, y: 0 }));
  if (pattern === "triangular") {
    const z = blocks.map((b) => Math.max(0, b.y - base)),
      total = blocks.reduce((s, b) => s + b.mass, 0),
      moment = blocks.reduce((s, b, k) => s + b.mass * z[k], 0);
    return blocks.map((b, k) => ({
      x: moment > 0 ? (b.mass * gravity * z[k] * total) / moment : 0,
      y: 0,
    }));
  }
  if (pattern === "gravity")
    return blocks.map((b) => ({ x: 0, y: -b.mass * gravity }));
  if (pattern === "loads")
    return blocks.map((b) => ({ x: b.loadX || 0, y: -(b.load || 0) }));
  return blocks.map(() => ({ x: 0, y: 0 }));
}
export function generate(seed, count, shape = "disk") {
  const rand = random(seed);
  const out = [];
  for (let k = 0; k < count; k++) {
    const r = 0.25 + rand() * 0.12,
      col = k % 11,
      row = Math.floor(k / 11);
    out.push({
      x: 1.5 + col * 0.9 + (rand() - 0.5) * 0.06,
      y: 0.55 + row * 1.0,
      r,
      ...(shape === "rectangle" ? { width: 0.65, height: 0.45 } : {}),
      shape:
        shape === "mixed"
          ? ["disk", "square", "triangle"][Math.floor(rand() * 3)]
          : shape,
      angle: shape === "disk" ? 0 : (rand() - 0.5) * 0.45,
    });
  }
  return out;
}
export function connectedContacts(contacts, selected) {
  if (!selected) return new Set();
  const visited = new Set([selected]);
  let change = true;
  while (change) {
    change = false;
    for (const c of contacts) {
      if (c.b && (visited.has(c.a) || visited.has(c.b))) {
        if (!visited.has(c.a) || !visited.has(c.b)) change = true;
        visited.add(c.a);
        visited.add(c.b);
      }
    }
  }
  return new Set(contacts.filter((c) => visited.has(c.a)));
}

export function cornerStones() {
  const out = [];
  for (const side of ["left", "right"])
    for (let row = 0; row < 7; row++) {
      const width = row % 2 === 0 ? 1.6 : 0.95,
        height = 0.65;
      out.push({
        shape: "rectangle",
        width,
        height,
        r: Math.hypot(width, height) / 2,
        x: side === "left" ? 1.02 + width / 2 : 10.98 - width / 2,
        y: height / 2 + row * (height + 0.025),
        angle: 0,
      });
    }
  return out;
}
