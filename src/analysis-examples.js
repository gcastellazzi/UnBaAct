// Ready-made structures for the collapse-multiplier analysis. Each example
// returns blocks with IDs and, for the tied variants, ties whose anchors sit on
// the block axis close to each joint: such a tie resists the joint opening
// about either edge, so no hinge can form there.

const SHRINK = 0.996;
const STONE = ["#c9bda2", "#d6cbb0", "#bfb296"];

function polygon(points, color, role) {
  let area = 0,
    cx = 0,
    cy = 0;
  for (let k = 0; k < points.length; k++) {
    const a = points[k],
      b = points[(k + 1) % points.length],
      c = a.x * b.y - b.x * a.y;
    area += c;
    cx += (a.x + b.x) * c;
    cy += (a.y + b.y) * c;
  }
  cx /= 3 * area;
  cy /= 3 * area;
  // A 0.4% shrink leaves millimetre joints, so blocks start without overlap.
  const local = points.map((p) => ({
    x: (p.x - cx) * SHRINK,
    y: (p.y - cy) * SHRINK,
  }));
  return {
    shape: "polygon",
    x: cx,
    y: cy,
    angle: 0,
    r: Math.max(...local.map((v) => Math.hypot(v.x, v.y))),
    vertices: local.flatMap((v) => [v.x, v.y]),
    color,
    role,
    group: "regular",
    load: 0,
    loadX: 0,
  };
}
const box = (l, b, r, t, color, role = "brick") =>
  polygon(
    [
      { x: l, y: b },
      { x: r, y: b },
      { x: r, y: t },
      { x: l, y: t },
    ],
    color,
    role,
  );

class Builder {
  constructor() {
    this.particles = [];
    this.ties = [];
  }
  add(block) {
    block.id = this.particles.length + 1;
    this.particles.push(block);
    return block;
  }
  // Tension-only ties (chains, tie-rods) anchored across a joint: they
  // become taut as soon as the joint starts to open and never push.
  tie(a, b, p, q) {
    this.ties.push({
      id: this.ties.length + 1,
      a: a.id,
      b: b.id,
      anchorA: { x: p.x - a.x, y: p.y - a.y },
      anchorB: { x: q.x - b.x, y: q.y - b.y },
      length: Math.hypot(q.x - p.x, q.y - p.y),
      tension: true,
    });
  }
}

// Semicircular arch (11 voussoirs, span 4 m, ring 0.4 m) on two piers of
// three courses each.
export function arch(tied, { pierCourses = 3, pierWidth = 0.75, springing = 2.1 } = {}) {
  const out = new Builder(),
    cx = 6,
    ri = 2,
    re = 2.4,
    rm = (ri + re) / 2,
    n = 11,
    pierHeight = springing / Math.max(1, pierCourses);
  const piers = [];
  for (const [l, r] of pierCourses
    ? [
        [cx - ri + 0.1 - pierWidth, cx - ri + 0.1],
        [cx + ri - 0.1, cx + ri - 0.1 + pierWidth],
      ]
    : []) {
    const pier = [];
    for (let k = 0; k < pierCourses; k++)
      pier.push(
        out.add(
          box(l, k * pierHeight, r, (k + 1) * pierHeight, STONE[k % 3], "corner-stone"),
        ),
      );
    piers.push(pier);
  }
  const at = (radius, angle) => ({
    x: cx + radius * Math.cos(angle),
    y: springing + radius * Math.sin(angle),
  });
  const voussoirs = [];
  for (let k = 0; k < n; k++) {
    const a0 = Math.PI - (k * Math.PI) / n,
      a1 = Math.PI - ((k + 1) * Math.PI) / n,
      arc = (a, b) =>
        Array.from({ length: 3 }, (_, j) => a + ((b - a) * j) / 2);
    const points = [
      ...arc(a0, a1).map((a) => at(ri, a)),
      ...arc(a1, a0).map((a) => at(re, a)),
    ];
    voussoirs.push(
      out.add(
        polygon(
          points,
          k === (n - 1) / 2 ? "#b9a57a" : STONE[k % 3],
          "brick",
        ),
      ),
    );
  }
  if (tied) {
    const d = 0.12 / rm;
    for (let k = 0; k < n - 1; k++) {
      const joint = Math.PI - ((k + 1) * Math.PI) / n;
      out.tie(
        voussoirs[k],
        voussoirs[k + 1],
        at(rm, joint + d),
        at(rm, joint - d),
      );
    }
  }
  return out;
}

