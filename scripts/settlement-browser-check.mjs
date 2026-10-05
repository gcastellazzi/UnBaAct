import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5173");
  await page.waitForFunction(() => document.body.dataset.ready === "true");
  await page.locator("#baseTools summary").click();
  await page.selectOption("#settlementBond", "staggered");
  await page.click("#loadSettlementExample");
  assert.equal(await page.locator("#base-zone").inputValue(), "center");
  assert.equal(await page.locator("#analysisType").inputValue(), "coupled");
  await page.click("#play");
  await page.waitForFunction(() => parseFloat(document.querySelector("#time").textContent.slice(4)) >= 4);
  await page.click("#play");
  await page.waitForTimeout(350);
  assert.ok((await page.locator("#coupledReport").textContent()).includes("Rigid base reaction"));
  for (const zone of ["left", "right"]) {
    await page.selectOption("#base-zone", zone);
    await page.fill("#base-zoneFraction", "30");
    await page.click("#applyBase");
    assert.ok((await page.locator("#baseStatus").textContent()).includes(`${zone} region`));
  }
  await page.click("#step");
  await page.click("#tab-button-observe");
  const download = page.waitForEvent("download");
  await page.click("#export");
  const file = await download;
  const data = JSON.parse(await readFile(await file.path(), "utf8"));
  assert.equal(data.config.elasticBase.zone, "right");
  assert.equal(data.config.elasticBase.zoneFraction, .3);
  assert.equal(data.baseState.length, 7);
  await page.click("#clear");
  await page.locator("#import").setInputFiles({ name: "settlement.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(data)) });
  await page.waitForFunction(() => document.querySelector("#baseStatus").textContent.includes("right region"));
  assert.equal(await page.locator("#base-zoneFraction").inputValue(), "30");
  await page.click("#reset");
  await page.click("#step");
  assert.equal(+(await page.locator("#particles").textContent()), data.particles.length);
  await page.click("#removeBase");
  assert.equal(await page.locator("#baseStatus").textContent(), "Rigid floor active.");
  assert.deepEqual(errors, []);
  console.log("Settlement UI: presets, central/lateral region, width, mixed reactions, export/import, reset and removal passed.");
} finally { await browser.close(); }
