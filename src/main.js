import { blockLoads, loadShade } from "./load-colors.js";
import {
  setupInspector,
  defaultGroups,
  drawBlockDiagram,
} from "./inspector.js";
import { contourSpec, decomposePolygon } from "./geometry.js";
import {
  loadLocalPhoto,
  restorePhoto,
  photoBounds,
  transformTracedSpecs,
} from "./photo.js";
import { interfaceHTML } from "./ui.js";
import { OPUS_SCENARIOS, generateOpus } from "./scenarios.js";
import "./style.css";
import {
  initialize,
  Simulation,
  generate,
  DT,
  connectedContacts,
  cornerStones,
} from "./physics.js";
const $ = (s) => document.querySelector(s);
$("#app").innerHTML = interfaceHTML;
setupInspector();
let groups = defaultGroups();
$("#app").inert = true;
await initialize();
for (const [button, dialog] of [
  ["openCredits", "credits"],
  ["openHelp", "help"],
]) {
  $("#" + button).onclick = () => {
    $(".app-menu").open = false;
    $("#" + dialog).showModal();
  };
}
for (const dialog of document.querySelectorAll("dialog")) {
  dialog.querySelector(".close-dialog").onclick = () => dialog.close();
  dialog.addEventListener("click", (e) => {
    const r = dialog.getBoundingClientRect();
    if (
      e.target === dialog &&
      (e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom)
    )
      dialog.close();
  });
}
let sim,
  initial = [],
  selected = null,
  running = false,
  angle = 0,
  drag = null,
  pointer = null,
  acc = 0,
  last = 0;
let modelBounds;
let loadValues = new Map(),
  loadColorReference = 1;
let photo = null,
  draft = [],
  calibration = [],
  photoLoadToken = 0;
const canvas = $("#scene"),
  ctx = canvas.getContext("2d");
let W = 800,
  H = 600,
  scale = 60,
  ox = 0,
  oy = 0;
function config() {
  return {
    boundary: $("#boundary").value,
    friction: +$("#mu").value,
    groups: groups.map((g) => ({ ...g })),
    gravity: +$("#gravity").value,
    leftWall: $("#leftWall").checked,
    rightWall: $("#rightWall").checked,
    thickness: +$("#thickness").value,
    materialDensity: +$("#density").value,
    bounds: photo ? photoBounds(photo) : modelBounds,
  };
}
function renderGroups() {
  const list = $("#groupList");
  list.replaceChildren();
  for (const group of groups) {
    const row = document.createElement("div");
    row.className = "group-row";
    const label = document.createElement("label");
    label.textContent = group.name + " · μ ";
    const dot = document.createElement("i");
    dot.className = "group-dot";
    dot.style.background = group.color;
    label.prepend(dot);
    const out = document.createElement("output");
    out.textContent = group.friction.toFixed(2);
    label.append(out);
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = 0;
    slider.max = 1;
    slider.step = 0.05;
    slider.value = group.friction;
    slider.dataset.group = group.id;
    slider.oninput = () => {
      group.friction = +slider.value;
      out.textContent = group.friction.toFixed(2);
      sim.configure(config());
    };
    label.append(slider);
    row.append(label);
    const count = document.createElement("small");
    count.dataset.groupCount = group.id;
    row.append(count);
    list.append(row);
  }
  const select = $("#selectedGroup");
  select.replaceChildren();
  for (const group of groups) {
    const option = document.createElement("option");
    option.value = group.id;
    option.textContent = group.name;
    select.append(option);
  }
  select.dataset.item = "";
}
$("#addGroup").onclick = () => {
  const name = $("#groupName").value.trim();
  if (!name) {
    message("Enter a group name.");
    return;
  }
  if (groups.length >= 20) {
    message("Maximum 20 groups.");
    return;
  }
  groups.push({
    id: crypto.randomUUID(),
    name,
    friction: 0.45,
    color: ["#b097cb", "#93b5d0", "#bdbe77", "#d88d91"][
      (groups.length - 2) % 4
    ],
  });
  $("#groupName").value = "";
  renderGroups();
  sim.configure(config());
};
$("#selectedGroup").onchange = () => {
  if (selected) $("#selectedGroup").dataset.item = String(selected.id);
};
$("#assignGroup").onclick = () => {
  if (selected) {
    sim.assignGroup(selected, $("#selectedGroup").value);
    initial = initial.map((s) =>
      s.id === selected.id ? { ...s, group: selected.group } : s,
    );
  }
};
for (const [a, b] of [
  ["normalForces", "arrows"],
  ["resultantForces", "residuals"],
]) {
  $("#" + a).onchange = () => {
    $("#" + b).checked = $("#" + a).checked;
  };
  $("#" + b).onchange = () => {
    $("#" + a).checked = $("#" + b).checked;
  };
}
$("#blockColorMode").onchange = () => {
  const mode = $("#blockColorMode").value;
  $("#groupColors").checked = mode === "groups";
  $("#loadColorLegend").hidden = mode !== "load";
  if (mode === "load") {
    for (const id of [
      "chains",
      "normalForces",
      "tangentForces",
      "arrows",
      "boundaryForces",
    ]) {
      $("#" + id).checked = false;
    }
  }
};
$("#groupColors").onchange = () => {
  $("#blockColorMode").value = $("#groupColors").checked
    ? "groups"
    : "material";
  $("#loadColorLegend").hidden = true;
};
$("#loadScale").onchange = () => {
  $("#loadReferenceLabel").hidden = $("#loadScale").value !== "fixed";
};
renderGroups();
function rebuild(specs) {
  sim?.dispose();
  sim = new Simulation(config());
  specs.forEach((s) => sim.add(s));
  initial = sim.specs();
  selected = null;
  running = false;
  acc = 0;
  draft = [];
  calibration = [];
  updatePlay();
  updateCamera();
}
function message(s) {
  $("#toast").textContent = s;
  clearTimeout(message.timer);
  message.timer = setTimeout(() => ($("#toast").textContent = ""), 3000);
}
function updatePlay() {
  $("#play").textContent = running ? "Ⅱ Pause" : "▶ Play · apply gravity";
}
function play() {
  if (draft.length) {
    message("Close or cancel the outline before starting playback.");
    return;
  }
  if (!sim.items.length) return;
  if (sim.time === 0) initial = sim.specs();
  running = !running;
  drag = null;
  acc = 0;
  updatePlay();
}
function edited() {
  sim.time = 0;
  sim.contacts = [];
  sim.quiet = 0;
  sim.speed = 0;
  for (const i of sim.items) {
    i.residual = { x: 0, y: 0 };
    i.torque = 0;
  }
  initial = sim.specs();
}
$("#generate").onclick = () => {
  photo = null;
  modelBounds = undefined;
  ++photoLoadToken;
  $("#blockOpacity").value = 100;
  syncPhotoControls();
  rebuild(
    generate(
      +$("#seed").value,
      Math.min(88, Math.max(1, +$("#count").value || 55)),
      $("#shape").value,
    ),
  );
};
$("#clear").onclick = () => rebuild([]);
$("#play").onclick = play;
$("#reset").onclick = () => rebuild(initial);
$("#step").onclick = () => {
  if (draft.length) {
    message("Close or cancel the outline first.");
    return;
  }
  if (sim.time === 0) initial = sim.specs();
  running = false;
  updatePlay();
  sim.step();
};
for (const id of ["boundary", "mu", "gravity", "leftWall", "rightWall"])
  $("#" + id).oninput = () => {
    sim.configure(config());
    $("#muValue").textContent = (+$("#mu").value).toFixed(2);
    $("#gravityValue").textContent =
      (+$("#gravity").value).toFixed(2) + " m/s²";
  };
