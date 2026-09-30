import { validateContour, polygonArea } from "./geometry.js";

// Local stone recognition on an RGBA image, without external services.
// 1. grayscale + light blur; 2. adaptive threshold against the local mean
// (joints darker or lighter than the stones); 3. erosion to split stones that
// touch through thin joints, labelling, then regrowth inside the mask;
// 4. outer contour tracing and Douglas–Peucker simplification.
// Returned outlines are in pixel coordinates (x right, y down).

function integral(values, w, h) {
  const s = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += values[y * w + x];
      s[(y + 1) * (w + 1) + x + 1] = s[y * (w + 1) + x + 1] + row;
    }
  }
  return s;
}
function boxMean(values, w, h, radius) {
  const s = integral(values, w, h),
    out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - radius),
      y1 = Math.min(h, y + radius + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - radius),
        x1 = Math.min(w, x + radius + 1);
      out[y * w + x] =
        (s[y1 * (w + 1) + x1] -
          s[y0 * (w + 1) + x1] -
          s[y1 * (w + 1) + x0] +
          s[y0 * (w + 1) + x0]) /
        ((x1 - x0) * (y1 - y0));
    }
  }
  return out;
}
function erode(mask, w, h) {
  const out = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const k = y * w + x;
      out[k] =
        mask[k] && mask[k - 1] && mask[k + 1] && mask[k - w] && mask[k + w]
          ? 1
          : 0;
    }
  return out;
}

// Otsu threshold with the mean of each class, on 0–255 values.
export function otsu(values) {
  const hist = new Float64Array(256);
  for (const v of values) hist[Math.max(0, Math.min(255, Math.round(v)))]++;
  let total = 0,
    sum = 0;
  for (let k = 0; k < 256; k++) {
    total += hist[k];
    sum += k * hist[k];
  }
  let best = 0,
    threshold = 127,
    w0 = 0,
    s0 = 0;
  for (let k = 0; k < 256; k++) {
    w0 += hist[k];
    s0 += k * hist[k];
    const w1 = total - w0;
    if (!w0 || !w1) continue;
    const between = w0 * w1 * (s0 / w0 - (sum - s0) / w1) ** 2;
    if (between > best) {
      best = between;
      threshold = k;
    }
  }
  let n0 = 0,
    m0 = 0,
    n1 = 0,
    m1 = 0;
  for (let k = 0; k < 256; k++)
    if (k <= threshold) {
      n0 += hist[k];
      m0 += k * hist[k];
    } else {
      n1 += hist[k];
      m1 += k * hist[k];
    }
  return {
    threshold,
    dark: n0 ? m0 / n0 : threshold,
    light: n1 ? m1 / n1 : threshold,
  };
}
export function stoneMask(image, options = {}) {
  const {
    jointsDark = true,
    sensitivity = 8,
    window = 0.08,
  } = options;
  const { data, width: w, height: h } = image;
  const gray = new Float32Array(w * h);
  for (let k = 0; k < w * h; k++)
    gray[k] = 0.299 * data[k * 4] + 0.587 * data[k * 4 + 1] + 0.114 * data[k * 4 + 2];
  const smooth = boxMean(boxMean(gray, w, h, 1), w, h, 1),
    mean = boxMean(
      smooth,
      w,
      h,
      Math.max(3, Math.round(window * Math.min(w, h))),
    ),
    mask = new Uint8Array(w * h);
  // The local test follows uneven lighting; the relaxed global bound (halfway
  // between the Otsu threshold and the joint-class mean) rejects the centre of
  // joints wider than the local window.
  const global = otsu(smooth),
    bound = jointsDark
      ? (global.dark + global.threshold) / 2
      : (global.light + global.threshold) / 2;
  for (let k = 0; k < w * h; k++)
    mask[k] = jointsDark
      ? smooth[k] >= mean[k] - sensitivity && smooth[k] >= bound
        ? 1
        : 0
      : smooth[k] <= mean[k] + sensitivity && smooth[k] <= bound
        ? 1
        : 0;
  return mask;
}

// Erode `separation` times, label 4-connected components, and regrow each
// label by the same number of pixels inside the original mask.
export function labelStones(mask, w, h, separation = 2, fill = 0, minPixels = 0) {
  let core = mask;
  for (let k = 0; k < separation; k++) core = erode(core, w, h);
  const labels = new Int32Array(w * h);
  let count = 0;
  const stack = [];
  for (let start = 0; start < w * h; start++) {
    if (!core[start] || labels[start]) continue;
    labels[start] = ++count;
    stack.push(start);
    while (stack.length) {
      const k = stack.pop(),
        x = k % w;
      for (const n of [
        x > 0 ? k - 1 : -1,
        x < w - 1 ? k + 1 : -1,
        k - w,
        k + w,
      ])
        if (n >= 0 && n < w * h && core[n] && !labels[n]) {
          labels[n] = count;
          stack.push(n);
        }
    }
  }
  let front = [];
  for (let k = 0; k < w * h; k++) if (labels[k]) front.push(k);
  for (let step = 0; step < separation; step++) {
    const next = [];
    for (const k of front) {
      const x = k % w;
      for (const n of [
        x > 0 ? k - 1 : -1,
        x < w - 1 ? k + 1 : -1,
        k - w,
        k + w,
      ])
        if (n >= 0 && n < w * h && mask[n] && !labels[n]) {
          labels[n] = labels[k];
          next.push(n);
        }
    }
    front = next;
  }
  // Optionally close the joints: grow all labels outside the mask in
  // simultaneous rounds, so neighbouring stones meet midway in the mortar.
  if (fill > 0) {
    // Small fragments (e.g. the centre of a wide joint) must not grow.
    const size = new Int32Array(count + 1);
    for (let k = 0; k < w * h; k++) size[labels[k]]++;
    for (let k = 0; k < w * h; k++)
      if (labels[k] && size[labels[k]] < minPixels) labels[k] = 0;
    front = [];
    for (let k = 0; k < w * h; k++) if (labels[k]) front.push(k);
    for (let step = 0; step < fill && front.length; step++) {
      const next = [];
      for (const k of front) {
        const x = k % w;
        for (const n of [
          x > 0 ? k - 1 : -1,
          x < w - 1 ? k + 1 : -1,
          k - w,
          k + w,
        ])
          if (n >= 0 && n < w * h && !labels[n]) {
            labels[n] = labels[k];
            next.push(n);
          }
      }
      front = next;
    }
  }
  return { labels, count };
}

