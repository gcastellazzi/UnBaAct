import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { generateOpus } from "../src/scenarios.js";
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5173");
  await page.waitForFunction(() => document.body.dataset.ready === "true");
  await page.selectOption("#opus", "load-oblique-irregular");
  await page.click("#loadOpus");
  const base = generateOpus("load-oblique-irregular"),
    loaded = base.find((i) => i.loadX === 85);
  await page.locator(".joint-tools summary").click();
  await page.check("#imperfections");
  await page.waitForFunction(
    (n) => Number(document.querySelector("#particles").textContent) === n,
    base.length + 40,
  );
  await page.uncheck("#imperfections");
  await page.waitForFunction(
    (n) => Number(document.querySelector("#particles").textContent) === n,
    base.length,
  );
  await page.check("#imperfections");
  await page.click("#insertSnecks");
  await page.waitForFunction(
    (n) => Number(document.querySelector("#particles").textContent) > n,
    base.length + 40,
  );
  const box = await page.locator("#scene").boundingBox(),
    v = JSON.parse(await page.locator("#scene").getAttribute("data-view"));
  await page.mouse.click(
    box.x + v.ox + loaded.x * v.scale,
    box.y + v.oy - loaded.y * v.scale,
  );
  await page.click("#tab-button-block");
  await page.waitForFunction(() =>
    document.querySelector("#selection").textContent.includes("85.00 N"),
  );
  await page.fill("#loadX", "-30");
  await page.fill("#load", "100");
  await page.click("#applyLoad");
  await page.waitForFunction(() =>
    document.querySelector("#selection").textContent.includes("-30.00 N"),
  );
  await page.click("#clearLoad");
  await page.waitForFunction(() =>
    document
      .querySelector("#selection")
      .textContent.includes("Horizontal load0.00 N"),
  );
  await page.fill("#loadX", "85");
  await page.fill("#load", "150");
  await page.click("#applyLoad");
  await page.click("#tab-button-observe");
  const event = page.waitForEvent("download");
  await page.click("#export");
  await (await event).saveAs("/tmp/unbaact-joints.json");
  const saved = JSON.parse(readFileSync("/tmp/unbaact-joints.json"));
  assert.ok(saved.particles.some((p) => p.role === "imperfection"));
  assert.ok(saved.particles.some((p) => p.role === "sneck"));
  assert.equal(saved.particles.find((p) => p.loadX === 85).load, 150);
  await page.setInputFiles("#import", "/tmp/unbaact-joints.json");
  await page.waitForTimeout(150);
  assert.equal(await page.isChecked("#imperfections"), true);
  await page.selectOption("#speed", "2");
  await page.click("#play");
  await page.waitForFunction(
    () => parseFloat(document.querySelector("#time").textContent.slice(4)) >= 4,
  );
  await page.click("#play");
  await page.screenshot({ path: "/tmp/unbaact-oblique-joints.png" });
  assert.deepEqual(errors, []);
  console.log(
    "Joints OK: oblique preset, horizontal force reversal/clear, imperfection toggle, snecks, export/import and live contacts.",
  );
} finally {
  await browser.close();
}
