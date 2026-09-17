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
  await page.click("#clear");
  await page.selectOption("#boundary", "free");
  await page.selectOption("#tool", "add");
  async function point(x, y, options) {
    const b = await page.locator("#scene").boundingBox(),
      v = JSON.parse(await page.locator("#scene").getAttribute("data-view"));
    await page.mouse.click(
      b.x + v.ox + x * v.scale,
      b.y + v.oy - y * v.scale,
      options,
    );
  }
  for (const p of [
    [4, 4],
    [7, 4],
    [5, 6],
  ])
    await point(...p);
  await page.selectOption("#tool", "tie");
  await point(4, 4);
  await page.keyboard.press("Escape");
  await point(7, 4);
  await point(7, 4);
  await point(4, 4);
  await page.waitForFunction(() =>
    document.querySelector("#tieStatus").textContent.startsWith("1 ties"),
  );
  await point(4, 4);
  await point(5, 6);
  await page.waitForFunction(() =>
    document.querySelector("#tieStatus").textContent.startsWith("2 ties"),
  );
  await page.locator(".joint-tools").evaluate((e) => (e.open = true));
  const event = page.waitForEvent("download");
  await page.click("#export");
  await (await event).saveAs("/tmp/unbaact-ties.json");
  const saved = JSON.parse(readFileSync("/tmp/unbaact-ties.json"));
  assert.equal(saved.ties.length, 2);
  assert.equal(saved.initialTies.length, 2);
  await page.setInputFiles("#import", "/tmp/unbaact-ties.json");
  await page.waitForFunction(() =>
    document.querySelector("#tieStatus").textContent.startsWith("2 ties"),
  );
  await page.selectOption("#tool", "select");
  await point(4, 4);
  await page.click("#tab-button-block");
  await page.fill("#loadX", "10");
  await page.fill("#load", "0");
  await page.click("#applyLoad");
  await page.click("#play");
  await page.waitForFunction(
    () => parseFloat(document.querySelector("#time").textContent.slice(4)) >= 1,
  );
  await page.click("#play");
  assert.match(await page.locator("#blockForceList").innerText(), /Tie #/);
  await page.screenshot({ path: "/tmp/unbaact-ties.png" });
  await page.click("#reset");
  await page.waitForFunction(() =>
    document.querySelector("#tieStatus").textContent.startsWith("2 ties"),
  );
  await page.selectOption("#tool", "select");
  await point(4, 4);
  await page.click("#removeBlockTies");
  await page.waitForFunction(() =>
    document.querySelector("#tieStatus").textContent.startsWith("0 ties"),
  );
  await page.click("#tab-button-observe");
  await page.setInputFiles("#import", "/tmp/unbaact-ties.json");
  await page.waitForFunction(() =>
    document.querySelector("#tieStatus").textContent.startsWith("2 ties"),
  );
  await page.selectOption("#tool", "select");
  await point(4, 4);
  await page.keyboard.press("Delete");
  await page.waitForFunction(() =>
    document.querySelector("#tieStatus").textContent.startsWith("0 ties"),
  );
  assert.deepEqual(errors, []);
  console.log(
    "Ties OK: click-click, same-block rejection, Escape, multiple ties, reactions, export/import, Reset, tie removal and endpoint deletion.",
  );
} finally {
  await browser.close();
}
