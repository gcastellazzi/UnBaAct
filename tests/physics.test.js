import { test, before } from "node:test";
import assert from "node:assert/strict";
import {
  initialize,
  Simulation,
  generate,
  connectedContacts,
} from "../src/physics.js";
before(initialize);
test("reproducible generation and valid shapes", () => {
  assert.deepEqual(generate(42, 55, "mixed"), generate(42, 55, "mixed"));
  assert.notDeepEqual(generate(42, 55), generate(43, 55));
});
test("disk on floor: reaction equals weight and equilibrium", () => {
  const s = new Simulation({ boundary: "free" });
  try {
    const i = s.add({ x: 6, y: 1, r: 0.4 });
    const initial = s.specs();
    for (let k = 0; k < 1200; k++) s.step();
    assert.ok(Math.abs(i.body.translation().y - 0.4) < 0.02);
    assert.ok(s.contacts.length);
    const total = s.contacts.reduce((v, c) => v + c.fn, 0);
    assert.ok(
      Math.abs(total - i.body.mass() * 9.81) < 0.02,
      `reaction ${total}, weight ${i.body.mass() * 9.81}`,
    );
    assert.ok(Math.hypot(i.residual.x, i.residual.y) < 0.01);
    assert.match(s.status(initial), /Equilibrium|Stable/);
  } finally {
    s.dispose();
  }
});
test("free fall and zero gravity", () => {
  const s = new Simulation({ gravity: 0 });
  try {
    const i = s.add({ x: 6, y: 5 });
    s.step();
    assert.equal(i.body.translation().y, 5);
    s.configure({ gravity: 9.81 });
    for (let k = 0; k < 12; k++) s.step();
    assert.ok(i.body.translation().y < 5);
    assert.ok(i.residual.y < 0);
  } finally {
    s.dispose();
  }
});
test("connected network includes boundaries and excludes separate components", () => {
  const a = {},
    b = {},
    c = {};
  const ab = { a, b },
    wall = { a: b, b: null },
    other = { a: c, b: null };
  assert.deepEqual([...connectedContacts([ab, wall, other], a)], [ab, wall]);
});
test("piles and polygons retain finite values", () => {
  const s = new Simulation();
  try {
    generate(42, 33, "mixed").forEach((p) => s.add(p));
    for (let k = 0; k < 600; k++) s.step();
    for (const i of s.items) {
      assert.ok(Number.isFinite(i.body.translation().y));
      assert.ok(Number.isFinite(i.torque));
    }
    assert.ok(s.contacts.length > 15);
  } finally {
    s.dispose();
  }
});

test("independent walls and block removal", () => {
  const s = new Simulation();
  try {
    const a = s.add({ x: 6, y: 1 }),
      b = s.add({ x: 6, y: 2 });
    s.configure({ rightWall: false });
    assert.deepEqual(
      s.walls.map((w) => w.label),
      ["Floor", "Left wall"],
    );
    s.configure({ leftWall: false });
    assert.equal(s.walls.length, 1);
    s.remove(a);
    assert.deepEqual(s.items, [b]);
    for (let k = 0; k < 20; k++) s.step();
    assert.ok(s.contacts.every((c) => c.a !== a && c.b !== a));
  } finally {
    s.dispose();
  }
});
test("shake: same velocity change for different masses", () => {
  const s = new Simulation({ gravity: 0 });
  try {
    const a = s.add({ x: 4, y: 4, r: 0.2 }),
      b = s.add({ x: 7, y: 4, r: 0.5 });
    s.impulse(0.3);
    assert.ok(Math.abs(a.body.linvel().x - 0.3) < 1e-6);
    assert.ok(Math.abs(b.body.linvel().x - 0.3) < 1e-6);
    s.impulse(-0.3);
    assert.ok(Math.abs(a.body.linvel().x) < 1e-6);
  } finally {
    s.dispose();
  }
});
test("vertical load: reaction equals weight plus load, then removal", () => {
  const s = new Simulation({ boundary: "free" });
  try {
    const a = s.add({
      shape: "rectangle",
      width: 1.6,
      height: 0.65,
      x: 6,
      y: 0.325,
    });
    s.setLoad(a, 5);
    for (let k = 0; k < 800; k++) s.step();
    let reaction = s.contacts.reduce((sum, c) => sum + c.fn, 0);
    assert.ok(Math.abs(reaction - (a.body.mass() * 9.81 + 5)) < 0.03);
    assert.equal(s.specs()[0].load, 5);
    s.setLoad(a, 0);
    for (let k = 0; k < 300; k++) s.step();
    reaction = s.contacts.reduce((sum, c) => sum + c.fn, 0);
    assert.ok(Math.abs(reaction - a.body.mass() * 9.81) < 0.03);
  } finally {
    s.dispose();
  }
});

test("group friction updates all colliders and survives spec roundtrip", () => {
  const s = new Simulation({
    friction: 0.3,
    groups: [
      { id: "regular", friction: 0.7 },
      { id: "irregular", friction: 0.1 },
      { id: "custom", friction: 0.9 },
    ],
  });
  try {
    const brick = s.add({
      shape: "rectangle",
      width: 1,
      height: 0.5,
      x: 3,
      y: 2,
    });
    const stone = s.add({
      shape: "polygon",
      vertices: [-0.5, -0.5, 0.5, -0.5, 0.5, 0, 0, 0, 0, 0.5, -0.5, 0.5],
      x: 6,
      y: 2,
    });
    assert.equal(brick.group, "regular");
    assert.equal(stone.group, "irregular");
    assert.ok(Math.abs(brick.collider.friction() - 0.7) < 1e-6);
    assert.ok(
      stone.colliders.every((c) => Math.abs(c.friction() - 0.1) < 1e-6),
    );
    s.assignGroup(stone, "custom");
    assert.ok(
      stone.colliders.every((c) => Math.abs(c.friction() - 0.9) < 1e-6),
    );
    s.configure({
      groups: [
        { id: "regular", friction: 0 },
        { id: "custom", friction: 0.2 },
      ],
    });
    assert.equal(brick.collider.friction(), 0);
    assert.ok(
      stone.colliders.every((c) => Math.abs(c.friction() - 0.2) < 1e-6),
    );
    assert.equal(s.specs().find((i) => i.id === stone.id).group, "custom");
    assert.ok(s.walls.every((c) => Math.abs(c.friction() - 0.3) < 1e-6));
  } finally {
    s.dispose();
  }
});
