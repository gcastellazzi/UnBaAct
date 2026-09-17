// Scalar contact-load indicator, not stress or pressure: half the incident
// normal-force magnitudes plus weight and externally applied load.
export function blockLoads(items, contacts, gravity) {
  const loads = new Map(
    items.map((i) => [
      i.id,
      (i.body.mass() * gravity + Math.hypot(i.loadX || 0, i.load || 0)) / 2,
    ]),
  );
  for (const c of contacts) {
    loads.set(c.a.id, (loads.get(c.a.id) || 0) + c.fn / 2);
    if (c.b) loads.set(c.b.id, (loads.get(c.b.id) || 0) + c.fn / 2);
  }
  return loads;
}
export function loadShade(value, reference) {
  const fraction = Math.max(0, Math.min(1, value / Math.max(reference, 1e-9)));
  const gray = Math.round(248 - 215 * fraction);
  return `rgb(${gray}, ${gray}, ${gray})`;
}
