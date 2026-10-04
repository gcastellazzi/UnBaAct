import { FOUNDATION_DEFAULTS, solveFoundation } from "./foundation.js";

const fields = [
  ["length", "Wall length L (m)", 1, 0.1],
  ["height", "Wall height H (m)", 1, 0.1],
  ["thickness", "Wall thickness t (m)", 1, 0.05],
  ["young", "Equivalent E (MPa)", 1e6, 100],
  ["density", "Density (kg/m³)", 1, 100],
  ["gravity", "Gravity (m/s²)", 1, 0.01],
  ["k", "Soil modulus k (kN/m³)", 1000, 1000],
  ["shear", "Shear parameter G (kN/m)", 1000, 100],
  ["q", "Extra uniform load q (kN/m)", 1000, 1],
  ["point", "Downward point load P (kN)", 1000, 10],
  ["position", "Point position x (m)", 1, 0.1],
  ["elements", "Beam elements", 1, 10],
];
export const foundationHTML = `<section id="foundationControls" hidden>
  <h3>Wall on elastic foundation</h3>
  <p class="hint">Independent equivalent wall model. Set its geometry and loads below. The rigid-block scene is preserved.</p>
  <label>Foundation model<select id="foundationModel"><option value="winkler">Winkler · independent springs</option><option value="pasternak">Pasternak · coupled springs</option></select></label>
  <div class="foundation-fields">${fields.map(([key, label, unit, step]) => `<label>${label}<input id="foundation-${key}" type="number" min="${["density", "gravity", "shear", "q", "point", "position"].includes(key) ? 0 : key === "elements" ? 4 : 0.000001}" ${key === "elements" ? 'max="200"' : ''} step="${step}" value="${FOUNDATION_DEFAULTS[key]/unit}"></label>`).join("")}</div>
  <button id="runFoundation" class="primary">Calculate foundation response</button>
  <button id="resetFoundation">Load wall example</button>
  <button id="exportFoundation" disabled>Export diagrams · CSV</button>
  <p id="foundationStatus" class="hint" role="status"></p>
  <p class="hint">Linear elastic Euler–Bernoulli wall, I = tH³/12; free ends. Soil acts over width t. Small deflections, bilateral springs (tension allowed); no cracking or soil detachment.</p>
</section>`;