// Trabeated portico: four columns of three drums with capitals, an
// architrave jointed over the columns and a staggered frieze course.
export function portico(tied, { drums = 3, tieDrums = true, tieCaps = true } = {}) {
  const out = new Builder(),
    axes = [2.7, 4.9, 7.1, 9.3],
    drum = 2.4 / drums,
    half = 0.225,
    capital = { half: 0.4, height: 0.25 },
    top = drums * drum,
    architrave = { bottom: top + capital.height, height: 0.45 },
    friezeBottom = architrave.bottom + architrave.height,
    ends = [axes[0] - capital.half, axes.at(-1) + capital.half];
  const columns = axes.map((x) => {
    const stack = Array.from({ length: drums }, (_, k) =>
      out.add(box(x - half, k * drum, x + half, (k + 1) * drum, STONE[k % 3], "corner-stone")),
    );
    const cap = out.add(
      box(x - capital.half, top, x + capital.half, top + capital.height, "#b9a57a", "corner-stone"),
    );
    return { x, drums: stack, cap };
  });
  const cuts = [ends[0], ...axes.slice(1, -1), ends[1]];
  const beams = [];
  for (let k = 1; k < cuts.length; k++)
    beams.push(
      out.add(
        box(
          cuts[k - 1],
          architrave.bottom,
          cuts[k],
          architrave.bottom + architrave.height,
          "#cbb68d",
          "lintel",
        ),
      ),
    );
  const friezeCuts = [ends[0], 3.8, 6, 8.2, ends[1]];
  for (let k = 1; k < friezeCuts.length; k++)
    out.add(
      box(friezeCuts[k - 1], friezeBottom, friezeCuts[k], friezeBottom + 0.35, STONE[k % 3]),
    );
  if (tied)
    for (const [n, c] of columns.entries()) {
      const stack = [...c.drums, c.cap];
      for (let k = tieDrums ? 0 : stack.length - 2; k < stack.length - 1; k++) {
        const y = (k + 1) * drum;
        out.tie(stack[k], stack[k + 1], { x: c.x, y: y - 0.12 }, { x: c.x, y: y + 0.12 });
      }
      const y = architrave.bottom;
      if (tieCaps) for (const [beam, dx] of [
        [beams[n - 1], -0.15],
        [beams[n], 0.15],
      ])
        if (beam)
          out.tie(
            c.cap,
            beam,
            { x: c.x + dx, y: y - 0.1 },
            { x: c.x + dx, y: y + 0.12 },
          );
    }
  return out;
}

// Arcade: three semicircular arches on four piers of two courses. The tied
// variant adds a chain (catena) between the springer voussoirs of each arch.
export function arcade(tied, { springing = 1.5, courses = 2, endPier = 0.8 } = {}) {
  const out = new Builder(),
    centres = [3.2, 6, 8.8],
    ri = 1.05,
    re = 1.35,
    rm = (ri + re) / 2,
    n = 7,
    pierEdges = [
      [centres[0] - 1 - endPier, centres[0] - 1],
      ...centres.slice(0, -1).map((c) => [c + 1, c + 1.8]),
      [centres.at(-1) + 1, centres.at(-1) + 1 + endPier],
    ];
  for (const [l, r] of pierEdges)
    for (let k = 0; k < courses; k++)
      out.add(
        box(
          l,
          (k * springing) / courses,
          r,
          ((k + 1) * springing) / courses,
          STONE[k % 3],
          "corner-stone",
        ),
      );
  for (const cx of centres) {
    const at = (radius, angle) => ({
      x: cx + radius * Math.cos(angle),
      y: springing + radius * Math.sin(angle),
    });
    const ring = [];
    for (let k = 0; k < n; k++) {
      const a0 = Math.PI - (k * Math.PI) / n,
        a1 = Math.PI - ((k + 1) * Math.PI) / n,
        arc = (a, b) =>
          Array.from({ length: 3 }, (_, j) => a + ((b - a) * j) / 2);
      ring.push(
        out.add(
          polygon(
            [...arc(a0, a1).map((a) => at(ri, a)), ...arc(a1, a0).map((a) => at(re, a))],
            STONE[(k + 1) % 3],
            "brick",
          ),
        ),
      );
    }
    if (tied) {
      const d = 0.2 / rm;
      out.tie(ring[0], ring.at(-1), at(rm, Math.PI - d), at(rm, d));
    }
  }
  return out;
}

