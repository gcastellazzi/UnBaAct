// Mesh geometry adapted from aLoTiA. Copyright (c) 2026 Giovanni Castellazzi.
// MIT license: see alotia-LICENSE.txt. Only triangulation and volume checks are reused.
function det3(a, b, c) {
  return a[0] * (b[1] * c[2] - b[2] * c[1])
    - a[1] * (b[0] * c[2] - b[2] * c[0])
    + a[2] * (b[0] * c[1] - b[1] * c[0]);
}

function tetVolume(a, b, c, d) {
  return det3(
    [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
    [c[0] - a[0], c[1] - a[1], c[2] - a[2]],
    [d[0] - a[0], d[1] - a[1], d[2] - a[2]],
  ) / 6;
}


function bestTriangulation(pts) {
  const n = pts.length;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const shape = (a, b, c) => {
    const s = (p, q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;
    const sum = s(a, b) + s(b, c) + s(c, a);
    return sum > 0 ? (2 * Math.sqrt(3) * cross(a, b, c)) / sum : 0;
  };
  const properCross = (p1, p2, p3, p4) => {
    const d1 = cross(p3, p4, p1);
    const d2 = cross(p3, p4, p2);
    const d3 = cross(p1, p2, p3);
    const d4 = cross(p1, p2, p4);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0))
      && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  };
  const inside = (p) => {
    let c = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const a = pts[i];
      const b = pts[j];
      if ((a[1] > p[1]) !== (b[1] > p[1])
        && p[0] < a[0] + ((p[1] - a[1]) * (b[0] - a[0])) / (b[1] - a[1])) c = !c;
    }
    return c;
  };
  const ok = Array.from({ length: n }, () => new Array(n).fill(false));
  for (let i = 0; i < n; i++) {
    ok[i][(i + 1) % n] = true;
    ok[(i + 1) % n][i] = true;
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const a = pts[i];
      const b = pts[j];
      let valid = inside([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
      for (let k = 0; valid && k < n; k++) {
        const k1 = (k + 1) % n;
        if (k === i || k === j || k1 === i || k1 === j) continue;
        if (properCross(a, b, pts[k], pts[k1])) valid = false;
      }
      // A diagonal through another vertex splits nothing cleanly.
      for (let k = 0; valid && k < n; k++) {
        if (k === i || k === j) continue;
        const p = pts[k];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const along = ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / (len * len);
        if (along > 0 && along < 1 && Math.abs(cross(a, b, p)) / len <= len * 1e-12) valid = false;
      }
      ok[i][j] = valid;
      ok[j][i] = valid;
    }
  }
  const score = Array.from({ length: n }, () => new Array(n).fill(-Infinity));
  const pick = Array.from({ length: n }, () => new Array(n).fill(-1));
  for (let i = 0; i + 1 < n; i++) score[i][i + 1] = Infinity;
  for (let gap = 2; gap < n; gap++) {
    for (let i = 0; i + gap < n; i++) {
      const j = i + gap;
      if (!ok[i][j]) continue;
      for (let k = i + 1; k < j; k++) {
        if (!ok[i][k] || !ok[k][j]) continue;
        if (score[i][k] === -Infinity || score[k][j] === -Infinity) continue;
        if (cross(pts[i], pts[k], pts[j]) <= 0) continue;
        const s = Math.min(score[i][k], score[k][j], shape(pts[i], pts[k], pts[j]));
        if (s > score[i][j]) { score[i][j] = s; pick[i][j] = k; }
      }
    }
  }
  if (pick[0][n - 1] < 0) return null;
  const out = [];
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [i, j] = stack.pop();
    if (j - i < 2) continue;
    const k = pick[i][j];
    out.push([i, k, j]);
    stack.push([i, k], [k, j]);
  }
  return out;
}

/**
 * Triangulating a voussoir outline, including the concave ones.
 *
 * THE BUG THIS REPLACES. The outline used to be triangulated as a fan from its
 * first vertex: triangles (0, i, i+1) for every i. A fan is correct only for a
 * CONVEX polygon. A voussoir cut radially from a traced profile is frequently
 * not convex --- a re-entrant corner is enough --- and for those the fan
 * produces triangles that lie partly outside the outline and, worse, some that
 * are wound the other way. Extruded, an inverted triangle becomes a wedge of
 * NEGATIVE volume, which is what Abaqus refuses with
 * "The volume of N elements is zero, small, or negative".
 *
 * The old code took the absolute value of each triangle's area, so the total
 * volume it reported came out plausible while the elements it wrote were
 * unusable. Taking the modulus of a signed quantity is how the fault stayed
 * invisible: the sign was the evidence.
 *
 * Ear clipping is correct for any simple polygon and costs nothing at these
 * sizes --- a voussoir has tens of vertices, not thousands.
 *
 * @param {number[][]} pts  the outline, counter-clockwise, without a repeat
 * @returns {number[][]} triples of indices into `pts`
 */
