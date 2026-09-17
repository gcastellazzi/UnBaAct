export const defaultGroups = (friction = 0.45) => [
  { id: "regular", name: "Regular blocks", friction, color: "#dc9d68" },
  { id: "irregular", name: "Irregular blocks", friction, color: "#87b8ac" },
];
export function setupInspector() {
  const $ = (s) => document.querySelector(s);
  const panel = $("#observePanel");
  panel.querySelector("h2").innerHTML = "<span>03</span> Inspector";
  const observe = panel.querySelector(".sidebar-content");
  observe.id = "tab-observe";
  observe.setAttribute("role", "tabpanel");
  const colors = document.createElement("div");
  colors.className = "load-color-controls";
  colors.innerHTML =
    '<label>Block colouring<select id="blockColorMode"><option value="material">Material colours</option><option value="groups">Group colours</option><option value="load">Load shading · darker = higher</option></select></label><div id="loadColorLegend" hidden title="Load indicator (N) = (sum of normal contact magnitudes + weight + applied load) / 2"><div class="load-gray-scale"></div><div class="scale-label"><span>Lower load</span><span>Higher load</span></div><label>Load scale<select id="loadScale"><option value="auto">Scene maximum</option><option value="fixed">Fixed reference</option></select></label><label id="loadReferenceLabel" hidden>Darkest load (N)<input id="loadReference" type="number" min=".001" max="10000000" value="150" step="10"></label><p id="loadColorValue" class="hint"></p><p class="hint">Contact-load indicator, not stress. Play computes the contact forces.</p></div>';
  observe.prepend(colors);
  const tabs = document.createElement("div");
  tabs.className = "inspector-tabs";
  tabs.setAttribute("role", "tablist");
  tabs.innerHTML = ["Observe", "Groups", "Block"]
    .map(
      (name, n) =>
        `<button role="tab" id="tab-button-${name.toLowerCase()}" aria-controls="tab-${name.toLowerCase()}" aria-selected="${n === 0}" tabindex="${n === 0 ? 0 : -1}">${name}</button>`,
    )
    .join("");
  panel.insertBefore(tabs, observe);
  const groups = document.createElement("div");
  groups.id = "tab-groups";
  groups.className = "sidebar-content";
  groups.hidden = true;
  groups.setAttribute("role", "tabpanel");
  groups.innerHTML =
    '<label class="check"><input id="groupColors" type="checkbox"> Colour by group</label><div id="groupList"></div><label>New group name<input id="groupName" maxlength="40" placeholder="e.g. Lintel"></label><button id="addGroup">+ Create group</button><label>Selected block group<select id="selectedGroup"></select></label><button id="assignGroup" disabled>Assign selected block</button><p class="hint">Select a block in the canvas, then assign it to a group. Between groups, contact friction is the mean of their coefficients.</p><div class="divider"></div>';
  groups.append($("#mu").closest("label"));
  groups.querySelector("#mu").closest("label").firstChild.textContent =
    "Boundary friction μ ";
  const block = document.createElement("div");
  block.id = "tab-block";
  block.className = "sidebar-content";
  block.hidden = true;
  block.setAttribute("role", "tabpanel");
  block.innerHTML =
    '<canvas id="blockDiagram" aria-label="Selected block force diagram"></canvas><div id="blockForceList" class="block-force-list"></div><p class="hint">Forces on the block · N. Arrow lengths use a logarithmic scale. All forces are shown here independently of Observe filters. Fn / Ft: contact components; # identifies the neighbouring block. R: boundary reaction (Fn + Ft), not an extra force. W: weight. ΣF: resultant.</p>';
  block.append($("#selectedPanel .selected-fields"));
  panel.append(groups, block);
  const activate = (button) => {
    for (const b of tabs.children) {
      const active = b === button;
      b.setAttribute("aria-selected", active);
      b.tabIndex = active ? 0 : -1;
      $("#" + b.getAttribute("aria-controls")).hidden = !active;
    }
  };
  for (const button of tabs.children) {
    button.onclick = () => activate(button);
    button.onkeydown = (event) => {
      if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const buttons = [...tabs.children];
        const index =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? 2
              : (buttons.indexOf(button) +
                  (event.key === "ArrowRight" ? 1 : 2)) %
                3;
        activate(buttons[index]);
        buttons[index].focus();
      }
    };
  }
  const metrics = $(".metrics");
  $(".transport").append(metrics, $("#status"));
  const experiment = $("#experimentPanel");
  $(".scene-panel").append(experiment);
  $(".bottom-dock").remove();
  $("#arrows").closest("label").hidden = true;
  $("#residuals").closest("label").hidden = true;
  const legend = $(".legend");
  legend.innerHTML =
    '<label class="check"><input id="normalForces" type="checkbox" checked><i style="background:#dc684d"></i> Normal force</label><label class="check"><input id="tangentForces" type="checkbox" checked><i style="background:#815cce"></i> Tangential force</label><label class="check"><input id="resultantForces" type="checkbox"><i style="background:#e02e67"></i> Resultant</label><label class="check"><input id="loadForces" type="checkbox" checked><i style="background:#3479c9"></i> Applied load</label><label class="check"><input id="boundaryForces" type="checkbox" checked><i style="background:#a47921"></i> Boundary reactions</label><div id="boundarySummary" class="hint"></div>';
}

