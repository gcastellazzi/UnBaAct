import { contourSpec, decomposePolygon } from "./geometry.js";

const FORMAT = "aLOTofImaginArches/state";
const LENGTH_TO_METRES = { SI: 1, Nmm: 1e-3, kgcm: 1e-2 };
const FORCE_TO_NEWTONS = { SI: 1e3, Nmm: 1, kgcm: 9.80665 };
const INP_LENGTH_TO_METRES = { m: 1, mm: 1e-3, cm: 1e-2 };
const COLORS = ["#b7aa91", "#9eb4a4", "#c3a389", "#a8a9b0"];

function finiteNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw Error("The file contains a non-numeric coordinate.");
  return n;
}

function simplifyOutline(points) {
  let out = points.map((p) => ({ ...p }));
  let changed = true;
  while (changed && out.length > 3) {
    changed = false;
    const span = Math.max(
      Math.max(...out.map((p) => p.x)) - Math.min(...out.map((p) => p.x)),
      Math.max(...out.map((p) => p.y)) - Math.min(...out.map((p) => p.y)),
      1,
    );
    const tolerance = span * 1e-8;
    out = out.filter((b, i) => {
      const a = out[(i + out.length - 1) % out.length];
      const c = out[(i + 1) % out.length];
      const cross = Math.abs((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x));
      const remove = cross <= tolerance * Math.hypot(c.x - a.x, c.y - a.y);
      changed ||= remove;
      return !remove;
    });
  }
  return out;
}

function particle(points, color = COLORS[0]) {
  let clean = simplifyOutline(points);
  if (clean.length > 48)
    throw Error(`A block has ${clean.length} corners; UnBaAct supports at most 48.`);
  let spec;
  try {
    spec = contourSpec(clean);
  } catch (error) {
    if (!/crosses itself/i.test(error.message)) throw error;
    const centre = clean.reduce(
      (sum, p) => ({ x: sum.x + p.x, y: sum.y + p.y }),
      { x: 0, y: 0 },
    );
    centre.x /= clean.length;
    centre.y /= clean.length;
    clean = [...clean].sort(
      (a, b) =>
        Math.atan2(a.y - centre.y, a.x - centre.x) -
        Math.atan2(b.y - centre.y, b.x - centre.x),
    );
    spec = contourSpec(clean);
  }
  spec.color = /^#[0-9a-f]{6}$/i.test(color) ? color : COLORS[0];
  delete spec.photoId;
  return spec;
}

function boundsFor(particles) {
  const points = particles.flatMap((p) => {
    const c = Math.cos(p.angle),
      s = Math.sin(p.angle);
    return Array.from({ length: p.vertices.length / 2 }, (_, i) => {
      const x = p.vertices[i * 2],
        y = p.vertices[i * 2 + 1];
      return { x: p.x + x * c - y * s, y: p.y + x * s + y * c };
    });
  });
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y),
    left = Math.min(...xs),
    right = Math.max(...xs),
    bottom = Math.min(...ys),
    top = Math.max(...ys),
    pad = Math.max(right - left, top - bottom, 1) * 0.06;
  return { left: left - pad, right: right + pad, bottom, top: top + pad };
}

function worldVertices(particle) {
  const c = Math.cos(particle.angle),
    s = Math.sin(particle.angle);
  return Array.from({ length: particle.vertices.length / 2 }, (_, i) => {
    const x = particle.vertices[i * 2],
      y = particle.vertices[i * 2 + 1];
    return {
      x: particle.x + x * c - y * s,
      y: particle.y + x * s + y * c,
    };
  });
}

const turn = (a, b, c) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

function lowerHull(points) {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y),
    hull = [];
  for (const point of sorted) {
    while (hull.length > 1 && turn(hull.at(-2), hull.at(-1), point) <= 0)
      hull.pop();
    hull.push(point);
  }
  return hull;
}