function describeScenario() {
  const description = OPUS_SCENARIOS.find(
    (s) => s.id === $("#opus").value,
  ).description;
  $("#opusDescription").textContent = description;
  $("#opus").title = description;
}
$("#opus").onchange = describeScenario;
describeScenario();
$("#loadOpus").onclick = () => {
  $("#boundary").value = "cup";
  $("#leftWall").checked = true;
  $("#rightWall").checked = true;
  photo = null;
  modelBounds = undefined;
  ++photoLoadToken;
  $("#blockOpacity").value = 100;
  syncPhotoControls();
  const loadExample = $("#opus").value.startsWith("load-");
  if (loadExample) {
    $("#thickness").value = 1;
    $("#density").value = 1;
    $("#blockColorMode").value = "load";
    $("#blockColorMode").dispatchEvent(new Event("change"));
    $("#loadScale").value = "fixed";
    $("#loadScale").dispatchEvent(new Event("change"));
    $("#loadReference").value = 150;
    $("#blockOpacity").value = 100;
  }
  if ($("#opus").value === "load-comparison")
    modelBounds = { left: 1, right: 11, bottom: 0, top: 4.5 };
  rebuild(generateOpus($("#opus").value, +$("#seed").value));
  $("#tool").value = "select";
  message("Example loaded. Press Play to test stability.");
};
$("#corners").onclick = () => {
  const grains = generate(
    +$("#seed").value,
    Math.min(60, +$("#count").value || 55),
    $("#shape").value === "rectangle" ? "disk" : $("#shape").value,
  ).map((p, k) => ({
    ...p,
    r: 0.24,
    x: 3.25 + (k % 9) * 0.68,
    y: 0.4 + Math.floor(k / 9) * 0.68,
  }));
  photo = null;
  modelBounds = undefined;
  ++photoLoadToken;
  $("#blockOpacity").value = 100;
  syncPhotoControls();
  rebuild([...cornerStones(), ...grains]);
  $("#tool").value = "select";
};
function removeSelected() {
  if (!selected) return;
  sim.remove(selected);
  selected = null;
  drag = null;
  if (sim.time === 0) initial = sim.specs();
}
$("#removeSelected").onclick = removeSelected;
$("#kick").oninput = () =>
  ($("#kickValue").textContent = (+$("#kick").value).toFixed(2) + " m/s");
function kick(direction) {
  if (draft.length) {
    message("Close or cancel the outline first.");
    return;
  }
  if (!sim.items.length) return;
  if (sim.time === 0) initial = sim.specs();
  sim.impulse(direction * +$("#kick").value);
  running = true;
  drag = null;
  acc = 0;
  updatePlay();
  message("Shake " + (direction < 0 ? "to the left" : "to the right"));
}
$("#kickLeft").onclick = () => kick(-1);
$("#kickRight").onclick = () => kick(1);
$("#applyLoad").onclick = () => {
  if (!selected) return;
  const force = +$("#load").value;
  if (!Number.isFinite(force) || force < 0 || force > 1000000) {
    message("Enter a load between 0 and 1000000 N.");
    return;
  }
  sim.setLoad(selected, force);
  if (sim.time === 0) initial = sim.specs();
  message("Load of " + force + " N applied. Press Play to observe.");
};
$("#clearLoad").onclick = () => {
  if (selected) {
    sim.setLoad(selected, 0);
    if (sim.time === 0) initial = sim.specs();
  }
};
$("#size").oninput = () =>
  ($("#sizeValue").textContent = (+$("#size").value).toFixed(2) + " m");
