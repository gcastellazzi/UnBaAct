import { BASE_DEFAULTS, baseLayout, validateBase } from "./elastic-base.js";

const fields = [
  ["rows", "Masonry courses", 1, 1], ["course", "Course height (m)", 1, .05],
  ["blockWidth", "Block width (m)", 1, .1], ["margin", "Footing overhang (m)", 1, .1],
  ["k", "Soil k (kN/m³)", 1000, 100], ["shear", "Soil G (kN/m)", 1000, 100],
  ["EI", "Transfer beam EI (kN·m²)", 1000, 1], ["depth", "Transfer depth (m)", 1, .05],
  ["density", "Transfer density (kg/m³)", 1, 100], ["damping", "Damping ratio", 1, .1],
  ["segments", "Full-span mesh divisions", 1, 2],
  ["zoneFraction", "Elastic region width (%)", .01, 5],
];
export function setupElasticBaseControls({ apply, remove, message }) {
  const $ = (s) => document.querySelector(s);
  $("#corners").insertAdjacentHTML("afterend", `<details id="baseTools" class="joint-tools">
  <summary>Foundation & elastic soil</summary>
  <p class="hint">Add a footing below the current wall. Apply restarts the trial from its initial geometry.</p>
  <label>Settlement test wall<select id="settlementBond"><option value="staggered">Staggered joints</option><option value="stacked">Aligned joints</option><option value="irregular">Irregular stones</option></select></label>
  <button id="loadSettlementExample">Load settlement wall · new scene</button>
  <label>Footing masonry<select id="base-pattern"><option value="bricks">Regular bricks · staggered</option><option value="regular-stone">Regular stones · staggered</option><option value="irregular-stone">Irregular stones</option><option value="none">No masonry · wall directly on beam</option></select></label>
  <label>Soil model<select id="base-model"><option value="winkler">Winkler</option><option value="pasternak">Pasternak</option></select></label>
  <label>Elastic region<select id="base-zone"><option value="full">Full foundation</option><option value="center">Settlement · central region</option><option value="left">Settlement · left region</option><option value="right">Settlement · right region</option></select></label>
  ${fields.map(([key, label, unit, step]) => `<label>${label}<input id="base-${key}" type="number" step="${step}" value="${BASE_DEFAULTS[key]/unit}"></label>`).join("")}
  <p class="hint">Footing blocks use the scene thickness, density and friction groups. The transfer beam has its own density and EI.</p>
  <p class="hint">Outside the elastic region the base stays rigid. Region width is rounded to the mesh (at least three strips). The local transfer layer has free bending ends; it does not bridge the rigid/elastic interface.</p>
  <button id="applyBase" class="primary">Apply / replace foundation</button>
  <button id="removeBase" disabled>Remove footing · rigid floor</button>
  <p id="baseStatus" class="hint" role="status">Rigid floor active.</p>
  <p class="hint">Vertical elastic transfer beam, small deflections; soil springs can carry tension. Masonry contacts allow separation and sliding. Horizontal beam motion is restrained.</p>
  </details>`);
  function enableFields() {
    $("#base-shear").disabled = $("#base-model").value === "winkler";
    $("#base-zoneFraction").disabled = $("#base-zone").value === "full";
    for (const key of ["rows", "course", "blockWidth"])
      $("#base-" + key).disabled = $("#base-pattern").value === "none";
  }
  $("#base-pattern").onchange = enableFields;
  $("#base-model").onchange = enableFields;
  $("#base-zone").onchange = enableFields;
  $("#applyBase").onclick = () => {
    try {
      const input = { pattern: $("#base-pattern").value, model: $("#base-model").value, zone: $("#base-zone").value, seed: +$("#seed").value };
      for (const [key, , unit] of fields) {
        if (!$("#base-" + key).value.trim()) throw Error("Fill in all foundation parameters.");
        input[key] = Number($("#base-" + key).value)*unit;
      }
      apply(input);
    } catch (error) { message(error.message); $("#baseStatus").textContent = error.message; }
  };
  $("#removeBase").onclick = remove;
  enableFields();
  return {
    sync(config) {
      $("#removeBase").disabled = !config;
      const zone = config ? baseLayout(validateBase(config)) : null;
      $("#baseStatus").textContent = config ? `${config.model === "winkler" ? "Winkler" : "Pasternak"} active · ${zone.n} elastic strips · ${config.zone ?? "full"} region (${(100*(zone.right-zone.left)/(config.right-config.left)).toFixed(1)}%). Press Play or run collapse analysis.` : "Rigid floor active.";
      if (config) {
        for (const [key, , unit] of fields) $("#base-" + key).value = (config[key] ?? BASE_DEFAULTS[key])/unit;
        $("#base-pattern").value = config.pattern;
        $("#base-model").value = config.model;
        $("#base-zone").value = config.zone ?? "full";
      }
      enableFields();
    },
  };
}

export function drawElasticBase(ctx, base, screen, scale) {
  if (!base) return;
  const ground = base.p.top - base.p.depth - .45;
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#719078";
  const l = screen({ x: base.left, y: ground }), r = screen({ x: base.right, y: ground });
  ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(r.x, r.y); ctx.stroke();
  for (const patch of base.rigid) {
    const a = screen({ x: patch.left, y: base.p.top }), b = screen({ x: patch.right, y: base.p.top - .2 });
    ctx.fillStyle = "#7d928e"; ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    ctx.strokeStyle = "#506a63";
    for (let x = a.x + 5; x < b.x; x += 12) {
      ctx.beginPath(); ctx.moveTo(x, b.y); ctx.lineTo(Math.max(a.x, x - 6), b.y + 6); ctx.stroke();
    }
  }
  for (const strip of base.strips) {
    const pos = strip.body.translation(), top = screen({ x: pos.x, y: pos.y + base.p.depth/2 });
    const foot = screen({ x: pos.x, y: pos.y - base.p.depth/2 });
    const g = screen({ x: pos.x, y: ground });
    ctx.strokeStyle = "#719078";
    ctx.beginPath(); ctx.moveTo(foot.x, foot.y);
    for (let j = 1; j <= 6; j++) ctx.lineTo(foot.x + (j % 2 ? 3 : -3), foot.y + (g.y - foot.y)*j/7);
    ctx.lineTo(g.x, g.y); ctx.stroke();
    ctx.fillStyle = "#537c88";
    ctx.fillRect(top.x - base.h*scale/2, top.y, base.h*scale, base.p.depth*scale);
    ctx.strokeStyle = "#345766";
    ctx.strokeRect(top.x - base.h*scale/2, top.y, base.h*scale, base.p.depth*scale);
  }
  if (base.p.model === "pasternak") {
    ctx.strokeStyle = "#397543"; ctx.lineWidth = 2;
    ctx.beginPath();
    base.strips.forEach((s, i) => {
      const p = screen({ x: s.x, y: s.body.translation().y - base.p.depth/2 - .05 });
      if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
    });
    ctx.stroke();
  }
}