export function drawBlockDiagram(canvas, item, sim) {
  if (!canvas || canvas.closest("[hidden]")) return;
  const w = Math.max(100, canvas.clientWidth),
    h = 340,
    dpr = devicePixelRatio;
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }
  canvas.style.height = h + "px";
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.font = "11px system-ui";
  ctx.textAlign = "center";
  const forceList = document.querySelector("#blockForceList");
  forceList.replaceChildren();
  if (!item) {
    ctx.fillStyle = "#657972";
    ctx.fillText("Select a block", w / 2, h / 2);
    return;
  }
  const p = item.body.translation(),
    angle = item.body.rotation();
  const size = Math.min(65, w * 0.23) / Math.max(item.r, 0.01);
  const point = (q) => ({
    x: w / 2 + (q.x - p.x) * size,
    y: h / 2 - (q.y - p.y) * size,
  });
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-angle);
  ctx.beginPath();
  if (item.shape === "disk") ctx.arc(0, 0, item.r * size, 0, 2 * Math.PI);
  else if (["rectangle", "square"].includes(item.shape))
    ctx.rect(
      (-(item.width ?? item.r * 2) * size) / 2,
      (-(item.height ?? item.r * 2) * size) / 2,
      (item.width ?? item.r * 2) * size,
      (item.height ?? item.r * 2) * size,
    );
  else {
    const vertices = item.vertices;
    for (let k = 0; k < vertices.length; k += 2) {
      if (k === 0) ctx.moveTo(vertices[k] * size, -vertices[k + 1] * size);
      else ctx.lineTo(vertices[k] * size, -vertices[k + 1] * size);
    }
    ctx.closePath();
  }
  ctx.fillStyle = "#dce9e2";
  ctx.strokeStyle = "#617f75";
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  const labels = [];
  const arrow = (at, x, y, color, name) => {
    const value = Math.hypot(x, y);
    if (value < 0.0001) return;
    const start = point(at),
      length = Math.min(70, 18 + Math.log1p(value) * 7),
      end = {
        x: start.x + (x / value) * length,
        y: start.y - (y / value) * length,
      };
    const a = Math.atan2(end.y - start.y, end.x - start.x);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.lineTo(end.x - 6 * Math.cos(a - 0.45), end.y - 6 * Math.sin(a - 0.45));
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(end.x - 6 * Math.cos(a + 0.45), end.y - 6 * Math.sin(a + 0.45));
    ctx.stroke();
    ctx.font = "10px system-ui";
    const text = `${name} ${value.toFixed(2)} N`;
    const half = ctx.measureText(text).width / 2 + 3;
    const lx = Math.max(half + 2, Math.min(w - half - 2, end.x));
    const baseY = Math.max(12, Math.min(h - 8, end.y - 7));
    let ly = baseY;
    for (let n = 0; n < Math.ceil(h / 7); n++) {
      const candidate = baseY + (n % 2 === 0 ? 1 : -1) * Math.ceil(n / 2) * 14;
      if (candidate < 12 || candidate > h - 8) continue;
      if (
        !labels.some(
          (l) =>
            Math.abs(l.x - lx) < l.half + half &&
            Math.abs(l.y - candidate) < 13,
        )
      ) {
        ly = candidate;
        break;
      }
    }
    labels.push({ x: lx, y: ly, half });
    if (Math.abs(ly - (end.y - 7)) > 14) {
      ctx.beginPath();
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(lx, ly + 3);
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
    ctx.fillStyle = "#f8faf7";
    ctx.fillRect(lx - half, ly - 10, half * 2, 12);
    ctx.fillStyle = color;
    ctx.fillText(text, lx, ly);
  };
  for (const c of sim.contacts.filter((c) => c.a === item || c.b === item)) {
    const sign = c.a === item ? -1 : 1;
    const neighbour = c.a === item ? c.b : c.a;
    const source = neighbour ? `#${neighbour.id}` : c.wall;
    arrow(
      c.point,
      sign * c.normal.x * c.fn,
      sign * c.normal.y * c.fn,
      "#dc684d",
      `Fn ${source}`,
    );
    arrow(
      c.point,
      -sign * c.normal.y * c.ft,
      sign * c.normal.x * c.ft,
      "#815cce",
      `Ft ${source}`,
    );
    if (!c.b)
      arrow(
        c.point,
        -c.normal.x * c.fn + c.normal.y * c.ft,
        -c.normal.y * c.fn - c.normal.x * c.ft,
        "#a47921",
        `R ${c.wall}`,
      );
  }
  arrow(p, 0, -item.body.mass() * sim.config.gravity, "#657972", "W");
  arrow(p, 0, -item.load, "#3479c9", "Load");
  arrow(p, item.residual.x, item.residual.y, "#e02e67", "ΣF");
  const reactions = new Map();
  for (const c of sim.contacts.filter((c) => c.a === item || c.b === item)) {
    const sign = c.a === item ? -1 : 1,
      neighbour = c.a === item ? c.b : c.a;
    const source = neighbour ? `Block #${neighbour.id}` : c.wall;
    const r = reactions.get(source) ?? { x: 0, y: 0 };
    r.x += sign * (c.normal.x * c.fn - c.normal.y * c.ft);
    r.y += sign * (c.normal.y * c.fn + c.normal.x * c.ft);
    reactions.set(source, r);
  }
  const heading = document.createElement("strong");
  heading.textContent = "Contact reactions on this block";
  forceList.append(heading);
  if (!reactions.size) {
    const hint = document.createElement("p");
    hint.textContent =
      sim.time === 0
        ? "Press Play or Single step to compute contact reactions."
        : "No active contact reactions.";
    forceList.append(hint);
  }
  for (const [source, r] of reactions) {
    const row = document.createElement("p");
    row.textContent = `${source}: Rx ${r.x.toFixed(2)} N · Ry ${r.y.toFixed(2)} N · |R| ${Math.hypot(r.x, r.y).toFixed(2)} N`;
    forceList.append(row);
  }
}
