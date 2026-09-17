import { decomposePolygon } from "./geometry.js";
import RAPIER from "@dimforge/rapier2d-compat";
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
  return ["brick", "corner-stone", "lintel"].includes(spec.role) ||
    ["rectangle", "square", "triangle"].includes(spec.shape)
    ? "regular"
    : "irregular";
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
    this.world = new RAPIER.World({ x: 0, y: -this.config.gravity });
    this.world.timestep = DT;
    this.world.integrationParameters.switchToStandardPgsSolver();
    this.world.integrationParameters.numSolverIterations = 1;
    this.world.integrationParameters.numInternalPgsIterations = 16;
    this.items = [];
    this.walls = [];
    this.contacts = [];
    this.time = 0;
    this.quiet = 0;
    this.nextId = 1;
    this.makeWalls();
  }
  makeWalls() {
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
    };
    const {
      left = 1,
      right = 11,
      bottom = 0,
      top = 8,
    } = this.config.bounds || {};
    const width = right - left,
      height = top - bottom;
    wall((left + right) / 2, bottom - 0.2, width / 2, 0.2, "Floor");
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
    const s = { shape: "disk", r: 0.34, angle: 0, load: 0, ...spec };
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
      parts = decomposePolygon(s.vertices).map((v) =>
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
          "color",
          "role",
          "photoId",
          "group",
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
    const oldDensity = this.config.thickness * this.config.materialDensity;
    const oldBounds = JSON.stringify(this.config.bounds);
    const boundary = ["boundary", "leftWall", "rightWall"].some(
      (k) => config[k] !== undefined && config[k] !== this.config[k],
    );
    Object.assign(this.config, config);
    this.world.gravity.y = -this.config.gravity;
    if (boundary || oldBounds !== JSON.stringify(this.config.bounds)) {
      this.makeWalls();
      this.contacts = [];
    }
    for (const c of this.walls) c.setFriction(this.config.friction);
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
  setLoad(item, force) {
    if (!this.items.includes(item) || !Number.isFinite(force) || force < 0)
      return;
    item.load = force;
    this.quiet = 0;
  }
  step() {
    for (const i of this.items) {
      i.body.resetForces(true);
      if (i.load) i.body.addForce({ x: 0, y: -i.load }, true);
    }
    const prev = this.items.map((i) => ({
      v: i.body.linvel(),
      w: i.body.angvel(),
    }));
    this.world.step();
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
    this.readContacts();
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
      (i) => i.body.translation().y < (this.config.bounds?.bottom || 0) - 0.6,
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
