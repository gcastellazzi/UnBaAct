const EPS = 1e-9;
const cross = (a, b, c) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
function onSegment(a, b, p) {
  return (
    Math.abs(cross(a, b, p)) < EPS &&
    p.x >= Math.min(a.x, b.x) - EPS &&
    p.x <= Math.max(a.x, b.x) + EPS &&
    p.y >= Math.min(a.y, b.y) - EPS &&
    p.y <= Math.max(a.y, b.y) + EPS
  );
}
function intersects(a, b, c, d) {
  const ab1 = cross(a, b, c),
    ab2 = cross(a, b, d),
    cd1 = cross(c, d, a),
    cd2 = cross(c, d, b);
  return (
    (ab1 * ab2 < -EPS && cd1 * cd2 < -EPS) ||
    onSegment(a, b, c) ||
    onSegment(a, b, d) ||
    onSegment(c, d, a) ||
    onSegment(c, d, b)
  );
}
export function polygonArea(points) {
  let area = 0;
  for (let k = 0; k < points.length; k++) {
    const a = points[k],
      b = points[(k + 1) % points.length];
    area += a.x * b.y - a.y * b.x;
  }
  return area / 2;
}
export function validateContour(input) {
  let p = input.map((v) => ({ ...v }));
  if (
    p.length > 1 &&
    Math.hypot(p[0].x - p.at(-1).x, p[0].y - p.at(-1).y) < 1e-7
  )
    p.pop();
  p = p.filter(
    (v, k) => k === 0 || Math.hypot(v.x - p[k - 1].x, v.y - p[k - 1].y) > 1e-7,
  );
  if (
    p.length < 3 ||
    p.length > 48 ||
    p.some((v) => !Number.isFinite(v.x) || !Number.isFinite(v.y))
  )
    throw Error("Use 3–48 distinct vertices.");
  for (let i = 0; i < p.length; i++)
    for (let j = i + 1; j < p.length; j++) {
      if (j === i + 1 || (i === 0 && j === p.length - 1)) continue;
      if (intersects(p[i], p[(i + 1) % p.length], p[j], p[(j + 1) % p.length]))
        throw Error("The outline crosses itself. Undo a vertex and try again.");
    }
  const area = polygonArea(p);
  if (Math.abs(area) < 1e-6) throw Error("The outline has no usable area.");
  if (area < 0) p.reverse();
  return p;
}
export function decomposePolygon(flat) {
  const p = validateContour(
    Array.from({ length: flat.length / 2 }, (_, k) => ({
      x: flat[k * 2],
      y: flat[k * 2 + 1],
    })),
  );
  if (
    p.every(
      (v, k) =>
        cross(p[(k + p.length - 1) % p.length], v, p[(k + 1) % p.length]) >=
        -EPS,
    )
  )
    return [p.flatMap((v) => [v.x, v.y])];
  const remaining = [...p],
    triangles = [];
  let guard = 0;
  while (remaining.length > 3) {
    let found = false;
    for (let k = 0; k < remaining.length; k++) {
      const a = remaining[(k + remaining.length - 1) % remaining.length],
        b = remaining[k],
        c = remaining[(k + 1) % remaining.length];
      if (cross(a, b, c) <= EPS) continue;
      if (
        remaining.some(
          (v) =>
            v !== a &&
            v !== b &&
            v !== c &&
            cross(a, b, v) >= -EPS &&
            cross(b, c, v) >= -EPS &&
            cross(c, a, v) >= -EPS,
        )
      )
        continue;
      triangles.push([a, b, c].flatMap((v) => [v.x, v.y]));
      remaining.splice(k, 1);
      found = true;
      break;
    }
    if (!found || guard++ > 48)
      throw Error(
        "Could not triangulate this outline. Remove collinear vertices.",
      );
  }
  triangles.push(remaining.flatMap((v) => [v.x, v.y]));
  return triangles;
}
export function contourSpec(points, photoId) {
  const p = validateContour(points);
  const area = polygonArea(p);
  let x = 0,
    y = 0;
  for (let k = 0; k < p.length; k++) {
    const a = p[k],
      b = p[(k + 1) % p.length],
      c = a.x * b.y - b.x * a.y;
    x += (a.x + b.x) * c;
    y += (a.y + b.y) * c;
  }
  x /= 6 * area;
  y /= 6 * area;
  const vertices = p.flatMap((v) => [v.x - x, v.y - y]);
  decomposePolygon(vertices);
  return {
    shape: "polygon",
    x,
    y,
    angle: 0,
    r: Math.max(...p.map((v) => Math.hypot(v.x - x, v.y - y))),
    vertices,
    color: "#a8c2af",
    role: "traced-block",
    photoId,
  };
}
