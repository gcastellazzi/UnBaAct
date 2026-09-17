import { random } from "./physics.js";
export function outline(spec) {
  const a = spec.angle || 0,
    c = Math.cos(a),
    s = Math.sin(a);
  let v;
  if (spec.shape === "disk")
    v = Array.from({ length: 32 }, (_, k) => [
      spec.r * Math.cos((k * Math.PI) / 16),
      spec.r * Math.sin((k * Math.PI) / 16),
    ]).flat();
  else if (spec.vertices) v = spec.vertices;
  else {
    const w = spec.width ?? spec.r * 2,
      h = spec.height ?? spec.r * 2;
    v = [-w / 2, -h / 2, w / 2, -h / 2, w / 2, h / 2, -w / 2, h / 2];
  }
  return Array.from({ length: v.length / 2 }, (_, k) => ({
    x: spec.x + v[k * 2] * c - v[k * 2 + 1] * s,
    y: spec.y + v[k * 2] * s + v[k * 2 + 1] * c,
  }));
}
function project(p, a, b) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    t = Math.max(
      0,
      Math.min(
        1,
        ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1),
      ),
    );
  return { x: a.x + t * dx, y: a.y + t * dy };
}
export function clearance(p, poly) {
  let inside = false,
    min = Infinity;
  for (let k = 0, j = poly.length - 1; k < poly.length; j = k++) {
    const a = poly[k],
      b = poly[j];
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
    const q = project(p, a, b);
    min = Math.min(min, Math.hypot(p.x - q.x, p.y - q.y));
  }
  return inside ? -min : min;
}
export function generateJointFillers(specs, kind, seed = 42, limit = 40) {
  const rand = random(seed),
    polys = specs.map(outline),
    candidates = [],
    added = [];
  const min = kind === "imperfection" ? 0.001 : 0.003,
    max = kind === "imperfection" ? 0.025 : 0.12;
  const boxes = polys.map((poly) => ({
    left: Math.min(...poly.map((p) => p.x)),
    right: Math.max(...poly.map((p) => p.x)),
    bottom: Math.min(...poly.map((p) => p.y)),
    top: Math.max(...poly.map((p) => p.y)),
  }));
  const boxDistance = (p, b) =>
    Math.hypot(
      Math.max(b.left - p.x, 0, p.x - b.right),
      Math.max(b.bottom - p.y, 0, p.y - b.top),
    );
  for (let i = 0; i < polys.length; i++) {
    if (["imperfection", "sneck"].includes(specs[i].role)) continue;
    const poly = polys[i];
    for (let k = 0; k < poly.length; k++) {
      const a = poly[k],
        b = poly[(k + 1) % poly.length];
      for (const t of [0, rand(), rand()]) {
        const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        for (let j = i + 1; j < polys.length; j++) {
          if (boxDistance(p, boxes[j]) > max * 2) continue;
          let best = null,
            d = Infinity;
          const other = polys[j];
          for (let e = 0; e < other.length; e++) {
            const q = project(p, other[e], other[(e + 1) % other.length]),
              distance = Math.hypot(q.x - p.x, q.y - p.y);
            if (distance < d) {
              d = distance;
              best = q;
            }
          }
          if (d >= min * 2 && d <= max * 2)
            candidates.push({ x: (p.x + best.x) / 2, y: (p.y + best.y) / 2 });
        }
      }
      if (kind === "sneck")
        for (let n = 0; n < 8; n++) {
          const ang = rand() * Math.PI * 2,
            r = 0.005 + rand() * 0.18;
          candidates.push({
            x: a.x + Math.cos(ang) * r,
            y: a.y + Math.sin(ang) * r,
          });
        }
    }
  }
  // Randomised but repeatable insertion order, independent of vertex order.
  for (let k = candidates.length - 1; k > 0; k--) {
    const j = Math.floor(rand() * (k + 1));
    [candidates[k], candidates[j]] = [candidates[j], candidates[k]];
  }
  for (const p of candidates) {
    if (added.length >= limit) break;
    const distances = polys
      .map((poly, k) =>
        boxDistance(p, boxes[k]) > max * 4
          ? Infinity
          : specs[k].shape === "disk"
            ? Math.hypot(p.x - specs[k].x, p.y - specs[k].y) - specs[k].r
            : clearance(p, poly),
      )
      .sort((a, b) => a - b);
    const r = Math.min(max, distances[0] * 0.94);
    if (
      r < min ||
      distances[1] > r * 2.5 ||
      added.some((s) => Math.hypot(s.x - p.x, s.y - p.y) < s.r + r + 0.002)
    )
      continue;
    if (kind === "imperfection")
      added.push({
        ...p,
        r,
        shape: "disk",
        angle: 0,
        role: kind,
        color: "#9b654c",
        group: "irregular",
      });
    else {
      const angle = rand() * Math.PI * 2;
      const v = Array.from({ length: 5 }, (_, k) => {
        const a = angle + (k * Math.PI * 2) / 5;
        return [Math.cos(a) * r, Math.sin(a) * r * (k % 2 ? 0.5 : 0.8)];
      }).flat();
      added.push({
        ...p,
        r,
        vertices: v,
        shape: "polygon",
        angle: 0,
        role: "sneck",
        color: "#d6c39c",
        group: "irregular",
      });
    }
  }
  return added;
}