export function earClip(pts) {
  const n = pts.length;
  if (n < 3) return [];
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1])
    - (a[1] - o[1]) * (b[0] - o[0]);
  const optimal = n <= 80 ? bestTriangulation(pts) : null;
  if (optimal) return optimal;

  const inTriangle = (p, a, b, c) => {
    const d1 = cross(a, b, p);
    const d2 = cross(b, c, p);
    const d3 = cross(c, a, p);
    const neg = (d1 < 0) || (d2 < 0) || (d3 < 0);
    const pos = (d1 > 0) || (d2 > 0) || (d3 > 0);
    return !(neg && pos);
  };

  // 1 for an equilateral triangle, 0 for a degenerate one.
  const shape = (a, b, c) => {
    const s = (p, q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;
    const sum = s(a, b) + s(b, c) + s(c, a);
    return sum > 0 ? (2 * Math.sqrt(3) * cross(a, b, c)) / sum : 0;
  };

  const idx = [...Array(n).keys()];
  const out = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < 4 * n) {
    // THE BEST EAR, NOT THE FIRST. Clipping the first valid ear on an outline
    // with many vertices along a gently curved face cuts a fan of needles off
    // one long edge; extruded through the barrel, a needle is the element
    // Abaqus rejects as of zero or small volume.
    let best = null;
    for (let k = 0; k < idx.length; k++) {
      const i0 = idx[(k + idx.length - 1) % idx.length];
      const i1 = idx[k];
      const i2 = idx[(k + 1) % idx.length];
      const a = pts[i0];
      const b = pts[i1];
      const c = pts[i2];
      if (cross(a, b, c) <= 0) continue;            // reflex or degenerate
      let clear = true;
      for (const j of idx) {
        if (j === i0 || j === i1 || j === i2) continue;
        if (inTriangle(pts[j], a, b, c)) { clear = false; break; }
      }
      if (!clear) continue;
      const q = shape(a, b, c);
      if (!best || q > best.q) best = { k, q, tri: [i0, i1, i2] };
    }
    const clipped = !!best;
    if (best) {
      out.push(best.tri);
      idx.splice(best.k, 1);
    }
    // A self-intersecting or otherwise unclippable outline: fall back to the
    // fan for what is left rather than looping, and let the volume check
    // downstream reject anything it produces that is not usable.
    if (!clipped) break;
  }
  if (idx.length >= 3) {
    for (let i = 1; i + 1 < idx.length; i++) {
      out.push([idx[0], idx[i], idx[i + 1]]);
    }
  }
  return out;
}

/**
 * The signed volume of a C3D6 wedge, as Abaqus will compute it.
 *
 * A prism 1-2-3 / 4-5-6 splits into three tetrahedra. If the sum is negative
 * the element is inside out and the two triangular faces must be exchanged;
 * if it is nearly zero the element is degenerate and must not be written at
 * all. Checking this here rather than trusting the construction is the point:
 * the previous code trusted it and was wrong.
 */
export function wedgeVolume(p) {
  const [a, b, c, d, e, f] = p;
  return tetVolume(a, b, c, d) + tetVolume(b, c, d, e) + tetVolume(c, d, e, f);
}


export function hexVolume(p) {
  const t = (a, b, c, d) => tetVolume(p[a], p[b], p[c], p[d]);
  return t(0, 1, 2, 6) + t(0, 2, 3, 6) + t(0, 3, 7, 6)
    + t(0, 7, 4, 6) + t(0, 4, 5, 6) + t(0, 5, 1, 6);
}


export function hexCornerJacobian(p) {
  const corners = [
    [0, 1, 3, 4], [1, 2, 0, 5], [2, 3, 1, 6], [3, 0, 2, 7],
    [4, 7, 5, 0], [5, 4, 6, 1], [6, 5, 7, 2], [7, 6, 4, 3],
  ];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  let worst = Infinity;
  for (const [o, x, y, z] of corners) {
    worst = Math.min(worst, det3(sub(p[x], p[o]), sub(p[y], p[o]), sub(p[z], p[o])));
  }
  return worst;
}