export function addGroundConnectors(particles) {
  if (!particles.length || particles.length > 398) return [];
  const polygons = particles.map(worldVertices),
    all = polygons.flat(),
    floor = Math.min(...all.map((p) => p.y)),
    left = Math.min(...all.map((p) => p.x)),
    right = Math.max(...all.map((p) => p.x)),
    middle = (left + right) / 2,
    sizes = polygons
      .map((points) =>
        Math.sqrt(
          Math.abs(
            points.reduce(
              (area, p, i) =>
                area +
                p.x * points[(i + 1) % points.length].y -
                p.y * points[(i + 1) % points.length].x,
              0,
            ),
          ) / 2,
        ),
      )
      .sort((a, b) => a - b),
    typical = sizes[Math.floor(sizes.length / 2)],
    band = Math.max(typical * 0.3, (right - left) * 0.005),
    connectors = [];

  for (const side of [-1, 1]) {
    const candidates = polygons.filter((points) => {
        const minY = Math.min(...points.map((p) => p.y)),
          centreX = points.reduce((sum, p) => sum + p.x, 0) / points.length;
        return minY <= floor + band && (centreX - middle) * side > 0;
      }),
      lowPoints = candidates.flat().filter((p) => p.y <= floor + band + 1e-9);
    if (lowPoints.length < 2) continue;
    const top = lowerHull(lowPoints),
      x0 = top[0].x,
      x1 = top.at(-1).x;
    if (
      x1 - x0 < typical * 0.1 ||
      Math.max(...top.map((p) => p.y)) - floor < 1e-4
    )
      continue;
    const connector = particle(
      [
        { x: x0, y: floor },
        { x: x1, y: floor },
        ...top.reverse().filter((p) => p.y > floor + 1e-7),
      ],
      "#9b8b73",
    );
    connector.role = "ground-connector";
    connector.group = "regular";
    connectors.push(connector);
  }
  particles.push(...connectors);
  return connectors;
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    const cross = (point.x - a.x) * (b.y - a.y) - (point.y - a.y) * (b.x - a.x);
    if (
      Math.abs(cross) < 1e-8 &&
      point.x >= Math.min(a.x, b.x) - 1e-8 &&
      point.x <= Math.max(a.x, b.x) + 1e-8 &&
      point.y >= Math.min(a.y, b.y) - 1e-8 &&
      point.y <= Math.max(a.y, b.y) + 1e-8
    )
      return true;
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}

