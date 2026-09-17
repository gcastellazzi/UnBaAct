import { random } from "./physics.js";
// Procedural reference-inspired masonry examples; no mortar/cohesion is modeled.
export const OPUS_SCENARIOS = [
  {
    id: "mixtum",
    name: "01 · Opus mixtum",
    source: "FCH01_F1_7d_opus_mixtum",
    description:
      "Irregular polygonal stones between brick bands, on a stone base.",
  },
  {
    id: "mixtum-reticulatum",
    name: "02 · Opus mixtum reticulatum",
    source: "FCH01_F1_7e_opus_mixtum_reticulatum",
    description:
      "Small diagonal blocks with alternating colours and horizontal brick bands.",
  },
  {
    id: "reticulatum",
    name: "03 · Opus reticulatum",
    source: "FCH01_F1_7f_opus_reticulatum",
    description:
      "Regular blocks rotated by 45°, with cut blocks along the perimeter.",
  },
  {
    id: "spicatum",
    name: "04 · Opus spicatum",
    source: "FCH01_F1_7g_opus_spicatum",
    description:
      "Rectangular bricks in a herringbone pattern, inclined at ±45°.",
  },
  {
    id: "testaceum",
    name: "05 · Opus testaceum",
    source: "FCH01_F1_7h_opus_testaceum",
    description: "Thin brick courses with staggered vertical joints.",
  },
  {
    id: "mix-vittatum",
    name: "06 · Opus mix vittatum",
    source: "FCH01_F1_7i_opus_mix_vittatum",
    description:
      "Stone blocks of varying height and width, arranged in courses.",
  },
  {
    id: "vittatum",
    name: "07 · Opus vittatum",
    source: "FCH01_F1_7j_opus_vittatum",
    description:
      "Large rectangular blocks of varying sizes, with staggered joints.",
  },
  {
    id: "defensive-wall-bologna",
    name: "Defensive wall Bologna",
    source: "Defensive_wall_Bologna",
    description:
      "Regular edge bricks and rounded central stones, separated by horizontal brick bands.",
  },
  {
    id: "window-regular-bricks",
    name: "Window · regular bricks",
    source: "Window_regular_bricks",
    description:
      "Staggered brickwork around a central window, with one dynamic monolithic lintel.",
  },
  {
    id: "window-irregular-corners",
    name: "Window · irregular blocks + corner stones",
    source: "Window_irregular_blocks_corner_stones",
    description:
      "Irregular stonework with regular edge blocks and squared window jambs supporting one monolithic lintel.",
  },
  {
    id: "load-comparison",
    name: "Load spread · side-by-side",
    source: "Load_spread_comparison",
    description:
      "Two scaled walls under identical 150 N loads: single loaded brick on the left, monolithic distributing block on the right. Same grayscale reference.",
  },
  {
    id: "load-concentrated",
    name: "Load spread · concentrated",
    source: "Load_concentrated",
    description:
      "150 N on one top brick in staggered masonry. Compare with the distributing block using the same 150 N colour scale.",
  },
  {
    id: "load-distributed",
    name: "Load spread · distributing block",
    source: "Load_distributed",
    description:
      "The same 150 N on one wide monolithic block spanning two courses. Compare the wider contact-load paths below it.",
  },
  {
    id: "load-oblique-irregular",
    name: "Oblique load · irregular masonry",
    source: "Irregular_wall_oblique_load",
    description:
      "Rounded irregular dry stones under Fx +85 N and Fy −150 N on an upper stone. The darker load paths are computed from actual contacts. Add joint imperfections or snecks to compare.",
  },
];
const LEFT = 1.025,
  RIGHT = 10.975,
  TOP = 7.75;
