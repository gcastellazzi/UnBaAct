import { test } from "node:test";
import assert from "node:assert/strict";
import { detectStones, traceContour } from "../src/stone-detect.js";
import { validateContour, polygonArea } from "../src/geometry.js";

function wall(w, h, rects, stone = 200, joint = 60) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let k = 0; k < w * h; k++) {
    const x = k % w,
      y = Math.floor(k / w),
      inside = rects.some(
        ([x0, y0, x1, y1]) => x >= x0 && x < x1 && y >= y0 && y < y1,
      );
    // Mild texture so the threshold is not evaluated on flat values only.
    const v = (inside ? stone : joint) + ((x * 7 + y * 13) % 9) - 4;
    data.set([v, v, v, 255], k * 4);
  }
  return { data, width: w, height: h };
}

test("contour tracing follows a filled square", () => {
  const w = 10,
    labels = new Int32Array(100);
  for (let y = 2; y < 6; y++) for (let x = 3; x < 7; x++) labels[y * w + x] = 1;
  const c = traceContour(labels, w, 10, 1, 2 * w + 3);
  assert.equal(c.length, 12);
});

test("detects separate stones of a coursed wall with dark joints", () => {
  const rects = [
    [4, 4, 60, 36],
    [64, 4, 116, 36],
    [4, 40, 40, 76],
    [44, 40, 116, 76],
  ];
  const stones = detectStones(wall(120, 80, rects), {
    separation: 1,
    simplify: 1,
  });
  assert.equal(stones.length, 4);
  for (const s of stones) {
    validateContour(s.points);
    assert.ok(s.points.length <= 48);
  }
  const areas = stones.map((s) => Math.abs(polygonArea(s.points))).sort((a, b) => b - a);
  assert.ok(Math.abs(areas[0] - 72 * 36) / (72 * 36) < 0.1, `area ${areas[0]}`);
});

test("erosion separates stones joined by a thin bridge and light joints invert", () => {
  const rects = [
    [4, 4, 40, 40],
    [44, 4, 80, 40],
    [40, 19, 44, 22],
  ];
  assert.equal(
    detectStones(wall(160, 80, rects), { separation: 0 }).length,
    1,
  );
  assert.equal(
    detectStones(wall(160, 80, rects), { separation: 2 }).length,
    2,
  );
  assert.equal(
    detectStones(wall(160, 80, rects, 60, 200), {
      separation: 2,
      jointsDark: false,
    }).length,
    2,
  );
});

test("closing joints grows neighbouring stones until they meet", () => {
  const rects = [
    [4, 4, 60, 36],
    [68, 4, 116, 36],
  ];
  const open = detectStones(wall(120, 40, rects), { separation: 1 }),
    closed = detectStones(wall(120, 40, rects), {
      separation: 1,
      fillJoints: 6,
    });
  assert.equal(closed.length, 2);
  const right = (s) => Math.max(...s.points.map((p) => p.x)),
    left = (s) => Math.min(...s.points.map((p) => p.x));
  const gap = (list) => {
    const [a, b] = [...list].sort((p, q) => left(p) - left(q));
    return left(b) - right(a);
  };
  assert.ok(gap(open) > 6, `open gap ${gap(open)}`);
  assert.ok(gap(closed) < 3, `closed gap ${gap(closed)}`);
});
