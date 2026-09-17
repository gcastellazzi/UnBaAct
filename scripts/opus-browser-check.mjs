import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { OPUS_SCENARIOS, generateOpus } from "../src/scenarios.js";
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5173");
  await page.waitForFunction(() => document.body.dataset.ready === "true");
  for (const s of OPUS_SCENARIOS) {
    await page.selectOption("#opus", s.id);
    await page.click("#loadOpus");
    await page.waitForFunction(
      (n) => Number(document.querySelector("#particles").textContent) === n,
      generateOpus(s.id).length,
    );
    await page.locator("#scene").scrollIntoViewIfNeeded();
    await page.locator("#scene").screenshot({ path: `/tmp/opus-${s.id}.png` });
    await page.click("#play");
    await page.waitForFunction(
      () => Number(document.querySelector("#contacts").textContent) > 5,
    );
    await page.click("#play");
    await page.click("#reset");
  }
  await page.setInputFiles(
    "#import",
    "examples/FCH01_F1_7g_opus_spicatum.json",
  );
  await page.waitForFunction(
    () => document.querySelector("#particles").textContent === "221",
  );
  await page.selectOption("#tool", "select");
  await page.locator("#scene").scrollIntoViewIfNeeded();
  const b = await page.locator("#scene").boundingBox(),
    p = generateOpus("spicatum")[100];
  const sc = Math.min(b.width / 12.6, b.height / 9.2),
    ox = (b.width - 12 * sc) / 2,
    oy = b.height - (b.height - 8.6 * sc) / 2 - 0.3 * sc;
  await page.mouse.click(b.x + ox + p.x * sc, b.y + oy - p.y * sc);
  await page.waitForFunction(() =>
    document
      .querySelector("#selection")
      .textContent.includes("polygonal block"),
  );
  await page.click("#tab-button-block");
  await page.click("#removeSelected");
  await page.waitForFunction(
    () => document.querySelector("#particles").textContent === "220",
  );
  for (const id of [
    "defensive-wall-bologna",
    "window-regular-bricks",
    "window-irregular-corners",
  ]) {
    const scenario = OPUS_SCENARIOS.find((s) => s.id === id);
    await page.click("#tab-button-observe");
    await page.setInputFiles("#import", `examples/${scenario.source}.json`);
    await page.waitForFunction(
      (n) => Number(document.querySelector("#particles").textContent) === n,
      generateOpus(id).length,
    );
    if (id.startsWith("window-")) {
      await page.locator("#scene").scrollIntoViewIfNeeded();
      const box = await page.locator("#scene").boundingBox(),
        p = generateOpus(id).find((b) => b.role === "lintel");
      const sc = Math.min(box.width / 12.6, box.height / 9.2),
        ox = (box.width - 12 * sc) / 2,
        oy = box.height - (box.height - 8.6 * sc) / 2 - 0.3 * sc;
      await page.mouse.click(box.x + ox + p.x * sc, box.y + oy - p.y * sc);
      await page.waitForFunction(() =>
        document
          .querySelector("#selection")
          .textContent.includes("Monolithic lintel"),
      );
      await page.click("#tab-button-block");
      await page.fill("#load", "10");
      await page.click("#applyLoad");
      await page.waitForFunction(() =>
        document.querySelector("#selection").textContent.includes("10.00 N"),
      );
      const download = page.waitForEvent("download");
      await page.click("#tab-button-observe");
      await page.click("#export");
      await (await download).saveAs("/tmp/unbaact-loaded-window.json");
      await page.click("#tab-button-observe");
      await page.setInputFiles("#import", "/tmp/unbaact-loaded-window.json");
      await page.waitForFunction(
        (n) => Number(document.querySelector("#particles").textContent) === n,
        generateOpus(id).length,
      );
    }
  }
  assert.deepEqual(errors, []);
  console.log(
    "Masonry browser OK: 10 scenarios, rendering, contacts, Play/reset, polygon import, selection and removal.",
  );
} finally {
  await browser.close();
}
