from pathlib import Path
root=Path(__file__).resolve().parents[1]
p=root/'web/app.js';s=p.read_text(encoding='utf-8-sig')
helper="function pairedDelta(ids=indices(null)){const a=current(),b=state.data.scenes[state.base];let n=0;for(const i of ids){if(a.classes[i]<0||b.classes[i]<0||a.confidence[i]<state.threshold||b.confidence[i]<state.threshold)continue;n+=(a.classes[i]===0?1:0)-(b.classes[i]===0?1:0);}return n*state.data.cell_area_m2/1e6;}\n"
if 'function pairedDelta' not in s:s=helper+s
s=s.replace('change=(a.n[0]-b.n[0])*area','change=pairedDelta()').replace('delta=(c.n[0]-base.n[0])*d.cell_area_m2/1e6','delta=pairedDelta(ids)').replace('km²). Check valid coverage','km² in paired valid cells). Check valid coverage')
p.write_text(s,encoding='utf-8')
p=root/'scripts/browser_test.mjs';s=p.read_text(encoding='utf-8-sig').replace("await page.locator('#threshold').fill('0.70');","await page.locator('#threshold').focus();await page.locator('#threshold').press('ArrowRight');await page.locator('#threshold').press('ArrowRight');await page.locator('#threshold').press('ArrowRight');")
p.write_text(s,encoding='utf-8')