$("#threshold").oninput = () =>
  ($("#thresholdValue").textContent = $("#threshold").value + "% of maximum");
function updateCamera() {
  if (photo || modelBounds) {
    const b = photo ? photoBounds(photo) : modelBounds,
      w = b.right - b.left,
      h = b.top - b.bottom;
    scale = Math.min(W / (w + 0.8), H / (h + 0.8));
    ox = W / 2 - ((b.left + b.right) / 2) * scale;
    oy = H / 2 + ((b.bottom + b.top) / 2) * scale;
  } else {
    scale = Math.min(W / 12.6, H / 9.2);
    ox = (W - 12 * scale) / 2;
    oy = H - (H - 8.6 * scale) / 2 - 0.3 * scale;
  }
  canvas.dataset.view = JSON.stringify({ scale, ox, oy });
}
function syncPhotoControls() {
  if (photo) {
    const p = photo.data;
    $("#photoWidth").value = p.width.toFixed(4);
    $("#photoX").value = p.x.toFixed(4);
    $("#photoY").value = p.y.toFixed(4);
    $("#photoOpacity").value = Math.round(p.opacity * 100);
    $("#photoOpacityValue").textContent = Math.round(p.opacity * 100) + "%";
    $("#photoVisible").checked = p.visible;
    $("#blockOpacity").value = Math.round(p.blockOpacity * 100);
  }
  $("#blockOpacityValue").textContent = $("#blockOpacity").value + "%";
}
$("#photoUpload").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const token = ++photoLoadToken;
  try {
    const loaded = await loadLocalPhoto(file);
    if (token !== photoLoadToken) return;
    photo = loaded;
    modelBounds = undefined;
    $("#thickness").value = 0.3;
    $("#density").value = 1800;
    syncPhotoControls();
    rebuild([]);
    $("#tool").value = "trace";
    $(".photo-tools").open = true;
    message(
      "Photo loaded into an empty scene. Set its scale, then trace your blocks.",
    );
  } catch (error) {
    message(error.message);
  }
  e.target.value = "";
};
$("#emptyTracing").onclick = () => {
  rebuild([]);
  $("#tool").value = "trace";
  message(
    "Empty tracing scene. The background photo and its scale are preserved.",
  );
};
function placePhoto(placement) {
  if (!photo) return;
  const old = { ...photo.data },
    next = { ...old, ...placement };
  if (
    ![next.width, next.x, next.y].every(Number.isFinite) ||
    next.width < 0.1 ||
    next.width > 50 ||
    Math.abs(next.x) > 50 ||
    Math.abs(next.y) > 50 ||
    (next.width * photo.image.naturalHeight) / photo.image.naturalWidth > 100
  ) {
    message("Use width 0.1–50 m and offsets −50–50 m; photo height ≤100 m.");
    syncPhotoControls();
    return;
  }
  const specs = transformTracedSpecs(sim.specs(), old, next, old.id);
  photo.data = next;
  syncPhotoControls();
  rebuild(specs);
  message("Photo and its traced blocks rescaled together.");
}
for (const id of ["photoWidth", "photoX", "photoY"])
  $("#" + id).onchange = () =>
    placePhoto({
      width: +$("#photoWidth").value,
      x: +$("#photoX").value,
      y: +$("#photoY").value,
    });
$("#photoOpacity").oninput = () => {
  if (photo) photo.data.opacity = +$("#photoOpacity").value / 100;
  $("#photoOpacityValue").textContent = $("#photoOpacity").value + "%";
};
$("#photoVisible").onchange = () => {
  if (photo) photo.data.visible = $("#photoVisible").checked;
};
$("#blockOpacity").oninput = () => {
  if (photo) photo.data.blockOpacity = +$("#blockOpacity").value / 100;
  $("#blockOpacityValue").textContent = $("#blockOpacity").value + "%";
};
$("#removePhoto").onclick = () => {
  if (photo) modelBounds = photoBounds(photo);
  photo = null;
  ++photoLoadToken;
  draft = [];
  calibration = [];
  $("#blockOpacity").value = 100;
  syncPhotoControls();
  sim.configure(config());
  updateCamera();
};
for (const id of ["thickness", "density"])
  $("#" + id).onchange = () => {
    const t = +$("#thickness").value,
      rho = +$("#density").value;
    if (
      !Number.isFinite(t) ||
      t < 0.01 ||
      t > 10 ||
      !Number.isFinite(rho) ||
      rho < 0.001 ||
      rho > 30000
    ) {
      message("Thickness: 0.01–10 m. Density: 0.001–30000 kg/m³.");
      $("#thickness").value = sim.config.thickness;
      $("#density").value = sim.config.materialDensity;
      return;
    }
    sim.configure(config());
  };