function importJson(text, { groundConnectors = false } = {}) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw Error("This is not a valid JSON file.");
  }
  if (data?.format !== FORMAT || data.version !== 1)
    throw Error("This JSON file was not produced by ALoTiA.");
  const model = data.model;
  if (!model || !Array.isArray(model.blocks) || !model.blocks.length)
    throw Error("The ALoTiA project contains no blocks.");
  if (model.blocks.length > 400) throw Error("The file contains more than 400 blocks.");
  if (model.frame?.coordinates !== "physical")
    throw Error("Scale the model in ALoTiA before importing it into UnBaAct.");
  const lengthScale = LENGTH_TO_METRES[data.system];
  const forceScale = FORCE_TO_NEWTONS[data.system];
  if (!lengthScale || !forceScale) throw Error("The ALoTiA unit system is not supported.");

  const groupColors = new Map(
    (model.groups ?? []).map((group) => [group.id, group.color]),
  );
  const outlines = model.blocks.map((block, index) => {
    if (
      !block ||
      !Array.isArray(block.x) ||
      !Array.isArray(block.y) ||
      block.x.length !== block.y.length ||
      block.x.length < 3
    )
      throw Error(`Block ${index + 1} has an invalid outline.`);
    return block.x.map((x, i) => ({
      x: finiteNumber(x) * lengthScale,
      y: finiteNumber(block.y[i]) * lengthScale,
    }));
  });
  const particles = outlines.map((outline, index) =>
    particle(
      outline,
      groupColors.get(model.blockGroups?.[index]) ?? COLORS[index % COLORS.length],
    ),
  );
  const forces = data.forces ?? {};
  for (let i = 0; i < (forces.points?.length ?? 0); i++) {
    const rawPoint = forces.points[i];
    if (!Array.isArray(rawPoint) || rawPoint.length !== 2) continue;
    const point = { x: rawPoint[0] * lengthScale, y: rawPoint[1] * lengthScale };
    let target = outlines.findIndex((outline) => pointInPolygon(point, outline));
    if (target < 0) {
      target = particles.reduce(
        (best, p, index) =>
          Math.hypot(point.x - p.x, point.y - p.y) < best.distance
            ? { index, distance: Math.hypot(point.x - p.x, point.y - p.y) }
            : best,
        { index: -1, distance: Infinity },
      ).index;
    }
    const rawY = Array.isArray(forces.magnitudes?.[i])
        ? forces.magnitudes[i][1]
        : forces.magnitudes?.[i],
      rawX = Array.isArray(forces.magnitudes?.[i])
        ? forces.magnitudes[i][0]
        : forces.x?.[i] ?? 0,
      load = Math.max(0, (Number(rawY) || 0) * forceScale),
      loadX = (Number(rawX) || 0) * forceScale;
    if (target >= 0 && load <= 1e6 && Math.abs(loadX) <= 1e6) {
      particles[target].load = (particles[target].load ?? 0) + load;
      particles[target].loadX = (particles[target].loadX ?? 0) + loadX;
    }
  }

  let thickness;
  let materialDensity;
  const areas = model.areas ?? [];
  const thicknesses = model.thickness ?? [];
  const weights = model.weights ?? [];
  if (
    areas.length === particles.length &&
    thicknesses.length === particles.length &&
    weights.length === particles.length &&
    [...areas, ...thicknesses, ...weights].every((v) => Number.isFinite(Number(v)))
  ) {
    const areaM2 = areas.map((a) => Number(a) * lengthScale ** 2);
    const volumes = areaM2.map((a, i) => a * Number(thicknesses[i]) * lengthScale);
    const totalArea = areaM2.reduce((a, b) => a + b, 0);
    const totalVolume = volumes.reduce((a, b) => a + b, 0);
    const totalMass = weights.reduce((sum, w) => sum + Number(w) * forceScale / 9.81, 0);
    if (totalArea > 0 && totalVolume > 0 && totalMass > 0) {
      thickness = totalVolume / totalArea;
      materialDensity = totalMass / totalVolume;
      if (!(thickness >= 0.01 && thickness <= 10)) thickness = undefined;
      if (!(materialDensity >= 0.001 && materialDensity <= 30000)) materialDensity = undefined;
    }
  }

  if (groundConnectors) addGroundConnectors(particles);

  return {
    particles,
    bounds: boundsFor(particles),
    thickness,
    materialDensity,
    source: "ALoTiA JSON",
  };
}

const ELEMENT_FACES = {
  C3D8: [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]],
  C3D6: [[0, 1, 2], [3, 4, 5], [0, 1, 4, 3], [1, 2, 5, 4], [2, 0, 3, 5]],
  C3D4: [[0, 1, 2], [0, 1, 3], [1, 2, 3], [2, 0, 3]],
};

function parseInpParts(text) {
  if (!/Generated by aLoTiA/i.test(text))
    throw Error("This INP file was not produced by ALoTiA.");
  const parts = [];
  let part = null,
    mode = null,
    elementType = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("**")) continue;
    if (line.startsWith("*")) {
      const partMatch = line.match(/^\*Part\s*,\s*name\s*=\s*([^,]+)/i);
      const elementMatch = line.match(/^\*Element\s*,\s*type\s*=\s*(C3D[468])/i);
      if (partMatch) {
        part = { name: partMatch[1].trim(), nodes: new Map(), elements: [] };
        parts.push(part);
        mode = null;
      } else if (/^\*End Part/i.test(line)) {
        part = null;
        mode = null;
      } else if (part && /^\*Node(?:\s|$)/i.test(line)) {
        mode = "nodes";
      } else if (part && elementMatch) {
        mode = "elements";
        elementType = elementMatch[1].toUpperCase();
      } else mode = null;
      continue;
    }
    if (!part || !mode) continue;
    const values = line.split(",").map((v) => Number(v.trim()));
    if (!values.every(Number.isFinite)) throw Error(`Invalid numeric row in ${part.name}.`);
    if (mode === "nodes" && values.length >= 4)
      part.nodes.set(values[0], values.slice(1, 4));
    if (mode === "elements" && values.length > 1)
      part.elements.push({ type: elementType, ids: values.slice(1) });
  }
  if (!parts.length) throw Error("The INP file contains no block parts.");
  if (parts.length > 400) throw Error("The INP file contains more than 400 block parts.");
  return parts;
}

