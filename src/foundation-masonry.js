import { contourSpec } from "./geometry.js";
import { BASE_DEFAULTS, validateBase } from "./elastic-base.js";

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a/4294967296; };
}
export function blockBounds(s) {
  if (s.shape === "disk") return { left: s.x - s.r, right: s.x + s.r, bottom: s.y - s.r };
  const w = s.width ?? 2*s.r, h = s.height ?? 2*s.r;
  const v = s.vertices ?? (s.shape === "triangle" ? [0, s.r*1.25, -s.r, -s.r*.75, s.r, -s.r*.75] : [-w/2, -h/2, w/2, -h/2, w/2, h/2, -w/2, h/2]);
  const a = s.angle || 0, points = [];
  for (let i = 0; i < v.length; i += 2)
    points.push({ x: s.x + v[i]*Math.cos(a) - v[i + 1]*Math.sin(a), y: s.y + v[i]*Math.sin(a) + v[i + 1]*Math.cos(a) });
  return { left: Math.min(...points.map((p) => p.x)), right: Math.max(...points.map((p) => p.x)), bottom: Math.min(...points.map((p) => p.y)) };
}

// Put courses BELOW the original floor; the wall and its ties are not moved.
export function foundationMasonry(specs, options = {}, floor = 0) {
  const wall = specs.filter((s) => !s.foundationBlock);
  if (!wall.length) throw Error("Load or build a wall before adding its foundation.");
  const input = { ...BASE_DEFAULTS, ...options };
  const bounds = wall.map(blockBounds);
  const left = Math.min(...bounds.map((b) => b.left)) - input.margin;
  const right = Math.max(...bounds.map((b) => b.right)) + input.margin;
  const depth = input.pattern === "none" ? 0 : input.rows*input.course;
  const config = validateBase({ ...input, left, right, top: floor - depth });
  const random = rng(config.seed), blocks = [];
  let id = Math.max(0, ...specs.map((s) => s.id || 0)) + 1;
  if (config.pattern !== "none") for (let row = 0; row < config.rows; row++) {
    let x = left;
    while (x < right - .01) {
      const irregular = config.pattern === "irregular-stone";
      let width = config.blockWidth*(irregular ? .65 + .7*random() : 1);
      if (x === left && row % 2 && !irregular) width *= .5;
      width = Math.min(width, right - x);
      if (right - x - width < config.blockWidth*.2) width = right - x;
      const gap = .001, y = config.top + row*config.course;
      const x0 = x + gap/2, x1 = x + width - gap/2, y0 = y + gap/2, y1 = y + config.course - gap/2;
      let s;
      if (irregular) {
        const c = Math.min(width, config.course)*(.08 + .12*random());
        s = contourSpec([
          { x: x0 + c, y: y0 }, { x: x1 - c*.6, y: y0 },
          { x: x1, y: y0 + c }, { x: x1 - c*.15, y: y1 - c*.6 },
          { x: x1 - c, y: y1 }, { x: x0 + c*.5, y: y1 },
          { x: x0, y: y1 - c }, { x: x0 + c*.1, y: y0 + c },
        ]);
      } else s = { shape: "rectangle", x: (x0 + x1)/2, y: (y0 + y1)/2,
        width: x1 - x0, height: y1 - y0, r: Math.hypot(x1 - x0, y1 - y0)/2, angle: 0 };
      blocks.push({ ...s, id: id++, foundationBlock: true,
        role: irregular ? "rubble" : "brick", group: irregular ? "irregular" : "regular",
        color: config.pattern === "bricks" ? ["#bb8264", "#c69276"][row % 2] : ["#9caaa0", "#b0b6a6"][blocks.length % 2] });
      x += width;
    }
  }
  if (wall.length + blocks.length > 400) throw Error("Foundation would exceed 400 blocks. Increase block width or reduce courses.");
  return { config, particles: [...wall, ...blocks] };
}
