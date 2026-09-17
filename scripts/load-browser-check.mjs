import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5173");
  await page.waitForFunction(() => document.body.dataset.ready === "true");
  for (const id of [
    "load-concentrated",
    "load-distributed",
    "load-comparison",
  ]) {
    await page.selectOption("#opus", id);
    await page.click("#loadOpus");
    assert.equal(await page.inputValue("#blockColorMode"), "load");
    assert.equal(await page.inputValue("#loadScale"), "fixed");
    assert.equal(await page.inputValue("#loadReference"), "150");
    assert.equal(await page.isChecked("#chains"), false);
    await page.selectOption("#speed", "2");
    await page.click("#play");
    await page.waitForFunction(
      () =>
        parseFloat(document.querySelector("#time").textContent.slice(4)) >= 10,
    );
    await page.click("#play");
    assert.ok(Number(await page.locator("#contacts").innerText()) > 0);
    assert.match(await page.locator("#loadColorValue").innerText(), /150.00 N/);
    await page.screenshot({ path: `/tmp/unbaact-${id}.png` });
  }
  const event = page.waitForEvent("download");
  await page.click("#export");
  await (await event).saveAs("/tmp/unbaact-load-view.json");
  const saved = JSON.parse(readFileSync("/tmp/unbaact-load-view.json"));
  assert.equal(saved.particles.filter((p) => p.load === 150).length, 2);
  assert.equal(saved.view.blockColorMode, "load");
  assert.equal(saved.config.bounds.top, 4.5);
  await page.selectOption("#blockColorMode", "material");
  await page.locator("#blockColorMode").dispatchEvent("change");
  await page.setInputFiles("#import", "/tmp/unbaact-load-view.json");
  await page.waitForFunction(
    () => document.querySelector("#blockColorMode").value === "load",
  );
  await page.selectOption("#blockColorMode", "groups");
  await page.locator("#blockColorMode").dispatchEvent("change");
  assert.equal(await page.isChecked("#groupColors"), true);
  await page.click("#tab-button-groups");
  await page.uncheck("#groupColors");
  assert.equal(await page.inputValue("#blockColorMode"), "material");
  await page.click("#tab-button-observe");
  await page.selectOption("#blockColorMode", "load");
  await page.selectOption("#loadScale", "auto");
  assert.equal(await page.locator("#loadReferenceLabel").isVisible(), false);
  assert.deepEqual(errors, []);
  console.log(
    "Load colouring OK: three presets, grayscale, shared scale, real contacts, comparison export/import and group-colour switching.",
  );
} finally {
  await browser.close();
}