function partOutlines(part, scale) {
  if (!part.nodes.size || !part.elements.length)
    throw Error(`${part.name} has no usable mesh.`);
  const coords = [...part.nodes.values()].flatMap((p) => [p[0], p[2]]);
  const span = Math.max(Math.max(...coords) - Math.min(...coords), 1);
  const tolerance = span * scale * 1e-8;
  const key = (p) => `${Math.round(p.x / tolerance)},${Math.round(p.y / tolerance)}`;
  const points = new Map();
  const cells = new Map();
  for (const element of part.elements) {
    if (!ELEMENT_FACES[element.type]) continue;
    const projected = [];
    for (const id of element.ids) {
      const node = part.nodes.get(id);
      if (!node) throw Error(`${part.name} references a missing node.`);
      const p = { x: node[0] * scale, y: node[2] * scale };
      const k = key(p);
      points.set(k, p);
      if (!projected.includes(k)) projected.push(k);
    }
    if (projected.length < 3) continue;
    const centre = projected.reduce(
      (sum, k) => ({ x: sum.x + points.get(k).x, y: sum.y + points.get(k).y }),
      { x: 0, y: 0 },
    );
    centre.x /= projected.length;
    centre.y /= projected.length;
    projected.sort(
      (a, b) =>
        Math.atan2(points.get(a).y - centre.y, points.get(a).x - centre.x) -
        Math.atan2(points.get(b).y - centre.y, points.get(b).x - centre.x),
    );
    cells.set([...projected].sort().join("|"), projected);
  }
  const edges = new Map();
  for (const cell of cells.values())
    for (let i = 0; i < cell.length; i++) {
      const a = cell[i],
        b = cell[(i + 1) % cell.length],
        id = a < b ? `${a}|${b}` : `${b}|${a}`;
      const edge = edges.get(id) ?? { a, b, count: 0 };
      edge.count++;
      edges.set(id, edge);
    }
  const boundary = [...edges.values()].filter((edge) => edge.count === 1);
  const adjacency = new Map();
  for (const { a, b } of boundary) {
    if (!adjacency.has(a)) adjacency.set(a, []);
    if (!adjacency.has(b)) adjacency.set(b, []);
    adjacency.get(a).push(b);
    adjacency.get(b).push(a);
  }
  if ([...adjacency.values()].some((neighbours) => neighbours.length !== 2))
    throw Error(`Could not reconstruct the outline of ${part.name}.`);
  const unused = new Set(adjacency.keys());
  const loops = [];
  while (unused.size) {
    const start = unused.values().next().value,
      loop = [];
    let previous = null,
      current = start;
    do {
      loop.push(points.get(current));
      unused.delete(current);
      const next = adjacency.get(current).find((candidate) => candidate !== previous);
      previous = current;
      current = next;
      if (loop.length > adjacency.size + 1) throw Error(`Broken outline in ${part.name}.`);
    } while (current !== start);
    loops.push(loop);
  }
  return loops;
}

function importInp(text, inpLengthUnit) {
  const scale = INP_LENGTH_TO_METRES[inpLengthUnit];
  if (!scale) throw Error("Choose the length unit used by the INP file.");
  const parts = parseInpParts(text);
  const outlines = parts.flatMap((part) => partOutlines(part, scale));
  if (outlines.length > 400) throw Error("The reconstructed model contains more than 400 blocks.");
  const particles = outlines.map((outline, index) =>
    particle(outline, COLORS[index % COLORS.length]),
  );
  particles.forEach((p) => decomposePolygon(p.vertices));
  return { particles, bounds: boundsFor(particles), source: "ALoTiA INP" };
}

export function importALoTiA(
  text,
  { fileName = "", inpLengthUnit = "m", groundConnectors = false } = {},
) {
  const source = String(text ?? "");
  if (!source.trim()) throw Error("The selected file is empty.");
  if (/\.inp$/i.test(fileName) || /^\s*\*Heading/im.test(source)) {
    const imported = importInp(source, inpLengthUnit);
    if (groundConnectors) {
      addGroundConnectors(imported.particles);
      imported.bounds = boundsFor(imported.particles);
    }
    return imported;
  }
  return importJson(source, { groundConnectors });
}