export function clipHalfPlane(vertices, nx, ny, limit) {
  const out = [];
  for (let k = 0; k < vertices.length; k++) {
    const a = vertices[k],
      b = vertices[(k + 1) % vertices.length],
      da = a.x * nx + a.y * ny - limit,
      db = b.x * nx + b.y * ny - limit;
    if (da <= 1e-9) out.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db);
      out.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
    }
  }
  return out;
}
function clipped(vertices, bottom = 0.015, top = TOP) {
  let p = vertices;
  for (const [nx, ny, l] of [
    [-1, 0, -LEFT],
    [1, 0, RIGHT],
    [0, -1, -bottom],
    [0, 1, top],
  ])
    p = clipHalfPlane(p, nx, ny, l);
  return p;
}
function block(vertices, color, bottom = 0.015, top = TOP) {
  const p = clipped(vertices, bottom, top);
  if (p.length < 3) return null;
  let area = 0,
    cx = 0,
    cy = 0;
  for (let k = 0; k < p.length; k++) {
    const a = p[k],
      b = p[(k + 1) % p.length],
      cross = a.x * b.y - b.x * a.y;
    area += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  if (Math.abs(area) < 0.025) return null;
  cx /= 3 * area;
  cy /= 3 * area;
  const local = p.map((v) => ({
    x: (v.x - cx) * 0.994,
    y: (v.y - cy) * 0.994,
  }));
  return {
    shape: "polygon",
    x: cx,
    y: cy,
    angle: 0,
    r: Math.max(...local.map((v) => Math.hypot(v.x, v.y))),
    vertices: local.flatMap((v) => [v.x, v.y]),
    color,
    load: 0,
  };
}
function rect(x, y, w, h, angle = 0) {
  return [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ].map(([a, b]) => ({
    x: x + a * Math.cos(angle) - b * Math.sin(angle),
    y: y + a * Math.sin(angle) + b * Math.cos(angle),
  }));
}
function courses(
  out,
  rand,
  bottom,
  top,
  height,
  width,
  palette,
  irregular = false,
) {
  let y = bottom,
    row = 0;
  while (y < top - 0.02) {
    const h = Math.min(height * (irregular ? 0.7 + rand() * 0.6 : 1), top - y);
    let x = LEFT - (row % 2) * width * 0.5;
    while (x < RIGHT) {
      const w = width * (irregular ? 0.55 + rand() * 1.05 : 0.8 + rand() * 0.4);
      let p = rect(x + w / 2, y + h / 2, w, h);
      if (irregular) {
        const bevel = Math.min(w, h) * 0.16;
        p = [
          { x: x + bevel, y },
          { x: x + w - bevel, y },
          { x: x + w, y: y + bevel },
          { x: x + w, y: y + h - bevel },
          { x: x + w - bevel, y: y + h },
          { x: x + bevel, y: y + h },
          { x, y: y + h - bevel },
          { x, y: y + bevel },
        ];
      }
      const b = block(
        p,
        palette[Math.floor(rand() * palette.length)],
        bottom,
        top,
      );
      if (b) out.push(b);
      x += w;
    }
    y += h;
    row++;
  }
}
function diamonds(out, bottom, top, alternating = false) {
  const d = 1.36;
  for (let row = -1; row < Math.ceil((top - bottom) / (d / 2)) + 1; row++) {
    const y = bottom + (row * d) / 2;
    for (let col = -1; col < 9; col++) {
      const x = LEFT + col * d + ((row % 2) * d) / 2;
      const b = block(
        [
          { x, y: y - d / 2 },
          { x: x + d / 2, y },
          { x, y: y + d / 2 },
          { x: x - d / 2, y },
        ],
        alternating ? (row % 2 ? "#969d97" : "#e8cf83") : "#ead49b",
        bottom,
        top,
      );
      if (b) out.push(b);
    }
  }
}
function rubble(out, rand, bottom, top) {
  const seeds = [];
  const rows = 6,
    cols = 9;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      seeds.push({
        x: LEFT + ((c + 0.5 + (rand() - 0.5) * 0.65) * (RIGHT - LEFT)) / cols,
        y: bottom + ((r + 0.5 + (rand() - 0.5) * 0.65) * (top - bottom)) / rows,
      });
  for (const s of seeds) {
    let p = rect(6, (bottom + top) / 2, RIGHT - LEFT, top - bottom);
    for (const t of seeds) {
      if (t === s) continue;
      p = clipHalfPlane(
        p,
        t.x - s.x,
        t.y - s.y,
        (t.x * t.x + t.y * t.y - s.x * s.x - s.y * s.y) / 2,
      );
      if (p.length < 3) break;
    }
    const b = block(
      p,
      ["#e4cd8c", "#ead9a4", "#d9c584"][Math.floor(rand() * 3)],
      bottom,
      top,
    );
    if (b) out.push(b);
  }
}
export function generateOpus(id, seed = 42) {
  const rand = random(seed),
    out = [],
    brick = ["#c89068", "#d3a17b", "#dcb18b"],
    stone = ["#afb1aa", "#c4c4ba", "#d5d2c6"];
  if (id === "load-oblique-irregular") {
    stoneRegion(out, rand, LEFT, RIGHT, 0.015, TOP, true);
    const loaded = [...out].sort(
      (a, b) =>
        Math.hypot(a.x - 4.8, a.y - 7.25) - Math.hypot(b.x - 4.8, b.y - 7.25),
    )[0];
    loaded.load = 150;
    loaded.loadX = 85;
    loaded.role = "loaded-stone";
  } else if (id === "load-comparison") {
    for (const [distributed, offset] of [
      [false, 1.075],
      [true, 6.475],
    ]) {
      const wall = [];
      loadWall(wall, distributed);
      for (const b of wall)
        out.push({
          ...b,
          x: offset + (b.x - 1.05) * 0.45,
          y: 0.02 + (b.y - 0.02) * 0.45,
          r: b.r * 0.45,
          vertices: b.vertices.map((v) => v * 0.45),
        });
    }
  } else if (id === "load-concentrated" || id === "load-distributed")
    loadWall(out, id === "load-distributed");
  else if (id === "mixtum") {
    courses(out, rand, 0.015, 0.9, 0.3, 1.8, stone, true);
    courses(out, rand, 0.9, 1.8, 0.3, 2.15, brick);
    rubble(out, rand, 1.8, 6.85);
    courses(out, rand, 6.85, TOP, 0.3, 2.15, brick);
  } else if (id === "mixtum-reticulatum") {
    diamonds(out, 0.015, 1.05, true);
    courses(out, rand, 1.05, 2.0, 0.32, 2.15, brick);
    diamonds(out, 2.0, 6.85, true);
    courses(out, rand, 6.85, TOP, 0.3, 2.15, brick);
  } else if (id === "reticulatum") diamonds(out, 0.015, TOP);
  else if (id === "spicatum") {
    const u = 0.38,
      n = 3,
      a = Math.PI / 4;
    for (let i = -30; i < 30; i++)
      for (let j = -30; j < 30; j++) {
        const mod = (((i - j) % (2 * n)) + 2 * n) % (2 * n);
        if (mod !== 0 && mod !== 2 * n - 1) continue;
        const horizontal = mod === 0,
          w = horizontal ? n * u : u,
          h = horizontal ? u : n * u;
        const cx = i * u + w / 2,
          cy = j * u + h / 2;
        const x = 6 + cx * Math.cos(a) - cy * Math.sin(a),
          y = 4 + cx * Math.sin(a) + cy * Math.cos(a);
        const b = block(rect(x, y, w, h, a), brick[Math.floor(rand() * 3)]);
        if (b) out.push(b);
      }
  } else if (id === "testaceum")
    courses(out, rand, 0.015, TOP, 0.36, 2.4, brick);
  else if (id === "mix-vittatum")
    courses(out, rand, 0.015, TOP, 0.48, 2.0, stone, true);
  else if (id === "vittatum")
    courses(out, rand, 0.015, TOP, 0.98, 3.1, [
      "#dfce93",
      "#e9d9a1",
      "#e4d49b",
    ]);
  else if (id === "defensive-wall-bologna") defensiveWall(rand, out);
  else if (id === "window-regular-bricks") windowWall(rand, out, false);
  else if (id === "window-irregular-corners") windowWall(rand, out, true);
  else throw Error("Unknown OPUS scenario");
  return out;
}

// Rounded convex stones stay inside their Voronoi cells: no initial overlap.
function roundCorners(p, amount = 0.24) {
  const points = [];
  for (let k = 0; k < p.length; k++) {
    const v = p[k],
      prev = p[(k + p.length - 1) % p.length],
      next = p[(k + 1) % p.length];
    const a = {
      x: v.x + (prev.x - v.x) * amount,
      y: v.y + (prev.y - v.y) * amount,
    };
    const b = {
      x: v.x + (next.x - v.x) * amount,
      y: v.y + (next.y - v.y) * amount,
    };
    for (let j = 0; j < 4; j++) {
      const t = j / 3;
      points.push({
        x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * v.x + t * t * b.x,
        y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * v.y + t * t * b.y,
      });
    }
  }
  return points;
}
function stoneRegion(out, rand, left, right, bottom, top, rounded = false) {
  const cols = Math.max(1, Math.round((right - left) / 0.87)),
    rows = Math.max(1, Math.round((top - bottom) / 0.73)),
    seeds = [];
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < cols; col++)
      seeds.push({
        x: left + ((col + 0.5 + (rand() - 0.5) * 0.7) * (right - left)) / cols,
        y:
          bottom + ((row + 0.5 + (rand() - 0.5) * 0.7) * (top - bottom)) / rows,
      });
  const palette = rounded
    ? ["#acb1a2", "#c6c8b5", "#d6d0af", "#8b9892", "#babdaf"]
    : ["#afa995", "#c3bca7", "#a0a595", "#d0c5a8"];
  for (const s of seeds) {
    let p = rect(
      (left + right) / 2,
      (bottom + top) / 2,
      right - left,
      top - bottom,
    );
    for (const t of seeds) {
      if (t === s) continue;
      p = clipHalfPlane(
        p,
        t.x - s.x,
        t.y - s.y,
        (t.x * t.x + t.y * t.y - s.x * s.x - s.y * s.y) / 2,
      );
      if (p.length < 3) break;
    }
    const b = block(
      rounded ? roundCorners(p) : p,
      palette[Math.floor(rand() * palette.length)],
      bottom,
      top,
    );
    if (b) out.push({ ...b, role: rounded ? "rounded-stone" : "rubble" });
  }
}
function regularRegion(
  out,
  rand,
  left,
  right,
  bottom,
  top,
  width = 1.5,
  height = 0.38,
  role = "brick",
) {
  let row = 0;
  for (let y = bottom; y < top - 0.015; y += height, row++) {
    const h = Math.min(height, top - y);
    for (let x = left - ((row % 2) * width) / 2; x < right; x += width) {
      const l = Math.max(left, x),
        r = Math.min(right, x + width);
      if (r - l < 0.06) continue;
      const b = block(
        rect((l + r) / 2, y + h / 2, r - l, h),
        ["#c58c68", "#d09c78", "#cda887"][Math.floor(rand() * 3)],
        bottom,
        top,
      );
      if (b) out.push({ ...b, role });
    }
  }
}
function edgeBlocks(out, rand, bottom, top, corner = false) {
  let row = 0;
  for (let y = bottom; y < top - 0.015; y += 0.43, row++) {
    const h = Math.min(0.43, top - y),
      width = corner ? (row % 2 ? 1.0 : 1.25) : 1.18;
    for (const side of ["left", "right"]) {
      const x = side === "left" ? LEFT + width / 2 : RIGHT - width / 2;
      const b = block(
        rect(x, y + h / 2, width, h),
        ["#b88265", "#cf9b79", "#bda78b"][Math.floor(rand() * 3)],
        bottom,
        top,
      );
      if (b) out.push({ ...b, role: corner ? "corner-stone" : "brick" });
    }
  }
}
function defensiveWall(rand, out) {
  for (const [bottom, top] of [
    [0.015, 2.0],
    [2.45, 5.2],
    [5.65, TOP],
  ]) {
    edgeBlocks(out, rand, bottom, top);
    stoneRegion(out, rand, LEFT + 1.2, RIGHT - 1.2, bottom, top, true);
  }
  regularRegion(out, rand, LEFT, RIGHT, 2.0, 2.45, 2.25, 0.225);
  regularRegion(out, rand, LEFT, RIGHT, 5.2, 5.65, 2.25, 0.225);
}
export const WINDOW_OPENING = { left: 4.6, right: 7.4, bottom: 1.65, top: 4.3 };
function windowWall(rand, out, irregular) {
  const { left, right, bottom, top } = WINDOW_OPENING,
    lintelLeft = 3.9,
    lintelRight = 8.1,
    lintelTop = 4.85;
  const regions = [
    [LEFT, RIGHT, 0.015, bottom],
    [LEFT, left, bottom, top],
    [right, RIGHT, bottom, top],
    [LEFT, lintelLeft, top, lintelTop],
    [lintelRight, RIGHT, top, lintelTop],
    [LEFT, RIGHT, lintelTop, TOP],
  ];
  if (!irregular) {
    for (const [l, r, b, t] of regions) regularRegion(out, rand, l, r, b, t);
  } else {
    edgeBlocks(out, rand, 0.015, TOP, true);
    const innerLeft = LEFT + 1.27,
      innerRight = RIGHT - 1.27;
    stoneRegion(out, rand, innerLeft, innerRight, 0.015, bottom);
    // Squared jambs provide visible bearing surfaces for the single lintel.
    for (const [l, r] of [
      [3.6, left],
      [right, 8.4],
    ])
      regularRegion(out, rand, l, r, bottom, top, 1, 0.53, "corner-stone");
    stoneRegion(out, rand, innerLeft, 3.6, bottom, top);
    stoneRegion(out, rand, 8.4, innerRight, bottom, top);
    stoneRegion(out, rand, innerLeft, lintelLeft, top, lintelTop);
    stoneRegion(out, rand, lintelRight, innerRight, top, lintelTop);
    stoneRegion(out, rand, innerLeft, innerRight, lintelTop, TOP);
  }
  const lintel = block(
    rect(6, (top + lintelTop) / 2, lintelRight - lintelLeft, lintelTop - top),
    "#bda477",
  );
  out.push({ ...lintel, role: "lintel" });
}

