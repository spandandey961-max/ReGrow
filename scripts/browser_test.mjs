import assert from 'node:assert/strict';
const {chromium}=await import(process.env.REGROW_PLAYWRIGHT_MODULE||'playwright');
import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const fixture=process.env.REGROW_TEST_URL?null:spawn(process.execPath,[fileURLToPath(new URL('./serve_static.mjs',import.meta.url))],{env:{...process.env,REGROW_STATIC_PORT:'4381',REGROW_STATIC_BASE:'/regrow'},stdio:['ignore','pipe','pipe']});
if(fixture)await new Promise((resolve,reject)=>{fixture.stdout.once('data',resolve);fixture.once('error',reject);fixture.once('exit',code=>{if(code)reject(Error('Preview failed: '+code));});});
const resultsDir=fileURLToPath(new URL('../test-results/',import.meta.url));
await fs.mkdir(resultsDir,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.REGROW_CHROME?{executablePath:process.env.REGROW_CHROME}:{}),args:['--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1512,height:1120},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('Failed to load resource'))console.log('CONSOLE',m.text().slice(0,180));});
try {
await page.goto(process.env.REGROW_TEST_URL||'http://127.0.0.1:4381/regrow/',{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForSelector('#metrics .metric');await page.waitForTimeout(2500);
await page.screenshot({path:resultsDir+'desktop.png',fullPage:true});
console.log('TITLE',await page.title());
assert.equal(await page.locator('#run,#view-notes,#note-dialog').count(),0);
await page.locator('#theme-toggle').click();
assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
assert.equal(await page.locator('#map').evaluate(e=>getComputedStyle(e).filter),'none');
assert.equal(await page.locator('.legend').evaluate(e=>getComputedStyle(e).filter),'none');
assert.equal(new Set(await page.locator('.legend b').evaluateAll(els=>els.map(e=>getComputedStyle(e).backgroundColor))).size,4);
await page.screenshot({path:resultsDir+'updated-dark.png',fullPage:false});
await page.locator('#pitch').click();await page.waitForTimeout(1300);
await page.locator('[data-sector]').first().click();await page.waitForTimeout(200);console.log('SECTOR',await page.locator('#selected-sector').textContent());
assert.ok((await page.locator('.area-explanation').textContent()).includes('How complete is the evidence?'));
await page.locator('#outlook-fraction').fill('100');assert.equal(await page.locator('#scenario-percent').textContent(),'100%');
await page.screenshot({path:resultsDir+'updated-area.png',fullPage:false});
await page.locator('#area-tab-evidence').click();assert.equal(await page.locator('#area-tab-content .area-history-chart').count(),5);
assert.equal(new Set(await page.locator('#area-tab-content .area-history-chart path').evaluateAll(els=>els.slice(0,4).map(e=>getComputedStyle(e).stroke))).size,4);
await page.locator('#close-area').click();
await page.locator('[data-view="model"]').click();await page.locator('#threshold').focus();await page.locator('#threshold').press('ArrowRight');await page.locator('#threshold').press('ArrowRight');await page.locator('#threshold').press('ArrowRight');await page.locator('#apply-threshold').click();
await page.screenshot({path:resultsDir+'model.png',fullPage:true});
await page.locator('[data-view="changes"]').click();await page.locator('#baseline-select').selectOption('1');await page.waitForTimeout(300);await page.screenshot({path:resultsDir+'changes.png',fullPage:true});
await page.locator('[data-view="data"]').click();await page.screenshot({path:resultsDir+'data.png',fullPage:true});
await page.locator('[data-view="overview"]').click();await page.locator('#scene-select').selectOption('1');await page.waitForTimeout(500);
const download=page.waitForEvent('download');await page.locator('#export').click();const dl=await download;console.log('DOWNLOAD',dl.suggestedFilename());
await page.setViewportSize({width:390,height:844});await page.waitForTimeout(800);await page.screenshot({path:resultsDir+'mobile.png',fullPage:true});
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
await page.locator('#open-area-report').click();
for(const tab of ['summary','vegetation','water','evidence']){await page.locator('#area-tab-'+tab).click();assert.equal(await page.locator('#area-scroll').evaluate(e=>e.scrollWidth>e.clientWidth+1),false);}
await page.screenshot({path:resultsDir+'updated-mobile.png',fullPage:false});
console.log('ERRORS',JSON.stringify(errors));
assert.deepEqual(errors,[]);
console.log('PASS: dark-mode colours, area explanations, scenario, history plots, export, mobile tabs and GitHub project subpath.');
} finally {await browser.close();fixture?.kill();}

