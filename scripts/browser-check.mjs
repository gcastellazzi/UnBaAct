import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5173");
  await page.waitForFunction(() => document.body.dataset.ready === "true");
  await page.click("#play");
  await page.waitForFunction(
    () => Number(document.querySelector("#contacts").textContent) > 10,
  );
  await page.click("#play");
  await page.check("#normalForces");
  await page.check("#resultantForces");
  await page.selectOption("#boundary", "free");
  await page.click("#reset");
  await page.waitForFunction(
    () => document.querySelector("#time").textContent === "t = 0.00 s",
  );
  await page.selectOption("#shape", "mixed");
  await page.click("#generate");
  await page.click("#play");
  await page.waitForFunction(
    () => Number(document.querySelector("#contacts").textContent) > 10,
  );
  await page.click("#play");
  await page.screenshot({ path: "/tmp/unbaact-desktop.png", fullPage: true });
  await page.click("#clear");
  await page.waitForFunction(
    () => document.querySelector("#particles").textContent === "0",
  );
  await page.selectOption("#tool", "add");
  await page.locator("#scene").scrollIntoViewIfNeeded();
  const box = await page.locator("#scene").boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction(
    () => document.querySelector("#particles").textContent === "1",
  );
  const download = page.waitForEvent("download");
  await page.click("#tab-button-observe");
  await page.click("#export");
  await (await download).saveAs("/tmp/unbaact-export.json");
  await page.click("#clear");
  await page.click("#tab-button-observe");
  await page.setInputFiles("#import", "/tmp/unbaact-export.json");
  await page.waitForFunction(
    () => document.querySelector("#particles").textContent === "1",
  );
  await page.selectOption("#tool", "select");
  await page.locator("#scene").scrollIntoViewIfNeeded();
  const currentBox = await page.locator("#scene").boundingBox();
  await page.mouse.click(
    currentBox.x + currentBox.width / 2,
    currentBox.y + currentBox.height / 2,
  );
  await page.waitForFunction(
    () => !document.querySelector("#applyLoad").disabled,
  );
  await page.click("#tab-button-block");
  await page.fill("#load", "7");
  await page.click("#applyLoad");
  await page.waitForFunction(() =>
    document.querySelector("#selection").textContent.includes("7.00 N"),
  );
  await page.click("#clearLoad");
  await page.waitForFunction(() =>
    document.querySelector("#selection").textContent.includes("0.00 N"),
  );
  await page.click("#kickRight");
  await page.waitForFunction(() =>
    document.querySelector("#play").textContent.includes("Pause"),
  );
  await page.click("#play");
  await page.click("#tab-button-block");
  await page.click("#removeSelected");
  await page.waitForFunction(
    () => document.querySelector("#particles").textContent === "0",
  );
  await page.selectOption("#boundary", "cup");
  await page.uncheck("#rightWall");
  await page.click("#corners");
  await page.waitForFunction(
    () => document.querySelector("#particles").textContent === "69",
  );
  const download2 = page.waitForEvent("download");
  await page.click("#tab-button-observe");
  await page.click("#export");
  await (await download2).saveAs("/tmp/unbaact-corners.json");
  await page.click("#clear");
  await page.click("#tab-button-observe");
  await page.setInputFiles("#import", "/tmp/unbaact-corners.json");
  await page.waitForFunction(
    () => document.querySelector("#particles").textContent === "69",
  );
  assert.equal(await page.locator("#rightWall").isChecked(), false);
  // Select the uppermost left corner stone and move it while paused.
  await page.locator("#scene").scrollIntoViewIfNeeded();
  const dims = await page.locator("#scene").boundingBox();
  const sc = Math.min(dims.width / 12.6, dims.height / 9.2),
    originX = (dims.width - 12 * sc) / 2,
    originY = dims.height - (dims.height - 8.6 * sc) / 2 - 0.3 * sc;
  await page.mouse.move(
    dims.x + originX + 1.82 * sc,
    dims.y + originY - 4.375 * sc,
  );
  await page.mouse.down();
  await page.mouse.move(dims.x + originX + 4 * sc, dims.y + originY - 6 * sc);
  await page.mouse.up();
  await page.waitForFunction(() =>
    document.querySelector("#selection").textContent.includes("rectangle"),
  );
  await page.click("#tab-button-block");
  await page.click("#removeSelected");
  await page.waitForFunction(
    () => document.querySelector("#particles").textContent === "68",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "/tmp/unbaact-mobile.png", fullPage: true });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Browser OK: Play/pause, contacts, reset, mixed shapes, placement, export/import, removal, shake, load, corner stones, independent walls, mobile.",
  );
} finally {
  await browser.close();
}
