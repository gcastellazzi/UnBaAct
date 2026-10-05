import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
const browser=await chromium.launch();
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5173');
  await page.waitForFunction(()=>document.body.dataset.ready==='true');
  await page.locator('#baseTools summary').click();await page.click('#loadSettlementExample');
  await page.click('#tab-button-observe');await page.locator('#abaqusTools summary').click();
  const download=async()=>{
    const event=page.waitForEvent('download');await page.click('#exportAbaqus');
    return readFile(await (await event).path(),'utf8');
  };
  const basic=await download();assert.match(basic,/\*Heading/);assert.match(basic,/elset=SOIL_1/);
  await page.fill('#abqLeaves','3');await page.locator('#abqLeaves').blur();
  await page.selectOption('#abqLeafMode','custom');
  for(const [i,v] of ['.1','.2','.15'].entries())await page.fill(`#abqLeafThickness${i+1}`,v);
  await page.selectOption('#abqLoadLeaf','2');await page.fill('#abqBondPercent','35');
  await page.selectOption('#abqBondMode','pair');
  const custom=await download();
  assert.match(custom,/thicknesses=0.1, 0.2, 0.15/);assert.match(custom,/Applied loads: leaf 2/);
  assert.match(custom,/mode=pair; seed=42/);assert.match(custom,/leaves [12]-[23]/);
  assert.ok((await page.locator('#abaqusStatus').textContent()).includes('through-stone sites'));
  await mkdir('tmp/abaqus',{recursive:true});
  await page.locator('#abaqusTools').screenshot({path:'tmp/abaqus/export-panel.png'});
  await page.fill('#abqLeaves','1');await page.locator('#abqLeaves').blur();
  assert.equal(await page.locator('#abqLoadLeaf').inputValue(),'all');
  assert.ok(await page.locator('#abqBondPercent').isDisabled());
  await page.selectOption('#abqLeafMode','divide');await page.selectOption('#abqGeometry','initial');
  await page.selectOption('#abqMotion','planar');assert.match(await download(),/P1_I.NODES, 2, 2, 0./);
  assert.deepEqual(errors,[]);
  console.log('Abaqus UI: default download, custom leaves, load selection, partial through stones, single-leaf reset and initial geometry passed.');
} finally {await browser.close();}