function finishTrace() {
  if (running) return;
  try {
    const spec = contourSpec(draft, photo?.data.id);
    selected = sim.add(spec);
    draft = [];
    edited();
    message("Block created. Keep clicking to trace the next block.");
  } catch (error) {
    message(error.message);
  }
}
$("#finishTrace").onclick = finishTrace;
$("#undoVertex").onclick = () => draft.pop();
$("#cancelTrace").onclick = () => {
  draft = [];
  calibration = [];
};
$("#tool").onchange = () => {
  draft = [];
  calibration = [];
  drag = null;
  if (["trace", "calibrate"].includes($("#tool").value)) {
    running = false;
    updatePlay();
  }
};
$("#calibratePhoto").onclick = () => {
  if (!photo) {
    message("Load a photo first.");
    return;
  }
  draft = [];
  calibration = [];
  running = false;
  updatePlay();
  $("#tool").value = "calibrate";
  message("Click the two ends of a known distance in the photo.");
};
function calibrationPoint(p) {
  if (!photo) {
    message("Load a photo first.");
    return;
  }
  calibration.push(p);
  if (calibration.length < 2) return;
  const distance = Math.hypot(
      calibration[1].x - calibration[0].x,
      calibration[1].y - calibration[0].y,
    ),
    known = +$("#referenceLength").value;
  if (distance < 1e-6 || !Number.isFinite(known) || known <= 0) {
    calibration = [];
    message("Choose two distinct points and a positive known distance.");
    return;
  }
  const width = (photo.data.width * known) / distance;
  placePhoto({ width });
  calibration = [];
  $("#tool").value = "trace";
}
canvas.oncontextmenu = (e) => {
  if ($("#tool").value === "trace") {
    e.preventDefault();
    finishTrace();
  } else if ($("#tool").value === "calibrate") e.preventDefault();
};
function rotate() {
  if (running) return;
  if (selected) {
    selected.body.setRotation(selected.body.rotation() + Math.PI / 12, true);
    edited();
  } else angle += Math.PI / 12;
}
$("#rotate").onclick = rotate;
function screen(p) {
  return { x: ox + p.x * scale, y: oy - p.y * scale };
}
function world(e) {
  const b = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - b.left - ox) / scale,
    y: (oy - e.clientY + b.top) / scale,
  };
}
function hit(p) {
  for (const i of [...sim.items].reverse()) {
    const q = i.body.translation(),
      a = -i.body.rotation(),
      x = (p.x - q.x) * Math.cos(a) - (p.y - q.y) * Math.sin(a),
      y = (p.x - q.x) * Math.sin(a) + (p.y - q.y) * Math.cos(a);
    if (
      i.shape === "disk"
        ? Math.hypot(x, y) <= i.r
        : ["square", "rectangle"].includes(i.shape)
          ? Math.abs(x) <= (i.width ?? i.r * 2) / 2 &&
            Math.abs(y) <= (i.height ?? i.r * 2) / 2
          : i.shape === "polygon"
            ? pointInPolygon(x, y, i.vertices)
            : pointInTriangle(x, y, i.r)
    )
      return i;
  }
  return null;
}
function pointInPolygon(x, y, v) {
  let inside = false;
  for (let i = 0, j = v.length - 2; i < v.length; j = i, i += 2) {
    if (
      v[i + 1] > y !== v[j + 1] > y &&
      x < ((v[j] - v[i]) * (y - v[i + 1])) / (v[j + 1] - v[i + 1]) + v[i]
    )
      inside = !inside;
  }
  return inside;
}
function pointInTriangle(x, y, r) {
  return y >= -0.75 * r && y <= 1.25 * r && Math.abs(x) <= (1.25 * r - y) / 2;
}
canvas.onpointerdown = (e) => {
  const p = world(e),
    item = hit(p);
  canvas.focus();
  if (e.button !== 0) return;
  if (!running && $("#tool").value === "trace") {
    if (
      draft.length >= 3 &&
      Math.hypot(p.x - draft[0].x, p.y - draft[0].y) * scale < 8
    ) {
      finishTrace();
      return;
    }
    if (draft.length >= 48) {
      message("Close the block: maximum 48 vertices.");
      return;
    }
    draft.push(p);
    return;
  }
  if (!running && $("#tool").value === "calibrate") {
    calibrationPoint(p);
    return;
  }
  if (running) {
    selected = item;
    if (item && $("#tool").value === "delete") removeSelected();
    return;
  }
  if ($("#tool").value === "add") {
    const bounds = photo
      ? photoBounds(photo)
      : { left: 1.5, right: 10.5, bottom: 0.5, top: 8 };
    if (
      p.x < bounds.left ||
      p.x > bounds.right ||
      p.y < bounds.bottom ||
      p.y > bounds.top
    ) {
      message("Place the particle inside the experiment area.");
      return;
    }
    const r = +$("#size").value;
    if (
      sim.items.some(
        (i) =>
          Math.hypot(
            i.body.translation().x - p.x,
            i.body.translation().y - p.y,
          ) <
          i.r +
            ($("#shape").value === "rectangle" ? r * Math.sqrt(5) : r) +
            0.02,
      )
    ) {
      message("Position occupied: choose an empty space.");
      return;
    }
    const shape = $("#shape").value;
    selected = sim.add({
      ...p,
      r,
      angle,
      shape: shape === "mixed" ? "disk" : shape,
    });
    edited();
    return;
  }
  selected = item;
  if (item && $("#tool").value === "delete") {
    removeSelected();
    return;
  }
  if (item) {
    drag = {
      item,
      offset: {
        x: p.x - item.body.translation().x,
        y: p.y - item.body.translation().y,
      },
    };
    canvas.setPointerCapture(e.pointerId);
  }
};
canvas.onpointermove = (e) => {
  pointer = world(e);
  if (drag && !running) {
    const p = { x: pointer.x - drag.offset.x, y: pointer.y - drag.offset.y };
    drag.item.body.setTranslation(p, true);
    drag.item.body.setLinvel({ x: 0, y: 0 }, true);
    drag.item.body.setAngvel(0, true);
    edited();
  }
};
canvas.onpointerup = () => (drag = null);
canvas.onpointercancel = () => (drag = null);
canvas.onpointerleave = () => (pointer = null);
window.onkeydown = (e) => {
  if (
    ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName) ||
    e.target.closest("dialog")
  )
    return;
  if (!running && $("#tool").value === "trace") {
    if (["Enter", "c", "C"].includes(e.key)) {
      e.preventDefault();
      finishTrace();
      return;
    }
    if (e.key === "Escape") {
      draft = [];
      return;
    }
    if (e.key === "Backspace") {
      e.preventDefault();
      draft.pop();
      return;
    }
  }
  if (e.key === "Escape") calibration = [];
  if (e.code === "Space") {
    e.preventDefault();
    play();
  }
  if (["Delete", "Backspace"].includes(e.key) && selected) {
    e.preventDefault();
    removeSelected();
  }
  if (e.key.toLowerCase() === "r") rotate();
  if (!running && selected && ["ArrowLeft", "ArrowRight"].includes(e.key)) {
    e.preventDefault();
    const p = selected.body.translation();
    selected.body.setTranslation(
      { x: p.x + (e.key === "ArrowLeft" ? -0.1 : 0.1), y: p.y },
      true,
    );
    edited();
  }
};
$("#export").onclick = () => {
  const blob = new Blob(
    [
      JSON.stringify(
        {
          version: 1,
          config: config(),
          particles: sim.specs(),
          initial,
          photo: photo?.data,
          view: {
            blockColorMode: $("#blockColorMode").value,
            loadScale: $("#loadScale").value,
            loadReference: +$("#loadReference").value || 150,
          },
        },
        null,
        2,
      ),
    ],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = "unbaact-experiment.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$("#import").onchange = async (e) => {
  const token = ++photoLoadToken;
  try {
    const data = JSON.parse(await e.target.files[0].text());
    if (
      data.version !== 1 ||
      !Array.isArray(data.particles) ||
      data.particles.length > 400 ||
      !data.config ||
      !["cup", "free", "supports"].includes(data.config.boundary) ||
      !Number.isFinite(data.config.friction) ||
      data.config.friction < 0 ||
      data.config.friction > 1 ||
      !Number.isFinite(data.config.gravity) ||
      data.config.gravity < 0 ||
      data.config.gravity > 20 ||
      (data.config.bounds !== undefined &&
        (!["left", "right", "bottom", "top"].every(
          (k) =>
            Number.isFinite(data.config.bounds[k]) &&
            Math.abs(data.config.bounds[k]) <= 200,
        ) ||
          data.config.bounds.right <= data.config.bounds.left ||
          data.config.bounds.top <= data.config.bounds.bottom)) ||
      (data.config.thickness !== undefined &&
        (!Number.isFinite(data.config.thickness) ||
          data.config.thickness < 0.01 ||
          data.config.thickness > 10)) ||
      (data.config.materialDensity !== undefined &&
        (!Number.isFinite(data.config.materialDensity) ||
          data.config.materialDensity < 0.001 ||
          data.config.materialDensity > 30000)) ||
      data.particles.some(
        (p) =>
          !["disk", "square", "triangle", "rectangle", "polygon"].includes(
            p.shape,
          ) ||
          ![p.x, p.y, p.r, p.angle].every(Number.isFinite) ||
          p.r < 0.005 ||
          p.r > 50 ||
          (p.shape === "polygon" &&
            (!Array.isArray(p.vertices) ||
              p.vertices.length < 6 ||
              p.vertices.length > 96 ||
              p.vertices.length % 2 !== 0 ||
              !p.vertices.every(
                (v) => Number.isFinite(v) && Math.abs(v) <= 50,
              ))) ||
          (p.color !== undefined && !/^#[0-9a-f]{6}$/i.test(p.color)) ||
          (p.role !== undefined &&
            ![
              "brick",
              "corner-stone",
              "rounded-stone",
              "rubble",
              "lintel",
              "load-spreader",
              "traced-block",
            ].includes(p.role)) ||
          (p.shape === "rectangle" &&
            (![p.width, p.height].every(Number.isFinite) ||
              p.width <= 0 ||
              p.height <= 0 ||
              p.width > 3 ||
              p.height > 3)) ||
          (p.load !== undefined &&
            (!Number.isFinite(p.load) || p.load < 0 || p.load > 1000000)) ||
          Math.abs(p.x) > 100 ||
          Math.abs(p.y) > 100,
      )
    )
      throw Error("Invalid file format or parameters");
    for (const p of data.particles)
      if (p.shape === "polygon") decomposePolygon(p.vertices);
    if (
      data.config.groups !== undefined &&
      (!Array.isArray(data.config.groups) ||
        data.config.groups.length < 2 ||
        data.config.groups.length > 20 ||
        !["regular", "irregular"].every((id) =>
          data.config.groups.some((g) => g.id === id),
        ) ||
        new Set(data.config.groups.map((g) => g.id)).size !==
          data.config.groups.length ||
        data.config.groups.some(
          (g) =>
            typeof g.id !== "string" ||
            g.id.length > 80 ||
            typeof g.name !== "string" ||
            !g.name.trim() ||
            g.name.length > 40 ||
            !Number.isFinite(g.friction) ||
            g.friction < 0 ||
            g.friction > 1 ||
            !/^#[0-9a-f]{6}$/i.test(g.color),
        ))
    )
      throw Error("Invalid groups");
    const importedGroups =
      data.config.groups ?? defaultGroups(data.config.friction);
    if (
      data.particles.some(
        (p) =>
          p.group !== undefined &&
          !importedGroups.some((g) => g.id === p.group),
      )
    )
      throw Error("Unknown block group");
    const importedPhoto = data.photo ? await restorePhoto(data.photo) : null;
    if (token !== photoLoadToken) return;
    groups = importedGroups;
    renderGroups();
    photo = importedPhoto;
    modelBounds = data.config.bounds;
    if (!photo) $("#blockOpacity").value = 100;
    syncPhotoControls();
    $("#thickness").value = data.config.thickness ?? 1;
    $("#density").value = data.config.materialDensity ?? 1;
    $("#boundary").value = data.config.boundary;
    $("#mu").value = data.config.friction;
    $("#gravity").value = data.config.gravity;
    $("#leftWall").checked = data.config.leftWall !== false;
    $("#rightWall").checked = data.config.rightWall !== false;
    if (data.view) {
      $("#blockColorMode").value = ["material", "groups", "load"].includes(
        data.view.blockColorMode,
      )
        ? data.view.blockColorMode
        : "material";
      $("#blockColorMode").dispatchEvent(new Event("change"));
      $("#loadScale").value =
        data.view.loadScale === "fixed" ? "fixed" : "auto";
      $("#loadScale").dispatchEvent(new Event("change"));
      $("#loadReference").value =
        Number.isFinite(data.view.loadReference) &&
        data.view.loadReference > 0 &&
        data.view.loadReference <= 10000000
          ? data.view.loadReference
          : 150;
    }
    rebuild(data.particles);
    $("#mu").dispatchEvent(new Event("input"));
    message("Experiment imported.");
  } catch (error) {
    message("Import failed: " + error.message);
  }
  e.target.value = "";
};
new ResizeObserver(() => {
  const b = canvas.parentElement.getBoundingClientRect();
  W = b.width;
  H = b.height;
  canvas.width = W * devicePixelRatio;
  canvas.height = H * devicePixelRatio;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  updateCamera();
}).observe(canvas.parentElement);
function particle(spec, p, a, ghost = false) {
  const q = screen(p);
  ctx.save();
  ctx.translate(q.x, q.y);
  ctx.rotate(-a);
  ctx.beginPath();
  const r = spec.r * scale;
  if (spec.shape === "disk") ctx.arc(0, 0, r, 0, Math.PI * 2);
  else if (["square", "rectangle"].includes(spec.shape)) {
    const w =
        (spec.width ?? spec.r * (spec.shape === "rectangle" ? 4 : 2)) * scale,
      h = (spec.height ?? spec.r * 2) * scale;
    ctx.rect(-w / 2, -h / 2, w, h);
  } else if (spec.shape === "polygon") {
    ctx.moveTo(spec.vertices[0] * scale, -spec.vertices[1] * scale);
    for (let k = 2; k < spec.vertices.length; k += 2)
      ctx.lineTo(spec.vertices[k] * scale, -spec.vertices[k + 1] * scale);
    ctx.closePath();
  } else {
    ctx.moveTo(0, -r * 1.25);
    ctx.lineTo(-r, r * 0.75);
    ctx.lineTo(r, r * 0.75);
    ctx.closePath();
  }
  ctx.fillStyle = ghost
    ? "#dce5e540"
    : $("#blockColorMode").value === "load" && !ghost
      ? loadShade(loadValues.get(spec.id) ?? 0, loadColorReference)
      : $("#groupColors").checked && !ghost
        ? (groups.find((g) => g.id === spec.group)?.color ?? "#b7c8bd")
        : spec.color
          ? spec.color
          : spec.shape === "rectangle"
            ? "#c8b698"
            : ["#a7c9c4", "#c5d9c9", "#d7d2b9"][(spec.id || 0) % 3];
  ctx.strokeStyle = ghost
    ? "#a0b5b5"
    : spec === selected
      ? "#137f77"
      : spec.shape === "polygon"
        ? "#8d8978"
        : "#648e8955";
  ctx.lineWidth = spec === selected ? 2.5 : spec.role === "lintel" ? 2 : 1;
  if (ghost) ctx.setLineDash([4, 4]);
  ctx.globalAlpha = ghost ? 1 : +$("#blockOpacity").value / 100;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.stroke();
  if (!ghost && spec.shape === "disk") {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(r * 0.65, 0);
    ctx.strokeStyle = "#5c918b66";
    ctx.stroke();
  }
  if (!ghost && ["lintel", "load-spreader"].includes(spec.role)) {
    ctx.fillStyle =
      $("#blockColorMode").value === "load" &&
      (loadValues.get(spec.id) ?? 0) / loadColorReference > 0.55
        ? "#f2f2ed"
        : "#514a3c";
    ctx.font = "600 11px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(spec.role === "load-spreader" ? "SPREADER" : "LINTEL", 0, 0);
  }
  ctx.restore();
}
function line(a, b, color, width = 1) {
  const p = screen(a),
    q = screen(b);
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(q.x, q.y);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}
function arrow(p, x, y, color) {
  const len = Math.hypot(x, y);
  if (len < 0.0001) return;
  const l = Math.min(1.2, 0.08 + Math.log1p(len) * 0.2);
  const q = { x: p.x + (x / len) * l, y: p.y + (y / len) * l };
  line(p, q, color, 1.8);
  const s = screen(q),
    t = screen(p),
    a = Math.atan2(s.y - t.y, s.x - t.x);
  ctx.beginPath();
  ctx.moveTo(s.x, s.y);
  ctx.lineTo(s.x - 7 * Math.cos(a - 0.45), s.y - 7 * Math.sin(a - 0.45));
  ctx.moveTo(s.x, s.y);
  ctx.lineTo(s.x - 7 * Math.cos(a + 0.45), s.y - 7 * Math.sin(a + 0.45));
  ctx.stroke();
}
function draw() {
  loadValues =
    sim.time > 0
      ? blockLoads(sim.items, sim.contacts, sim.config.gravity)
      : new Map();
  loadColorReference =
    $("#loadScale").value === "fixed"
      ? Math.max(0.001, +$("#loadReference").value || 150)
      : Math.max(0.001, ...loadValues.values());
  $("#loadColorValue").textContent =
    sim.time === 0
      ? "Press Play to compute loads."
      : `White: 0 N · Black: ${loadColorReference.toFixed(2)} N${$("#loadScale").value === "fixed" ? " or above" : " (scene maximum)"}`;
  ctx.clearRect(0, 0, W, H);
  if (photo && photo.data.visible) {
    const b = photoBounds(photo),
      p = screen({ x: b.left, y: b.top });
    ctx.globalAlpha = photo.data.opacity;
    ctx.drawImage(
      photo.image,
      p.x,
      p.y,
      (b.right - b.left) * scale,
      (b.top - b.bottom) * scale,
    );
    ctx.globalAlpha = 1;
  } else {
    for (let x = 0; x <= 12; x++) line({ x, y: 0 }, { x, y: 8.5 }, "#e4eae8");
    for (let y = 0; y <= 8; y++) line({ x: 0, y }, { x: 12, y }, "#e4eae8");
  }
  for (const c of sim.walls) {
    const p = screen(c.translation()),
      s = c.shape;
    ctx.fillStyle = "#7b9390";
    ctx.fillRect(
      p.x - s.halfExtents.x * scale,
      p.y - s.halfExtents.y * scale,
      s.halfExtents.x * 2 * scale,
      s.halfExtents.y * 2 * scale,
    );
  }
  if ($("#initial").checked)
    initial.forEach((s) => particle(s, s, s.angle, true));
  for (const i of sim.items)
    particle(i, i.body.translation(), i.body.rotation());
  const max = Math.max(0.001, ...sim.contacts.map((c) => c.fn)),
    visible = sim.contacts.filter(
      (c) => c.fn >= max * (+$("#threshold").value / 100),
    ),
    network = connectedContacts(visible, selected);
  for (const c of visible) {
    const intensity = c.fn / max,
      color = `hsl(${170 - intensity * 155} 55% ${55 - intensity * 12}%)`;
    if ($("#chains").checked) {
      const highlight = $("#path").checked && selected;
      ctx.globalAlpha = highlight && !network.has(c) ? 0.12 : 1;
      line(
        c.a.body.translation(),
        c.b ? c.b.body.translation() : c.point,
        color,
        1 + intensity * 6,
      );
      ctx.globalAlpha = 1;
      const p = screen(c.point);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
    if (
      ($("#arrows").checked ||
        $("#normalForces").checked ||
        $("#tangentForces").checked) &&
      (!selected || c.a === selected || c.b === selected)
    ) {
      const sign = selected && c.b === selected ? 1 : -1;
      if ($("#normalForces").checked || $("#arrows").checked)
        arrow(
          c.point,
          sign * c.normal.x * c.fn,
          sign * c.normal.y * c.fn,
          "#dc684d",
        );
      if ($("#tangentForces").checked)
        arrow(
          c.point,
          -sign * c.normal.y * c.ft,
          sign * c.normal.x * c.ft,
          "#815cce",
        );
    }
  }
  if ($("#boundaryForces").checked)
    for (const c of sim.contacts.filter((c) => !c.b))
      arrow(
        c.point,
        -c.normal.x * c.fn + c.normal.y * c.ft,
        -c.normal.y * c.fn - c.normal.x * c.ft,
        "#a47921",
      );
  const boundaryTotals = new Map();
  for (const c of sim.contacts.filter((c) => !c.b)) {
    const r = boundaryTotals.get(c.wall) ?? { x: 0, y: 0 };
    r.x += -c.normal.x * c.fn + c.normal.y * c.ft;
    r.y += -c.normal.y * c.fn - c.normal.x * c.ft;
    boundaryTotals.set(c.wall, r);
  }
  $("#boundarySummary").textContent = $("#boundaryForces").checked
    ? [...boundaryTotals]
        .map(
          ([name, r]) =>
            `${name}: Rx ${r.x.toFixed(2)} N · Ry ${r.y.toFixed(2)} N`,
        )
        .join("; ")
    : "";
  for (const i of sim.items)
    if (i.load && $("#loadForces").checked) {
      const p = i.body.translation();
      const a = i.body.rotation();
      let top = i.r;
      if (i.vertices)
        top = Math.max(
          ...i.vertices
            .filter((_, k) => k % 2 === 0)
            .map(
              (x, k) => x * Math.sin(a) + i.vertices[k * 2 + 1] * Math.cos(a),
            ),
        );
      else if (["rectangle", "square"].includes(i.shape))
        top =
          (Math.abs(Math.sin(a)) * (i.width ?? i.r * 2)) / 2 +
          (Math.abs(Math.cos(a)) * (i.height ?? i.r * 2)) / 2;
      const origin = { x: p.x, y: p.y + top + 0.7 };
      arrow(origin, 0, -i.load, "#3479c9");
      const label = screen(origin);
      ctx.fillStyle = "#3479c9";
      ctx.font = "600 11px system-ui";
      ctx.textAlign = "left";
      ctx.fillText(`${i.load.toFixed(0)} N`, label.x + 8, label.y + 8);
    }
  for (const id of ["removeSelected", "applyLoad", "clearLoad"])
    $("#" + id).disabled = !selected;
  if ($("#residuals").checked || $("#resultantForces").checked)
    for (const i of sim.items)
      arrow(i.body.translation(), i.residual.x, i.residual.y, "#e02e67");
  if (!running && pointer && $("#tool").value === "add")
    particle(
      {
        r: +$("#size").value,
        shape: $("#shape").value === "mixed" ? "disk" : $("#shape").value,
      },
      pointer,
      angle,
      true,
    );
  const sketch = $("#tool").value === "calibrate" ? calibration : draft;
  if (!running && sketch.length) {
    for (let k = 1; k < sketch.length; k++)
      line(sketch[k - 1], sketch[k], "#137f77", 2);
    if (pointer) line(sketch.at(-1), pointer, "#137f77", 1);
    if (draft.length >= 3) {
      ctx.setLineDash([4, 4]);
      line(draft.at(-1), draft[0], "#137f77", 1);
      ctx.setLineDash([]);
    }
    for (const p of sketch) {
      const q = screen(p);
      ctx.beginPath();
      ctx.arc(q.x, q.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#137f77";
      ctx.fill();
    }
  }
  $("#finishTrace").disabled = draft.length < 3;
  $("#undoVertex").disabled = !draft.length;
  $("#cancelTrace").disabled = !draft.length && !calibration.length;
  $("#traceStatus").textContent = draft.length
    ? draft.length + " vertices · Enter / C / right click to close."
    : "Left click: add vertex. Enter / C / right click: close. Esc: cancel. Backspace: undo.";
  $("#particles").textContent = sim.items.length;
  $("#contacts").textContent = sim.contacts.length;
  $("#velocity").innerHTML =
    (sim.speed || 0).toFixed(2) + " <small>m/s</small>";
  $("#time").textContent = "t = " + sim.time.toFixed(2) + " s";
  $("#status").textContent = sim.status(initial);
  $("#assignGroup").disabled = !selected;
  for (const count of document.querySelectorAll("[data-group-count]"))
    count.textContent =
      sim.items.filter((i) => i.group === count.dataset.groupCount).length +
      " blocks";
  const groupSelect = $("#selectedGroup");
  if (selected && groupSelect.dataset.item !== String(selected.id)) {
    groupSelect.value = selected.group;
    groupSelect.dataset.item = selected.id;
  }
  if (!selected) groupSelect.dataset.item = "";
  drawBlockDiagram($("#blockDiagram"), selected, sim);
  if (selected) {
    const r = selected.residual;
    const cs = sim.contacts.filter((c) => c.a === selected || c.b === selected);
    $("#selection").innerHTML =
      `<strong>Particle ${selected.id} · ${{ disk: "disk", square: "square", triangle: "triangle", rectangle: "rectangle", polygon: "polygonal block" }[selected.shape]}</strong>${selected.role ? `<p class="block-role">${{ brick: "Regular brick", "corner-stone": "Corner stone", "rounded-stone": "Rounded stone", rubble: "Irregular stone", lintel: "Monolithic lintel", "load-spreader": "Load-spreading block", "traced-block": "Photo-traced block" }[selected.role]}</p>` : ""}<dl><dt>Mass</dt><dd>${selected.body.mass().toFixed(3)} kg</dd><dt>Load indicator</dt><dd>${(loadValues.get(selected.id) ?? 0).toFixed(2)} N</dd><dt>Vertical load</dt><dd>${selected.load.toFixed(2)} N</dd><dt>Contacts</dt><dd>${cs.length}</dd><dt>Maximum normal force</dt><dd>${Math.max(0, ...cs.map((c) => c.fn)).toFixed(3)} N</dd><dt>Resultant Rx</dt><dd>${r.x.toFixed(3)} N</dd><dt>Resultant Ry</dt><dd>${r.y.toFixed(3)} N</dd><dt>Residual moment</dt><dd>${selected.torque.toFixed(3)} N·m</dd></dl>${sim.time === 0 ? '<p class="hint">Start the experiment to compute forces.</p>' : ""}`;
  } else
    $("#selection").textContent =
      "Click a particle to inspect its mass, forces and moment.";
}
function frame(now) {
  const elapsed = Math.min(0.05, (now - last) / 1000 || 0);
  last = now;
  if (running) {
    acc += elapsed * +$("#speed").value;
    let steps = 0;
    while (acc >= DT && steps++ < 24) {
      sim.step();
      acc -= DT;
    }
  }
  draw();
  requestAnimationFrame(frame);
}
rebuild(generate(42, 55));
document.body.dataset.ready = "true";
$("#app").inert = false;
requestAnimationFrame(frame);
