import {
  PATTERNS,
  collapseAnalysis,
  tieComparison,
  collapseGain,
  equilibriumReport,
} from "./collapse.js";
import { ANALYSIS_EXAMPLES } from "./analysis-examples.js";
import { foundationHTML, setupFoundation } from "./foundation-ui.js";

const $ = (s) => document.querySelector(s);
const fmt = (v, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : "—");
const pct = (v) => (Number.isFinite(v) ? (v * 100).toFixed(2) + "%" : "—");

export const analysisHTML = `<section class="analysis-block"><h3>Test examples</h3><label>Structure<select id="analysisExample">${ANALYSIS_EXAMPLES.map(
  (e) => `<option value="${e.id}">${e.name}</option>`,
).join(
  "",
)}</select></label><button id="loadAnalysisExample">▦ Load example + analysis settings</button><p id="analysisExampleDescription" class="hint">${ANALYSIS_EXAMPLES[0].description}</p></section><div class="divider"></div><section class="analysis-block"><h3>Equilibrium check · current state</h3><div id="equilibriumReport" class="equilibrium-report"><p class="hint">Press Play (or run an analysis) to compute contact forces.</p></div></section><div class="divider"></div><section class="analysis-block"><h3>Collapse multiplier λ</h3><label>Load pattern<select id="actionPattern">${Object.entries(
  PATTERNS,
)
  .map(([id, name]) => `<option value="${id}">${name}</option>`)
  .join(
    "",
  )}</select></label><div class="pair"><label>Direction<select id="actionDirection"><option value="1">→ right</option><option value="-1">← left</option></select></label><label>λ max<input id="lambdaMax" type="number" min=".01" max="100" step=".1" value="1"></label></div><div class="pair"><label>Load steps<input id="lambdaSteps" type="number" min="2" max="100" step="1" value="20"></label><label>Collapse δ (% block)<input id="collapseLimit" type="number" min="1" max="200" step="1" value="25"></label></div><p id="patternHint" class="hint"></p><div class="pair"><button id="runCollapse" class="primary">▶ Run analysis</button><button id="runComparison" title="Same scene without ties (pre) and with its ties (post)">Pre / post ties</button></div><button id="cancelAnalysis" disabled>Cancel</button><p id="analysisProgress" class="hint" role="status"></p><div id="analysisResults" class="analysis-results"></div><canvas id="collapseCurve" aria-label="Load multiplier versus displacement"></canvas><label class="check"><input id="showMechanism" type="checkbox" checked> Show collapse mechanism on canvas</label><button id="clearResults" class="subtle">Clear results</button></section><div class="divider"></div><section class="analysis-block"><h3>Apply λ · pattern to the scene</h3><div class="pair"><label>λ<input id="sceneLambda" type="number" min="0" max="100" step=".01" value="0.1"></label><button id="applyAction">Apply</button></div><button id="clearAction">Remove pattern load</button><p class="hint">Adds λ × pattern forces at each block centre (heights frozen when applied); press Play to watch the response.</p></section>`;

const HINTS = {
  uniform:
    "F_i = λ·m_i·g horizontal. λ = collapse acceleration / g (α₀ in the kinematic approach of masonry codes).",
  triangular:
    "F_i = λ·W_i·z_i·ΣW/Σ(W·z): inverse triangular first-mode distribution with the same total base shear λ·ΣW. z from the floor.",
  gravity:
    "Additional self-weight λ·W_i. Rigid no-tension blocks under gravity alone are scale-invariant: collapse appears only with applied loads, ties or numerical effects.",
  loads:
    "Applied block loads (Block tab) multiplied by λ, self-weight constant: live-load collapse multiplier.",
};

