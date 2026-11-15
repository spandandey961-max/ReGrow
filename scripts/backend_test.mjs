import fs from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {default:worker}=await import(pathToFileURL(path.join(root,'site/worker/index.js')).href);
const response=await worker.fetch(new Request('https://local/api/data'));
if(response.status!==200)throw new Error('Data endpoint failed');
const d=await response.json();if(d.scenes.some(s=>'features' in s))throw new Error('Private inference feature arrays exposed by summary route');
for(const s of d.scenes){const r=await worker.fetch(new Request('https://local/api/predict',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({date:s.date})}));if(r.status!==200)throw new Error('Inference failed');const p=await r.json();if(p.classes.length!==d.width*d.height)throw new Error('Grid size mismatch');let same=0,max=0;for(let i=0;i<p.classes.length;i++){if(p.classes[i]===s.classes[i])same++;max=Math.max(max,Math.abs(p.confidence[i]-s.confidence[i]));}const agreement=same/p.classes.length;if(agreement<.998||max>.03)throw new Error('Exported model differs materially from fitted Python forest');console.log(s.date,JSON.stringify({cells:p.cells,python_js_agreement:agreement,max_score_difference:max,backend_ms:p.elapsed_ms}));}
const invalid=await worker.fetch(new Request('https://local/api/predict',{method:'POST',headers:{'content-type':'application/json'},body:'{"date":"not-an-observation"}'}));if(invalid.status!==404)throw new Error('Invalid observation accepted');
const method=await worker.fetch(new Request('https://local/api/predict'));if(method.status!==405)throw new Error('Method validation missing');
console.log('Backend and Python-model parity checks passed');