// Calibration: a 0.4 × 1.2 m block on a wide base overturns at λ = b/h = 1/3.
function calibration() {
  const out = new Builder();
  out.add(box(4.5, 0, 7.5, 0.3, "#bfb296"));
  out.add(box(5.8, 0.3, 6.2, 1.5, "#d6cbb0", "corner-stone"));
  return out;
}

export const ANALYSIS_EXAMPLES = [
  {
    id: "arch-free",
    name: "Arch on piers · free joints (hinges)",
    description:
      "Semicircular arch of 11 voussoirs on two stocky monolithic piers. Every voussoir joint can open, so a four-hinge mechanism forms under horizontal load.",
    build: () => arch(false, ARCH),
  },
  {
    id: "arch-tied",
    name: "Arch on piers · tied joints (no hinges)",
    description:
      "Same arch with a tension tie across each voussoir joint: the ring cannot open, so hinges can only form at the springings and pier bases. Use Pre / post ties to compare with the hinged arch.",
    build: () => arch(true, ARCH),
  },
  {
    id: "arcade-free",
    name: "Arcade · three arches on piers",
    description:
      "Porticato of three semicircular arches on piers of three courses, with slender end piers. A 1 kN load on the left keystone is multiplied by λ (pattern: applied loads): the arch spreads and pushes the end pier over.",
    build: () => loadedArcade(false),
    pattern: "loads",
    lambdaMax: 20,
  },
  {
    id: "arcade-chains",
    name: "Arcade · with chains (catene)",
    description:
      "Same loaded arcade with a tension-only chain between the springers of each arch, which takes the thrust off the end pier. Use Pre / post ties for the gain in collapse multiplier.",
    build: () => loadedArcade(true),
    pattern: "loads",
    lambdaMax: 20,
  },
  {
    id: "portico-free",
    name: "Portico · trabeated, drum columns",
    description:
      "Three-bay trabeated portico: columns of three drums, capitals, architrave and frieze. Columns rock as a parallelogram mechanism: λ is close to the column slenderness b/h ≈ 0.19.",
    build: () => portico(false),
  },
  {
    id: "calibration-block",
    name: "Calibration · slender block (λ = b/h = 1/3)",
    description:
      "A 0.4 × 1.2 m block on a wide base. Rigid-body statics gives overturning at λ = b/h = 0.333 for a uniform horizontal load when friction exceeds 1/3: a check of the numerical procedure.",
    build: () => calibration(),
  },
];
const ARCH = { pierCourses: 1, pierWidth: 1.4, springing: 1.2 };
const ARCADE = { springing: 2.4, courses: 3, endPier: 0.6 };
function loadedArcade(tied) {
  const out = arcade(tied, ARCADE),
    keystone = out.particles[4 * ARCADE.courses + 3];
  keystone.load = 1000;
  keystone.role = "loaded-stone";
  return out;
}

// Material and analysis settings shared by the examples.
export const EXAMPLE_SETTINGS = {
  thickness: 0.5,
  materialDensity: 2000,
  friction: 0.6,
};
export function analysisExample(id) {
  const example = ANALYSIS_EXAMPLES.find((e) => e.id === id);
  if (!example) throw Error("Unknown analysis example");
  const { particles, ties } = example.build();
  return {
    pattern: "uniform",
    lambdaMax: 1,
    ...example,
    particles,
    ties,
  };
}
