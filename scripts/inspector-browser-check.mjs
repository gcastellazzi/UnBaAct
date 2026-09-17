import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5173");
  await page.waitForFunction(() => document.body.dataset.ready === "true");
  await page.selectOption("#opus", "window-irregular-corners");
  await page.click("#loadOpus");
  await page.click("#tab-button-groups");
  await page.check("#groupColors");
  await page.locator('input[data-group="regular"]').fill("0.8");
  await page.locator('input[data-group="regular"]').dispatchEvent("input");
  await page.locator('input[data-group="irregular"]').fill("0.15");
  await page.locator('input[data-group="irregular"]').dispatchEvent("input");
  await page.fill("#groupName", "Lintel");
  await page.click("#addGroup");
  const b = await page.locator("#scene").boundingBox();
  const v = JSON.parse(await page.locator("#scene").getAttribute("data-view"));
  await page.mouse.click(b.x + v.ox + 6 * v.scale, b.y + v.oy - 4.55 * v.scale);
  await page.selectOption("#selectedGroup", { label: "Lintel" });
  await page.click("#assignGroup");
  await page.click("#tab-button-block");
  assert.match(
    await page.locator("#selection").innerText(),
    /Monolithic lintel/,
  );
  await page.click("#applyLoad");
  await page.click("#play");
  await page.waitForTimeout(500);
  await page.click("#play");
  assert.ok(await page.locator("#blockDiagram").isVisible());
  await page.screenshot({ path: "/tmp/unbaact-inspector-block.png" });
  await page.click("#tab-button-observe");
  await page.check("#normalForces");
  await page.check("#tangentForces");
  await page.check("#resultantForces");
  assert.ok((await page.locator("#boundarySummary").innerText()).includes("N"));
  await page.uncheck("#normalForces");
  await page.uncheck("#boundaryForces");
  await page.waitForFunction(
    () => document.querySelector("#boundarySummary").textContent === "",
  );
  await page.uncheck("#tangentForces");
  await page.uncheck("#loadForces");
  await page.uncheck("#resultantForces");
  await page.click("#tab-button-block");
  await page.waitForFunction(()=>document.querySelector("#blockForceList").textContent.includes("Block #"));
  assert.match(await page.locator("#blockForceList").innerText(), /Rx .* N.*Ry .* N/);
  await page.click("#tab-button-observe");
  const download = page.waitForEvent("download");
  await page.click("#export");
  await (await download).saveAs("/tmp/unbaact-groups.json");
  const saved = JSON.parse(readFileSync("/tmp/unbaact-groups.json"));
  assert.equal(saved.config.groups.length, 3);
  assert.equal(saved.config.groups[0].friction, 0.8);
  assert.equal(saved.config.groups[1].friction, 0.15);
  assert.ok(
    saved.particles.some(
      (p) => p.role === "lintel" && p.group === saved.config.groups[2].id,
    ),
  );
  await page.setInputFiles("#import", "/tmp/unbaact-groups.json");
  await page.waitForTimeout(200);
  await page.click("#tab-button-groups");
  assert.equal(await page.locator("#groupList input").count(), 3);
  for (const [width, height] of [
    [1920, 1080],
    [1280, 800],
    [900, 650],
    [800, 450],
    [390, 844],
    [360, 640],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(120);
    const state = await page.evaluate(() => ({
      overflow: document.documentElement.scrollHeight > innerHeight,
      boxes: ["buildPanel", "observePanel", "viewPanel", "experimentPanel"].map(
        (id) => {
          const r = document.getElementById(id).getBoundingClientRect();
          return (
            r.x >= 0 &&
            r.y >= 0 &&
            r.right <= innerWidth + 1 &&
            r.bottom <= innerHeight + 1
          );
        },
      ),
    }));
    assert.equal(state.overflow, false, `${width} page overflow`);
    assert.ok(state.boxes.every(Boolean), `${width} hidden panels`);
  }
  assert.deepEqual(errors, []);
  console.log(
    "Inspector OK: groups, independent friction, assignment, block diagram, reactions, toggles, export/import and six viewports.",
  );
} finally {
  await browser.close();
}
