import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5173");
  await page.waitForFunction(() => document.body.dataset.ready === "true");
  assert.equal(await page.locator("html").getAttribute("lang"), "en");
  for (const [width, height] of [
    [1920, 1080],
    [1280, 800],
    [900, 650],
    [800, 450],
    [390, 844],
    [360, 640],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForFunction(
      () =>
        Math.abs(
          document.querySelector("#app").getBoundingClientRect().height -
            innerHeight,
        ) < 2,
    );
    const boxes = {};
    for (const id of [
      "buildPanel",
      "viewPanel",
      "observePanel",
      "experimentPanel",

      "scene",
    ]) {
      boxes[id] = await page.locator("#" + id).boundingBox();
      const b = boxes[id];
      assert.ok(
        b.x >= 0 &&
          b.y >= 0 &&
          b.x + b.width <= width + 1 &&
          b.y + b.height <= height + 1,
        `${id} outside ${width}x${height}`,
      );
    }
    assert.ok(
      boxes.buildPanel.x + boxes.buildPanel.width <= boxes.viewPanel.x + 1,
    );
    assert.ok(
      boxes.observePanel.x >= boxes.viewPanel.x + boxes.viewPanel.width - 1,
    );
    assert.ok(
      boxes.experimentPanel.y >= boxes.scene.y + boxes.scene.height - 1,
    );

    assert.ok(boxes.scene.width > 0 && boxes.scene.height > 0);
    assert.equal(
      await page.evaluate(
        () =>
          document.documentElement.scrollHeight <= innerHeight &&
          document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.evaluate(() => window.scrollTo(0, 1000));
    assert.equal(await page.evaluate(() => scrollY), 0);
    await page.screenshot({
      path: `/tmp/unbaact-docked-${width}x${height}.png`,
    });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.locator(".app-menu summary").click();
  await page.click("#openCredits");
  assert.equal(await page.locator("#credits").isVisible(), true);
  await page.keyboard.press("Escape");
  await page.locator(".app-menu summary").click();
  await page.click("#openHelp");
  await page.click("#help .close-dialog");
  await page.click("#clear");
  await page.waitForFunction(
    () => document.querySelector("#particles").textContent === "0",
  );
  await page.selectOption("#tool", "add");
  const box = await page.locator("#scene").boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction(
    () => document.querySelector("#particles").textContent === "1",
  );
  await page.selectOption("#tool", "select");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction(
    () => !document.querySelector("#applyLoad").disabled,
  );
  const dockBefore = await page.locator("#experimentPanel").boundingBox();
  await page.setViewportSize({ width: 900, height: 650 });
  const dockAfter = await page.locator("#experimentPanel").boundingBox();
  assert.ok(dockAfter.y + dockAfter.height <= 650);
  assert.ok(dockBefore.height > 0);
  await page.click("#tab-button-block");
  await page.fill("#load", "5");
  await page.click("#applyLoad");
  await page.waitForFunction(() =>
    document.querySelector("#selection").textContent.includes("5.00 N"),
  );
  assert.deepEqual(errors, []);
  console.log(
    "Tabbed layout OK: fixed left/right panels, canvas experiment toolbar, no document overflow at six viewport sizes, menu and loaded selection after resize.",
  );
} finally {
  await browser.close();
}