const DIRS = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];
// Moore-neighbour tracing of the outer boundary of one label.
export function traceContour(labels, w, h, label, start) {
  const inside = (x, y) =>
    x >= 0 && y >= 0 && x < w && y < h && labels[y * w + x] === label;
  const direction = (dx, dy) =>
    DIRS.findIndex(([x, y]) => x === dx && y === dy);
  let x = start % w,
    y = Math.floor(start / w),
    back = 4;
  const out = [{ x, y }];
  let first = null;
  for (let guard = 0; guard < 4 * w * h; guard++) {
    let moved = false;
    for (let i = 1; i <= 8; i++) {
      const d = (back + i) % 8,
        nx = x + DIRS[d][0],
        ny = y + DIRS[d][1];
      if (!inside(nx, ny)) continue;
      const p = DIRS[(d + 7) % 8];
      back = direction(x + p[0] - nx, y + p[1] - ny);
      const move = ny * w + nx;
      if (x + y * w === start) {
        if (first === move) return out.slice(0, -1);
        first ??= move;
      }
      x = nx;
      y = ny;
      out.push({ x, y });
      moved = true;
      break;
    }
    if (!moved) return out;
  }
  return out;
}

function segmentDistance(p, a, b) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
function douglasPeucker(points, tolerance) {
  if (points.length < 3) return points;
  let index = 0,
    max = 0;
  for (let k = 1; k < points.length - 1; k++) {
    const d = segmentDistance(points[k], points[0], points.at(-1));
    if (d > max) {
      max = d;
      index = k;
    }
  }
  if (max <= tolerance) return [points[0], points.at(-1)];
  return [
    ...douglasPeucker(points.slice(0, index + 1), tolerance).slice(0, -1),
    ...douglasPeucker(points.slice(index), tolerance),
  ];
}
export function simplifyClosed(points, tolerance, maxVertices = 48) {
  if (points.length <= 3) return points;
  let far = 0,
    best = 0;
  for (let k = 1; k < points.length; k++) {
    const d = Math.hypot(points[k].x - points[0].x, points[k].y - points[0].y);
    if (d > best) {
      best = d;
      far = k;
    }
  }
  let t = tolerance,
    result;
  do {
    result = [
      ...douglasPeucker(points.slice(0, far + 1), t).slice(0, -1),
      ...douglasPeucker([...points.slice(far), points[0]], t).slice(0, -1),
    ];
    t *= 1.4;
  } while (result.length > maxVertices);
  return result;
}
export function convexHull(points) {
  const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y),
    cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [],
    upper = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), q) <= 0)
      lower.pop();
    lower.push(q);
  }
  for (const q of p.reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), q) <= 0)
      upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

export function detectStones(image, options = {}) {
  const {
    separation = 2,
    fillJoints = 0,
    minArea = 0.001,
    maxArea = 0.6,
    simplify = 1.5,
    maxStones = 300,
    shrink = 0.5,
  } = options;
  const { width: w, height: h } = image;
  const mask = stoneMask(image, options),
    { labels, count } = labelStones(
      mask,
      w,
      h,
      separation,
      fillJoints,
      minArea * w * h,
    );
  const area = new Int32Array(count + 1),
    start = new Int32Array(count + 1).fill(-1);
  for (let k = 0; k < w * h; k++) {
    const l = labels[k];
    if (!l) continue;
    area[l]++;
    if (start[l] < 0) start[l] = k;
  }
  const stones = [];
  for (let l = 1; l <= count; l++) {
    if (area[l] < minArea * w * h || area[l] > maxArea * w * h) continue;
    const contour = traceContour(labels, w, h, l, start[l]).map((p) => ({
      x: p.x + 0.5,
      y: p.y + 0.5,
    }));
    if (contour.length < 4) continue;
    let outline = simplifyClosed(contour, simplify);
    try {
      outline = validateContour(outline);
    } catch {
      outline = convexHull(contour);
      if (outline.length > 48) outline = simplifyClosed(outline, simplify);
      try {
        outline = validateContour(outline);
      } catch {
        continue;
      }
    }
    const a = Math.abs(polygonArea(outline));
    if (a < 4) continue;
    // Pull vertices slightly inward so neighbouring outlines do not overlap.
    const c = outline.reduce(
      (s, p) => ({ x: s.x + p.x / outline.length, y: s.y + p.y / outline.length }),
      { x: 0, y: 0 },
    );
    outline = outline.map((p) => {
      const d = Math.hypot(p.x - c.x, p.y - c.y);
      return d > shrink * 2
        ? { x: p.x - ((p.x - c.x) / d) * shrink, y: p.y - ((p.y - c.y) / d) * shrink }
        : p;
    });
    stones.push({ points: outline, area: area[l] });
  }
  return stones.sort((a, b) => b.area - a.area).slice(0, maxStones);
}
