import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5173");
  await page.waitForFunction(() => document.body.dataset.ready === "true");
  const base64 = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 800;
    c.height = 500;
    const g = c.getContext("2d");
    g.fillStyle = "#e5dfce";
    g.fillRect(0, 0, 800, 500);
    for (let row = 0; row < 10; row++)
      for (let col = 0; col < 8; col++) {
        g.fillStyle = ["#b19a84", "#b7bb9e", "#a5b4ad"][(row + col) % 3];
        g.fillRect(col * 100 + 3, row * 50 + 3, 94, 44);
      }
    return c.toDataURL("image/png").split(",")[1];
  });
  await page.setInputFiles("#photoUpload", {
    name: "wall-reference.png",
    mimeType: "image/png",
    buffer: Buffer.from(base64, "base64"),
  });
  await page.waitForFunction(
    () =>
      document.querySelector("#particles").textContent === "0" &&
      document.querySelector("#tool").value === "trace",
  );
  assert.equal(await page.inputValue("#thickness"), "0.3");
  assert.equal(await page.inputValue("#density"), "1800");
  async function point(x, y, options) {
    const b = await page.locator("#scene").boundingBox(),
      v = JSON.parse(await page.locator("#scene").getAttribute("data-view"));
    await page.mouse.click(
      b.x + v.ox + x * v.scale,
      b.y + v.oy - y * v.scale,
      options,
    );
  }
  for (const [x, y] of [
    [4, 2],
    [5, 2],
    [5, 3],
    [4, 3],
  ])
    await point(x, y);
  await point(4, 3, { button: "right" });
  await page.waitForFunction(
    () => document.querySelector("#particles").textContent === "1",
  );
  assert.equal(await page.inputValue("#tool"), "trace");
  await page.waitForFunction(() =>
    document.querySelector("#selection").textContent.includes("540.000 kg"),
  );
  for (const [x, y] of [
    [6, 2],
    [8, 2],
    [8, 2.6],
    [7.2, 2.6],
    [7.2, 3.3],
    [6, 3.3],
  ])
    await point(x, y);
  await page.keyboard.press("c");
  await page.waitForFunction(
    () => document.querySelector("#particles").textContent === "2",
  );
  await point(3, 4);
  await point(3.2, 4);
  await page.keyboard.press("Backspace");
  await page.waitForFunction(() =>
    document.querySelector("#traceStatus").textContent.includes("1 vertices"),
  );
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () => document.querySelector("#cancelTrace").disabled,
  );
  await page.fill("#thickness", "0.6");
  await page.locator("#thickness").blur();
  await page.fill("#referenceLength", "2");
  await page.click("#calibratePhoto");
  await point(4, 4);
  await point(5, 4);
  await page.waitForFunction(
    () =>
      Math.abs(Number(document.querySelector("#photoWidth").value) - 20) <
      0.001,
  );
  assert.equal(await page.inputValue("#tool"), "trace");
  const download = page.waitForEvent("download");
  await page.click("#tab-button-observe");
  await page.click("#export");
  await (await download).saveAs("/tmp/unbaact-photo.json");
  const saved = JSON.parse(readFileSync("/tmp/unbaact-photo.json"));
  assert.equal(saved.particles.length, 2);
  assert.ok(saved.photo.dataURL.startsWith("data:image/jpeg;base64,"));
  assert.ok(Math.abs(saved.particles[0].x - 8) < 0.001);
  assert.ok(Math.abs(saved.particles[0].y - 5) < 0.001);
  assert.equal(saved.config.thickness, 0.6);
  await page.reload();
  await page.waitForFunction(() => document.body.dataset.ready === "true");
  await page.click("#tab-button-observe");
  await page.setInputFiles("#import", "/tmp/unbaact-photo.json");
  await page.waitForFunction(
    () => document.querySelector("#particles").textContent === "2",
  );
  assert.ok(
    Math.abs(Number(await page.inputValue("#photoWidth")) - 20) < 0.001,
  );
  await page.selectOption("#tool", "select");
  await page.waitForTimeout(100);
  await point(8, 5);
  await page.waitForTimeout(100);

  await page.waitForFunction(
    () =>
      Math.abs(
        Number(
          document
            .querySelector("#selection")
            .textContent.match(/Mass([\d.]+) kg/)?.[1],
        ) - 4320,
      ) < 0.01,
  );
  await page.click("#tab-button-block");
  await page.fill("#load", "1000");
  await page.click("#applyLoad");
  await page.waitForFunction(() =>
    document.querySelector("#selection").textContent.includes("1000.00 N"),
  );
  await page.screenshot({ path: "/tmp/unbaact-photo-tracing.png" });
  await page.click("#play");
  await page.waitForFunction(
    () => document.querySelector("#time").textContent !== "t = 0.00 s",
  );
  await page.click("#play");
  assert.deepEqual(errors, []);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= innerHeight,
    ),
    true,
  );
  console.log(
    "Photo workflow OK: local upload, right-click/C closure, continuous insertion, undo/cancel, compound block, thickness, 2-point calibration, embedded export/import, mass, load and playback.",
  );
} finally {
  await browser.close();
}