export function setupFoundation(view, { pause }) {
  const $ = (s) => document.querySelector(s);
  let result = null;
  view.innerHTML = `<div class="foundation-summary" id="foundationSummary" role="status"></div>
    <canvas id="foundationSketch" aria-label="Wall deformation over a bed of springs"></canvas>
    <div class="foundation-charts">${[
      ["w", "Settlement w (mm) · positive down"],
      ["reaction", "Soil reaction r (kN/m) · positive up"],
      ["moment", "Bending moment M (kN·m) · sagging positive"],
      ["shear", "Beam shear V (kN) · V = dM/dx"],
    ].map(([key, title]) => `<figure><figcaption>${title}</figcaption><canvas id="foundation-chart-${key}" aria-label="${title}"></canvas></figure>`).join("")}</div>
    <p class="hint foundation-note">r = ktw − Gtw″; Winkler uses G = 0. Pasternak also transmits edge forces from its finite shear layer. Diagram scales are independent; the wall deformation is magnified.</p>`;

  function calculate() {
    pause();
    try {
      const input = { model: $("#foundationModel").value };
      for (const [key, , unit] of fields) {
        const raw = $("#foundation-" + key).value;
        if (!raw.trim()) throw Error("Fill in all foundation parameters.");
        input[key] = Number(raw)*unit;
      }
      result = solveFoundation(input);
      $("#foundationStatus").textContent = "Calculated with current parameters.";
      $("#exportFoundation").disabled = false;
      render();
    } catch (error) {
      result = null;
      $("#exportFoundation").disabled = true;
      $("#foundationStatus").textContent = error.message;
      render();
    }
  }
  function dirty() {
    result = null;
    $("#exportFoundation").disabled = true;
    $("#foundationStatus").textContent = "Parameters changed. Calculate to update the diagrams.";
    render();
  }
  function modelChanged() {
    $("#foundation-shear").disabled = $("#foundationModel").value === "winkler";
  }
  $("#foundationModel").onchange = () => { modelChanged(); dirty(); };
  for (const [key] of fields) $("#foundation-" + key).oninput = dirty;
  $("#runFoundation").onclick = calculate;
  $("#resetFoundation").onclick = () => {
    for (const [key, , unit] of fields) $("#foundation-" + key).value = FOUNDATION_DEFAULTS[key]/unit;
    $("#foundationModel").value = FOUNDATION_DEFAULTS.model;
    modelChanged();
    calculate();
  };
  $("#exportFoundation").onclick = () => {
    if (!result) return;
    const rows = ["x_m,settlement_m,rotation_rad,reaction_N_per_m,moment_Nm,shear_N"];
    for (const s of result.samples) rows.push([s.x, s.w, s.rotation, s.reaction, s.moment, s.shear].join(","));
    const url = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `wall-${result.parameters.model}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  function render() {
    if (view.hidden || view.closest("[hidden]")) return;
    $("#foundationSummary").textContent = result
      ? `${result.parameters.model === "winkler" ? "Winkler" : "Pasternak"} · max settlement ${(result.maxSettlement*1000).toFixed(3)} mm · load ${(result.totalLoad/1000).toFixed(2)} kN · reaction ${(result.totalReaction/1000).toFixed(2)} kN · balance error ${(result.balanceError*100).toExponential(1)}%` +
        (result.gp ? ` · layer edge reactions ${result.edgeReactions.map((r) => (r/1000).toFixed(2)).join(" / ")} kN` : "") +
        (result.minReaction < -1e-5 || result.samples.some((s) => s.w < -1e-8) ? " · Tension/uplift present: bilateral model." : "")
      : "Set the wall and soil parameters, then calculate the response.";
    drawSketch($("#foundationSketch"), result);
    for (const [key, unit, color] of [["w", 1000, "#1c769c"], ["reaction", .001, "#4d7d3a"], ["moment", .001, "#b04468"], ["shear", .001, "#8c5a2b"]])
      drawDiagram($("#foundation-chart-" + key), result, key, unit, color);
  }
  modelChanged();
  new ResizeObserver(render).observe(view);
  return { render, calculate };
}

function context(canvas) {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(w*dpr);
  canvas.height = Math.round(h*dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.font = "11px system-ui";
  ctx.fillStyle = "#5d6f6a";
  return { ctx, w, h };
}
function number(v) {
  return v === 0 ? "0" : Math.abs(v) < .01 || Math.abs(v) >= 10000 ? v.toExponential(1) : Number(v.toPrecision(3)).toString();
}
function drawDiagram(canvas, result, key, unit, color) {
  const { ctx, w, h } = context(canvas);
  if (!result || w < 80) return;
  const samples = result.samples;
  const values = samples.map((s) => s[key]*unit);
  let lo = Math.min(0, ...values), hi = Math.max(0, ...values);
  const range = hi - lo || 1;
  lo -= range*.08; hi += range*.08;
  const pad = { l: 65, r: 18, t: 16, b: 34 };
  const X = (x) => pad.l + x/result.parameters.length*(w - pad.l - pad.r);
  const Y = (y) => h - pad.b - (y - lo)/(hi - lo)*(h - pad.t - pad.b);
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const v = lo + (hi - lo)*i/4, x = result.parameters.length*i/4;
    ctx.strokeStyle = "#dce5df";
    ctx.beginPath(); ctx.moveTo(pad.l, Y(v)); ctx.lineTo(w - pad.r, Y(v)); ctx.stroke();
    ctx.textAlign = "right"; ctx.fillText(number(v), pad.l - 7, Y(v) + 4);
    ctx.textAlign = "center"; ctx.fillText(number(x), X(x), h - pad.b + 16);
  }
  ctx.strokeStyle = "#93a69a";
  ctx.beginPath(); ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, h - pad.b);
  ctx.moveTo(pad.l, Y(0)); ctx.lineTo(w - pad.r, Y(0)); ctx.stroke();
  ctx.fillText("x (m)", (pad.l + w - pad.r)/2, h - 3);
  ctx.strokeStyle = color; ctx.lineWidth = 2;
  ctx.beginPath();
  samples.forEach((s, i) => i ? ctx.lineTo(X(s.x), Y(values[i])) : ctx.moveTo(X(s.x), Y(values[i])));
  ctx.stroke();
}
function drawSketch(canvas, result) {
  const { ctx, w, h } = context(canvas);
  if (!result || w < 80) return;
  const p = result.parameters, left = 40, span = w - 80;
  const base = h*.48, ground = h - 24, wallHeight = Math.min(48, h*.24);
  const peak = Math.max(1e-12, ...result.samples.map((s) => Math.abs(s.w)));
  const amplify = 24/peak;
  const X = (x) => left + x/p.length*span;
  const at = (x) => result.samples.reduce((a, s) => Math.abs(s.x - x) < Math.abs(a.x - x) ? s : a);
  ctx.strokeStyle = "#abbcb1"; ctx.setLineDash([4, 4]);
  ctx.strokeRect(left, base - wallHeight, span, wallHeight); ctx.setLineDash([]);
  ctx.strokeStyle = "#779b7c";
  ctx.beginPath(); ctx.moveTo(left - 10, ground); ctx.lineTo(w - left + 10, ground); ctx.stroke();
  for (let i = 0; i <= 20; i++) {
    const x = p.length*i/20, xx = X(x), y = base + at(x).w*amplify;
    ctx.beginPath(); ctx.moveTo(xx, y);
    for (let j = 1; j <= 6; j++) ctx.lineTo(xx + (j % 2 ? 3 : -3), y + (ground - y)*j/7);
    ctx.lineTo(xx, ground); ctx.stroke();
  }
  if (p.model === "pasternak") {
    ctx.strokeStyle = "#4d7d3a"; ctx.lineWidth = 3;
    ctx.beginPath(); result.samples.forEach((s, i) => i ? ctx.lineTo(X(s.x), base + s.w*amplify + 7) : ctx.moveTo(X(s.x), base + s.w*amplify + 7)); ctx.stroke();
  }
  ctx.fillStyle = "#dec1a0"; ctx.strokeStyle = "#8c5a2b"; ctx.lineWidth = 1.5;
  ctx.beginPath();
  result.samples.forEach((s, i) => i ? ctx.lineTo(X(s.x), base + s.w*amplify) : ctx.moveTo(X(s.x), base + s.w*amplify));
  [...result.samples].reverse().forEach((s) => ctx.lineTo(X(s.x), base - wallHeight + s.w*amplify));
  ctx.closePath(); ctx.fill(); ctx.stroke();
  const arrow = (x, y, size) => {
    ctx.beginPath(); ctx.moveTo(x, y - size); ctx.lineTo(x, y);
    ctx.moveTo(x - 4, y - 6); ctx.lineTo(x, y); ctx.lineTo(x + 4, y - 6); ctx.stroke();
  };
  ctx.strokeStyle = "#3479c9";
  if (p.q + result.selfWeight > 0) for (let i = 1; i < 12; i++) {
    const x = p.length*i/12;
    arrow(X(x), base - wallHeight + at(x).w*amplify - 3, 17);
  }
  if (p.point > 0) { ctx.lineWidth = 3; arrow(X(p.position), base - wallHeight + at(p.position).w*amplify - 4, 32); }
  ctx.fillStyle = "#5d6f6a"; ctx.textAlign = "left";
  ctx.fillText(`L = ${p.length} m · H = ${p.height} m · t = ${p.thickness} m · dashed: undeformed`, left, h - 7);
}