function loadWall(out, distributed) {
  const left = 1.05,
    right = 10.95,
    pitch = 1.65,
    height = 0.52,
    gap = 0.02;
  const add = (l, r, b, t, load = 0) => {
    const stone = block(
      rect((l + r) / 2, (b + t) / 2, r - l, t - b),
      "#cba983",
    );
    out.push({
      ...stone,
      role: load && distributed ? "load-spreader" : "brick",
      group: "regular",
      load,
    });
  };
  for (let row = 0; row < 14; row++) {
    const cuts = [left];
    for (
      let x = left + (row % 2 ? pitch / 2 : pitch);
      x < right - 1e-6;
      x += pitch
    )
      cuts.push(x);
    cuts.push(right);
    for (let k = 1; k < cuts.length; k++) {
      const l = cuts[k - 1] + gap / 2,
        r = cuts[k] - gap / 2,
        b = 0.02 + row * 0.54,
        t = b + height;
      if (distributed && row >= 12) {
        if (l < 4.35) add(l, Math.min(r, 4.34), b, t);
        if (r > 7.65) add(Math.max(l, 7.66), r, b, t);
      } else
        add(l, r, b, t, !distributed && row === 13 && l < 6 && r > 6 ? 150 : 0);
    }
  }
  if (distributed)
    add(4.36, 7.64, 0.02 + 12 * 0.54, 0.02 + 13 * 0.54 + height, 150);
}