export function setupAnalysis({ scene, sim, pause, message }) {
  const tab = $("#tab-analysis");
  const mechanismControls = document.createElement("div");
  mechanismControls.id = "mechanismControls";
  mechanismControls.append(...tab.childNodes);
  tab.append(mechanismControls);
  tab.insertAdjacentHTML("afterbegin", '<label>Analysis type<select id="analysisType"><option value="mechanisms">Rigid-block mechanisms · collapse</option><option value="foundation">Wall on elastic foundation</option></select></label>');
  tab.insertAdjacentHTML("beforeend", foundationHTML);
  const stage = document.createElement("section");
  stage.id = "analysisStage";
  stage.hidden = true;
  stage.setAttribute("aria-label", "Analysis diagrams");
  stage.innerHTML = '<div class="analysis-stage-heading"><strong id="analysisStageTitle">Mechanism · load–displacement curves</strong><button id="expandAnalysis" aria-pressed="false">Expand graphs</button></div><div id="mechanismGraphs"><p id="curveEmpty" class="hint">Run an analysis to display load–displacement curves here. The collapse mechanism is shown in the scene above.</p></div><div id="foundationGraphs" hidden></div>';
  $(".canvas-wrap").after(stage);
  $("#mechanismGraphs").append($("#collapseCurve"));
  const foundation = setupFoundation($("#foundationGraphs"), { pause });
  function layout() {
    const active = !tab.hidden;
    const soil = $("#analysisType").value === "foundation";
    stage.hidden = !active;
    mechanismControls.hidden = soil;
    $("#foundationControls").hidden = !soil;
    $("#mechanismGraphs").hidden = soil;
    $("#foundationGraphs").hidden = !soil;
    $("#analysisStageTitle").textContent = soil ? "Wall on elastic foundation" : "Mechanism · load–displacement curves";
    $("#expandAnalysis").hidden = soil;
    $(".workspace").classList.toggle("analysis-active", active);
    $(".scene-panel").classList.toggle("analysis-active", active);
    $(".scene-panel").classList.toggle("foundation-active", active && soil);
    $(".scene-panel").classList.toggle("graphs-expanded", active && !soil && $("#expandAnalysis").getAttribute("aria-pressed") === "true");
    drawCurve();
    foundation.render();
  }
  $("#analysisType").onchange = () => { pause(); layout(); };
  document.addEventListener("inspectorchange", layout);
  $("#expandAnalysis").onclick = () => {
    const on = $("#expandAnalysis").getAttribute("aria-pressed") !== "true";
    $("#expandAnalysis").setAttribute("aria-pressed", String(on));
    $("#expandAnalysis").textContent = on ? "Show mechanism + graphs" : "Expand graphs";
    layout();
  };
  new ResizeObserver(() => { drawCurve(); }).observe($("#mechanismGraphs"));
  let controller = null;
  const results = [];
  const state = { mechanism: null };
  const hint = () =>
    ($("#patternHint").textContent = HINTS[$("#actionPattern").value]);
  $("#actionPattern").onchange = () => {
    const vertical = ["gravity", "loads"].includes($("#actionPattern").value);
    $("#actionDirection").disabled = vertical;
    $("#lambdaMax").value = vertical ? 10 : 1;
    hint();
  };
  hint();
  $("#analysisExample").onchange = () =>
    ($("#analysisExampleDescription").textContent = ANALYSIS_EXAMPLES.find(
      (e) => e.id === $("#analysisExample").value,
    ).description);
  const options = () => {
    const lambdaMax = +$("#lambdaMax").value,
      steps = Math.round(+$("#lambdaSteps").value),
      limit = +$("#collapseLimit").value;
    if (
      !(lambdaMax > 0 && lambdaMax <= 100) ||
      !(steps >= 2 && steps <= 100) ||
      !(limit >= 1 && limit <= 200)
    )
      throw Error("Use λ max 0–100, 2–100 steps and δ limit 1–200%.");
    return {
      pattern: $("#actionPattern").value,
      direction: +$("#actionDirection").value,
      lambdaMax,
      steps,
      limitFactor: limit / 100,
    };
  };
  const busy = (on) => {
    for (const id of ["runCollapse", "runComparison", "applyAction"])
      $("#" + id).disabled = on;
    $("#cancelAnalysis").disabled = !on;
    $("#analysisType").disabled = on;
  };
  async function run(compare) {
    let opts;
    try {
      opts = options();
    } catch (error) {
      message(error.message);
      return;
    }
    const s = scene();
    if (!s.specs.length) {
      message("The scene is empty.");
      return;
    }
    if (compare && !s.ties.length) {
      message("Add ties first: the comparison runs without (pre) and with (post) them.");
      return;
    }
    const walls =
      ["uniform", "triangular"].includes(opts.pattern) &&
      s.config.boundary !== "free" &&
      (s.config.leftWall || s.config.rightWall);
    if (walls)
      message(
        "Side walls/supports are active and restrain lateral mechanisms. Use Boundary → Open sides for a free-standing wall.",
      );
    pause();
    controller = new AbortController();
    busy(true);
    const started = performance.now();
    try {
      const onProgress = (p) =>
        ($("#analysisProgress").textContent = `${p.phase} …`);
      const common = { ...opts, signal: controller.signal, onProgress };
      if (compare) {
        const { pre, post, gain } = await tieComparison(s, common);
        pre.label = "Pre · no ties";
        post.label = `Post · ${post.ties} ties`;
        post.gain = gain;
        pre.walls = post.walls = walls;
        results.push(pre, post);
        state.mechanism = post.mechanism ?? pre.mechanism;
      } else {
        const r = await collapseAnalysis(s, common);
        r.walls = walls;
        r.label = `${r.ties ? r.ties + " ties" : "No ties"}`;
        const base = results.findLast(
          (q) => !q.ties && q.pattern === r.pattern && q.direction === r.direction,
        );
        if (r.ties && base) r.gain = collapseGain(base, r);
        results.push(r);
        state.mechanism = r.mechanism;
      }
      $("#analysisProgress").textContent = `Completed in ${((performance.now() - started) / 1000).toFixed(1)} s.`;
    } catch (error) {
      $("#analysisProgress").textContent = error.message;
    } finally {
      controller = null;
      busy(false);
      render();
    }
  }
  $("#runCollapse").onclick = () => run(false);
  $("#runComparison").onclick = () => run(true);
  $("#cancelAnalysis").onclick = () => controller?.abort();
  $("#clearResults").onclick = () => {
    results.length = 0;
    state.mechanism = null;
    render();
  };
  $("#applyAction").onclick = () => {
    const lambda = +$("#sceneLambda").value;
    if (!(lambda >= 0 && lambda <= 100)) {
      message("Use λ between 0 and 100.");
      return;
    }
    sim().setAction($("#actionPattern").value, lambda, +$("#actionDirection").value);
    message(`Pattern load applied with λ = ${lambda}. Press Play.`);
  };
  $("#clearAction").onclick = () => {
    sim().setAction("none");
    message("Pattern load removed.");
  };

  function render() {
    const box = $("#analysisResults");
    box.replaceChildren();
    if (results.length) {
      const table = document.createElement("table");
      table.innerHTML =
        "<thead><tr><th>Case</th><th>Self-weight</th><th>λc</th><th>Gain</th></tr></thead>";
      const body = document.createElement("tbody");
      for (const r of results) {
        const tr = document.createElement("tr");
        const shortPattern = {
          uniform: "uniform",
          triangular: "triangular",
          gravity: "self-weight",
          loads: "loads",
        }[r.pattern];
        const arrow = ["uniform", "triangular"].includes(r.pattern)
          ? r.direction > 0
            ? " →"
            : " ←"
          : "";
        tr.innerHTML = `<td>${r.label}<small>${shortPattern}${arrow}</small></td><td>${r.selfWeight.stable ? "stable" : '<b class="bad">unstable</b>'}</td><td>${r.selfWeight.stable ? (r.bounded ? fmt(r.lambda) : "> " + fmt(r.lambda, 2)) : "0"}</td><td>${r.gain === undefined ? "" : r.gain === null ? "—" : r.gain === Infinity ? "stabilised" : "×" + fmt(r.gain, 2)}</td>`;
        tr.title = `${r.reason} Displacement limit ${fmt(r.limit)} m. Global balance error after settling ${pct(r.selfWeight.report.globalError)}.`;
        body.append(tr);
      }
      table.append(body);
      box.append(table);
      const last = results.at(-1);
      const note = document.createElement("p");
      note.className = "hint";
      const horizontal = ["uniform", "triangular"].includes(last.pattern);
      note.textContent =
        (last.selfWeight.stable
          ? `${last.reason}${horizontal && last.bounded ? ` Base shear at collapse ${fmt(last.lambda * last.selfWeight.report.weight, 2)} N${last.pattern === "uniform" ? `, collapse acceleration a₀ = λc·g ≈ ${fmt(last.lambda * last.gravity, 2)} m/s²` : ""}.` : ""}`
          : "Not in equilibrium under self-weight: λc = 0.") +
        (last.walls ? " Side boundaries were active." : "") +
        " Numerical estimate from rigid-block dynamics with quasi-static load steps; not a certified structural assessment.";
      box.append(note);
    }
    drawCurve();
  }
  function drawCurve() {
    const canvas = $("#collapseCurve");
    const curves = results.filter((r) => r.curve.length > 1);
    canvas.hidden = !curves.length;
    $("#curveEmpty").hidden = !!curves.length;
    if (!curves.length || canvas.closest("[hidden]")) return;
    const w = Math.max(160, canvas.clientWidth),
      h = Math.max(220, canvas.clientHeight),
      dpr = devicePixelRatio;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const pad = { l: 56, r: 24, t: 64, b: 42 };
    const shown = curves.slice(-4);
    const maxL = Math.max(...shown.map((r) => r.upper ?? r.lambda), 1e-3) * 1.08,
      maxD = Math.max(...shown.flatMap((r) => r.curve.map((p) => p.delta)), ...shown.map((r) => r.limit)) * 1.05;
    const X = (d) => pad.l + (d / maxD) * (w - pad.l - pad.r),
      Y = (l) => h - pad.b - (l / maxL) * (h - pad.t - pad.b);
    ctx.strokeStyle = "#9fb0ab";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.l, pad.t);
    ctx.lineTo(pad.l, h - pad.b);
    ctx.lineTo(w - pad.r, h - pad.b);
    ctx.stroke();
    ctx.fillStyle = "#5d6f6a";
    ctx.font = "12px system-ui";
    ctx.textAlign = "right";
    ctx.fillText(fmt(maxL, 2), pad.l - 4, pad.t + 8);
    ctx.fillText("0", pad.l - 4, h - pad.b);
    ctx.textAlign = "center";
    ctx.fillText("max block displacement δ (m)", (pad.l + w - pad.r) / 2, h - 8);
    ctx.fillText(fmt(maxD, 3), w - pad.r - 12, h - pad.b + 12);
    ctx.save();
    ctx.translate(11, (pad.t + h - pad.b) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("λ", 0, 0);
    ctx.restore();
    for (let i = 1; i <= 4; i++) {
      ctx.strokeStyle = "#dce5df";
      ctx.beginPath(); ctx.moveTo(pad.l, Y(maxL*i/4)); ctx.lineTo(w - pad.r, Y(maxL*i/4)); ctx.stroke();
      ctx.textAlign = "right";
      if (i < 4) ctx.fillText(fmt(maxL*i/4, 2), pad.l - 5, Y(maxL*i/4) + 4);
      ctx.textAlign = "center";
      if (i < 4) ctx.fillText(fmt(maxD*i/4, 3), X(maxD*i/4), h - pad.b + 16);
    }
    const colors = ["#8c5a2b", "#1c769c", "#b04468", "#4d7d3a"];
    shown.forEach((r, n) => {
      const color = colors[n % colors.length];
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      r.curve.forEach((p, k) =>
        k ? ctx.lineTo(X(p.delta), Y(p.lambda)) : ctx.moveTo(X(p.delta), Y(p.lambda)),
      );
      if (r.bounded) ctx.lineTo(X(maxD), Y(r.lambda));
      ctx.stroke();
      if (r.bounded) {
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(pad.l, Y(r.lambda));
        ctx.lineTo(w - pad.r, Y(r.lambda));
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.textAlign = "left";
      ctx.fillText(`${r.label} λc ${r.bounded ? "" : "> "}${fmt(r.lambda, 3)}`, pad.l + 6, 14 + n * 14);
    });
  }

  let lastReport = 0;
  function updateReport(now) {
    if (now - lastReport < 250 || $("#equilibriumReport").closest("[hidden]"))
      return;
    lastReport = now;
    const s = sim(),
      r = equilibriumReport(s);
    if (!r.computed || !s.items.length) {
      $("#equilibriumReport").innerHTML =
        '<p class="hint">Press Play (or run an analysis) to compute contact forces.</p>';
      return;
    }
    const ok = (v, limit) => (v <= limit ? "good" : "bad");
    $("#equilibriumReport").innerHTML = `<dl>
<dt>Total weight ΣW</dt><dd>${fmt(r.weight, 2)} N</dd>
<dt>Applied ΣF (x, y)</dt><dd>${fmt(r.applied.x, 2)}, ${fmt(r.applied.y, 2)} N</dd>
<dt>Boundary reactions ΣR (x, y)</dt><dd>${fmt(r.reaction.x, 2)}, ${fmt(r.reaction.y, 2)} N</dd>
<dt>Global imbalance |ΣR+ΣW+ΣF| / (W+|F|)</dt><dd class="${ok(r.globalError, 0.02)}">${pct(r.globalError)}</dd>
<dt>Max block residual |ΣF_i| / W_i</dt><dd class="${ok(r.maxForceRatio, 0.03)}">${pct(r.maxForceRatio)}</dd>
<dt>Max residual moment / (W_i·r_i)</dt><dd class="${ok(r.maxMomentRatio, 0.03)}">${pct(r.maxMomentRatio)}</dd>
<dt>Kinetic energy</dt><dd>${r.kinetic < 1e-3 ? r.kinetic.toExponential(2) : fmt(r.kinetic, 4)} J</dd>
<dt>Max speed · at rest for</dt><dd>${fmt(r.speed, 3)} m/s · ${fmt(r.quiet, 2)} s</dd>
</dl><p class="hint">Green: within 2% global and 3% local thresholds (numerical equilibrium).</p>`;
  }

  // Preset the controls for a loaded example.
  function preset({ pattern, lambdaMax }) {
    $("#actionPattern").value = pattern;
    $("#actionPattern").dispatchEvent(new Event("change"));
    $("#actionDirection").value = "1";
    $("#lambdaMax").value = lambdaMax;
    $("#lambdaSteps").value = 20;
    $("#collapseLimit").value = 25;
  }
  return { state, updateReport, render, preset };
}
