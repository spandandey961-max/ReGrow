import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url);
const data=JSON.parse(await fs.readFile(new URL('data/dashboard.json',root),'utf8'));
const context=vm.createContext({window:{},fmt:(n,d=2)=>new Intl.NumberFormat('en-IN',{minimumFractionDigits:d,maximumFractionDigits:d}).format(n)});
vm.runInContext(await fs.readFile(new URL('web/outlook.js',root),'utf8'),context);
const outlook=context.window.regrowOutlook;
let checks=0;
for(const scene of data.scenes) for(let sector=0;sector<16;sector++) {
  const ids=scene.classes.map((_,i)=>i).filter(i=>Math.min(3,Math.floor(Math.floor(i/data.width)/data.height*4))*4+Math.min(3,Math.floor((i%data.width)/data.width*4))===sector);
  const good=ids.filter(i=>scene.classes[i]>=0&&scene.confidence[i]>=.55), counts=[0,0,0,0];
  good.forEach(i=>counts[scene.classes[i]]++);
  const a=counts.map(n=>n*data.cell_area_m2/1e6);
  const report={current:{cells:good.length,n:counts,area_km2:a,included_km2:good.length*.0036},total_km2:ids.length*.0036};
  for(const fraction of [0,.25,.5,1]) {
    const plan=outlook.assess(report,fraction);
    assert.equal(plan.feasible_plantable_area_km2,null);
    assert.equal(plan.crop_suitability,null);
    assert.ok(Math.abs(plan.assumed_additional_vegetation_km2-counts[1]*.0036*fraction)<1e-9);
    assert.ok(plan.scenario_vegetation_km2<=a[0]+a[1]+1e-9,'Water, built and unknown must not add vegetation capacity');
    assert.ok(Math.abs(plan.unknown_km2-(ids.length-good.length)*.0036)<1e-9);
    const html=outlook.html(report,fraction);
    assert.equal(/NaN|Infinity/.test(html),false);
    assert.ok(html.includes('not a forecast'));
    checks++;
  }
}
const missing={current:{cells:0,n:[0,0,0,0],area_km2:[0,0,0,0],included_km2:0},total_km2:4.8};
assert.equal(outlook.assess(missing).scenario_vegetation_km2,null);
assert.equal(outlook.html(missing).includes('id="outlook-fraction"'),false);
const html=await fs.readFile(new URL('site/static/index.html',root),'utf8');
assert.equal(/id="run"|view-notes|note-dialog|Field notebook/.test(html),false);
assert.ok(html.includes('id="export"'));
assert.ok(html.includes('id="theme-toggle"'));
const manifest=JSON.parse(await fs.readFile(new URL('site/static/manifest.json',root),'utf8'));
for(const [name,hash] of Object.entries(manifest.files)) {
  const {createHash}=await import('node:crypto');
  assert.equal(createHash('sha256').update(await fs.readFile(new URL('site/static/'+name,root))).digest('hex'),hash);
}
console.log(`PASS: ${checks} real sector/date/scenario checks; no future capacity inferred for missing data; removed controls absent; export retained; package hashes valid.`);
