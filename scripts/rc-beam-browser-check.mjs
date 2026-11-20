import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5173");
  await page.waitForFunction(() => document.body.dataset.ready === "true");
  await page.selectOption("#opus", "rc-beam-cobble-wall");
  await page.click("#loadOpus");
  assert.equal(await page.inputValue("#boundary"), "cup");
  assert.equal(await page.inputValue("#thickness"), "0.3");
  assert.equal(await page.inputValue("#density"), "1800");
  assert.equal(await page.inputValue("#blockColorMode"), "load");
  assert.equal(await page.inputValue("#loadReference"), "100000");
  assert.equal(Number(await page.locator("#particles").innerText()), 96);

  const canvas = page.locator("#scene"), box = await canvas.boundingBox();
  const view = JSON.parse(await canvas.getAttribute("data-view"));
  // Select the first beam segment at its initial centre.
  await page.mouse.click(box.x + view.ox + 1.646875 * view.scale,
    box.y + view.oy - 6.77 * view.scale);
  await page.click("#tab-button-block");
  await page.waitForFunction(() =>
    document.querySelector("#selection").textContent.includes("Deformable RC beam segment"));
  assert.match(await page.locator("#selection").innerText(), /30000\.00 N/);

  await page.click("#tab-button-observe");
  await page.selectOption("#speed", "2");
  await page.click("#play");
  await page.waitForFunction(() => parseFloat(document.querySelector("#time").textContent.slice(4)) >= 2,
    null, { timeout: 30000 });
  await page.click("#play");
  assert.ok(Number(await page.locator("#contacts").innerText()) > 20);
  await canvas.screenshot({ path: "/tmp/unbaact-rc-beam-cobble-wall.png" });

  const download = page.waitForEvent("download");
  await page.click("#export");
  await (await download).saveAs("/tmp/unbaact-rc-beam-cobble-wall.json");
  const saved = JSON.parse(readFileSync("/tmp/unbaact-rc-beam-cobble-wall.json"));
  const beam = saved.particles.filter((p) => p.role === "rc-beam-segment");
  assert.equal(beam.length, 8);
  assert.equal(beam[0].beamAxial, 5e7);
  assert.equal(saved.config.materialDensity, 1800);
  assert.equal(saved.config.bounds.sideWallTop, 6.5);
  await page.setInputFiles("#import", "/tmp/unbaact-rc-beam-cobble-wall.json");
  await page.waitForFunction(() => Number(document.querySelector("#particles").textContent) === 96);
  assert.equal(await page.inputValue("#density"), "1800");

  await page.selectOption("#opus", "rc-beam-cobble-wall-wide");
  await page.click("#loadOpus");
  assert.equal(Number(await page.locator("#particles").innerText()), 212);
  await canvas.screenshot({ path: "/tmp/unbaact-rc-beam-cobble-wall-wide.png" });
  const wideDownload = page.waitForEvent("download");
  await page.click("#export");
  await (await wideDownload).saveAs("/tmp/unbaact-rc-beam-cobble-wall-wide.json");
  const wide = JSON.parse(readFileSync("/tmp/unbaact-rc-beam-cobble-wall-wide.json"));
  assert.equal(wide.config.bounds.right, 20.95);
  assert.equal(wide.particles.filter((p) => p.role === "rc-beam-segment").length, 16);

  await page.selectOption("#opus", "rc-beam-cobble-wall-elastic-base");
  await page.click("#loadOpus");
  assert.equal(Number(await page.locator("#particles").innerText()), 59);
  assert.equal(await page.inputValue("#thickness"), "0.5");
  assert.match(await page.locator("#baseStatus").textContent(), /Winkler active/);
  await canvas.screenshot({ path: "/tmp/unbaact-rc-beam-cobble-wall-elastic-base.png" });
  const elasticDownload = page.waitForEvent("download");
  await page.click("#export");
  await (await elasticDownload).saveAs("/tmp/unbaact-rc-beam-cobble-wall-elastic-base.json");
  const elastic = JSON.parse(readFileSync("/tmp/unbaact-rc-beam-cobble-wall-elastic-base.json"));
  assert.equal(elastic.config.elasticBase.EI, 34.875e6);
  assert.equal(elastic.config.elasticBase.k, 5e6);
  assert.equal(elastic.particles.reduce((sum, p) => sum + (p.load || 0), 0), 75000);
  assert.deepEqual(errors, []);
  console.log("RC beam/cobble wall browser OK: standard, double-width and 5 m elastic-soil presets, units, loads, contacts, rendering and JSON persistence.");
} finally {
  await browser.close();
}
