// Euler–Bernoulli wall on a finite, bilateral Winkler/Pasternak foundation.
// SI units. Energy: 1/2 ∫ [EI w''² + (k t) w² + (G t) w'²] dx.
// Free ends: EI w'' = 0 and EI w''' - G t w' = 0.
// Cubic Hermite elements, exact four-point Gauss integration of stiffness.
export const FOUNDATION_DEFAULTS = Object.freeze({
  model: "winkler", length: 10, height: 2, thickness: 0.3,
  young: 1.5e9, density: 1800, gravity: 9.81,
  k: 20e6, shear: 1e6, q: 10000, point: 100000, position: 5, elements: 80,
});

const GAUSS = [
  [-0.8611363115940526, 0.3478548451374538],
  [-0.3399810435848563, 0.6521451548625461],
  [0.3399810435848563, 0.6521451548625461],
  [0.8611363115940526, 0.3478548451374538],
];

function shape(s, h) {
  return {
    n: [1 - 3*s*s + 2*s**3, h*(s - 2*s*s + s**3), 3*s*s - 2*s**3, h*(-s*s + s**3)],
    d: [(-6*s + 6*s*s)/h, 1 - 4*s + 3*s*s, (6*s - 6*s*s)/h, -2*s + 3*s*s],
    dd: [(-6 + 12*s)/h**2, (-4 + 6*s)/h, (6 - 12*s)/h**2, (-2 + 6*s)/h],
    ddd: [12/h**3, 6/h**2, -12/h**3, 6/h**2],
  };
}
const dot = (a, b) => a.reduce((sum, v, i) => sum + v*b[i], 0);

function solveSPD(a, f) {
  const n = f.length;
  const scale = a.map((row, i) => Math.sqrt(row[i]));
  const l = Array.from({ length: n }, () => new Float64Array(n));
  // Diagonal scaling avoids mixing metres and rotations in the factorisation.
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let v = a[i][j] / (scale[i]*scale[j]);
      for (let k = 0; k < j; k++) v -= l[i][k]*l[j][k];
      if (i === j) {
        if (!(v > 1e-14)) throw Error("Ill-conditioned foundation: adjust stiffness or mesh size.");
        l[i][j] = Math.sqrt(v);
      } else l[i][j] = v/l[j][j];
    }
  }
  const u = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let v = f[i]/scale[i];
    for (let j = 0; j < i; j++) v -= l[i][j]*u[j];
    u[i] = v/l[i][i];
  }
  for (let i = n - 1; i >= 0; i--) {
    let v = u[i];
    for (let j = i + 1; j < n; j++) v -= l[j][i]*u[j];
    u[i] = v/l[i][i];
  }
  return u.map((v, i) => v/scale[i]);
}

export function solveFoundation(input = {}) {
  const p = { ...FOUNDATION_DEFAULTS, ...input };
  if (!["winkler", "pasternak"].includes(p.model)) throw Error("Unknown foundation model.");
  for (const key of ["length", "height", "thickness", "young", "k"])
    if (!Number.isFinite(p[key]) || p[key] <= 0) throw Error(`${key} must be positive and finite.`);
  for (const key of ["density", "gravity", "shear", "q", "point"])
    if (!Number.isFinite(p[key]) || p[key] < 0) throw Error(`${key} must be nonnegative and finite.`);
  if (!Number.isFinite(p.position) || p.position < 0 || p.position > p.length)
    throw Error("Point load position must lie within the wall length.");
  if (!Number.isInteger(p.elements) || p.elements < 4 || p.elements > 200)
    throw Error("Use 4–200 beam elements.");
  const h = p.length/p.elements, n = 2*(p.elements + 1);
  const EI = p.young*p.thickness*p.height**3/12;
  const kw = p.k*p.thickness, gp = p.model === "pasternak" ? p.shear*p.thickness : 0;
  const selfWeight = p.density*p.gravity*p.thickness*p.height;
  const q = p.q + selfWeight;
  if (![EI, kw, gp, q].every(Number.isFinite)) throw Error("Parameters exceed the numerical range.");
  const a = Array.from({ length: n }, () => new Float64Array(n));
  const f = new Float64Array(n);
  for (let e = 0; e < p.elements; e++) {
    for (const [xi, weight] of GAUSS) {
      const b = shape((xi + 1)/2, h), dx = weight*h/2;
      for (let i = 0; i < 4; i++) {
        f[2*e + i] += q*b.n[i]*dx;
        for (let j = 0; j < 4; j++)
          a[2*e + i][2*e + j] += (EI*b.dd[i]*b.dd[j] + kw*b.n[i]*b.n[j] + gp*b.d[i]*b.d[j])*dx;
      }
    }
  }
  const ep = Math.min(p.elements - 1, Math.floor(p.position/h));
  const np = shape((p.position - ep*h)/h, h).n;
  for (let i = 0; i < 4; i++) f[2*ep + i] += p.point*np[i];
  const u = solveSPD(a, f);
  const samples = [];
  let distributedReaction = 0, reactionMoment = 0;
  for (let e = 0; e < p.elements; e++) {
    const ue = u.slice(2*e, 2*e + 4);
    for (const [xi, weight] of GAUSS) {
      const s = (xi + 1)/2, b = shape(s, h), x = (e + s)*h;
      const r = kw*dot(b.n, ue) - gp*dot(b.dd, ue);
      distributedReaction += r*weight*h/2;
      reactionMoment += x*r*weight*h/2;
    }
    // Keep both sides of element boundaries to expose shear discontinuities.
    for (let j = 0; j <= 4; j++) {
      const b = shape(j/4, h);
      const w = dot(b.n, ue), rotation = dot(b.d, ue), curvature = dot(b.dd, ue);
      samples.push({ x: (e + j/4)*h, w, rotation,
        reaction: kw*w - gp*curvature, moment: -EI*curvature, shear: -EI*dot(b.ddd, ue) });
    }
  }
  const edgeReactions = [-gp*u[1], gp*u[n - 1]];
  const totalReaction = distributedReaction + edgeReactions[0] + edgeReactions[1];
  reactionMoment += p.length*edgeReactions[1];
  const totalLoad = q*p.length + p.point;
  const appliedMoment = q*p.length**2/2 + p.point*p.position;
  const balanceError = Math.abs(totalReaction - totalLoad)/Math.max(1, totalLoad);
  if (!samples.every((s) => Object.values(s).every(Number.isFinite)) || balanceError > 1e-5)
    throw Error("Numerical balance failed: adjust stiffness or mesh size.");
  return { parameters: p, EI, kw, gp, selfWeight, samples, edgeReactions,
    totalLoad, totalReaction, balanceError,
    momentError: Math.abs(reactionMoment - appliedMoment)/Math.max(1, totalLoad*p.length),
    maxSettlement: Math.max(...samples.map((s) => s.w)),
    minReaction: Math.min(...samples.map((s) => s.reaction)),
  };
}
