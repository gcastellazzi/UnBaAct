import { foundationMasonry } from "./foundation-masonry.js";
import { BASE_DEFAULTS } from "./elastic-base.js";

// Equal wall envelope and nominal course/block sizes. Irregular stones have
// different retained area; compare reactions normalized by actual weight.
export function settlementExample(bond = "staggered", zone = "center") {
  if (!["staggered", "stacked", "irregular"].includes(bond)) throw Error("Unknown settlement wall bond.");
  if (!["center", "left", "right"].includes(zone)) throw Error("Choose a central or lateral settlement region.");
  const left = 2.8, right = 9.2, width = .8, course = .4, rows = 6;
  let particles;
  if (bond === "stacked") {
    particles = Array.from({ length: rows*8 }, (_, k) => ({
      id: k+1, shape: "rectangle", x: left+(k%8+.5)*width,
      y: (Math.floor(k/8)+.5)*course, width: width-.001, height: course-.001,
      r: Math.hypot(width-.001, course-.001)/2, angle: 0,
      role: "brick", group: "regular", color: "#c69276",
    }));
  } else {
    const dummy = [{ id: 0, shape: "rectangle", x: 6, y: 3, width: right-left, height: 1, r: 4 }];
    particles = foundationMasonry(dummy, { pattern: bond === "irregular" ? "irregular-stone" : "bricks",
      rows, course, blockWidth: width, margin: 0, seed: 42 }, rows*course)
      .particles.slice(1).map(({ foundationBlock, ...s }) => s);
  }
  return { bond, particles, ties: [], config: {
    boundary: "free", gravity: 9.81, friction: .6, thickness: .3, materialDensity: 1800,
    bounds: { left, right, bottom: 0, top: 3.4 },
    elasticBase: { ...BASE_DEFAULTS, pattern: "none", left, right, top: 0,
      margin: 0, zone, zoneFraction: .4, k: 5e5, EI: 100, shear: 1e4, segments: 24 },
  } };
}
