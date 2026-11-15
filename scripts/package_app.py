"""Build a self-contained Worker with a real fitted forest for backend inference."""
import pathlib,json,gzip,base64
ROOT=pathlib.Path(__file__).resolve().parents[1];D=ROOT/'data';WEB=ROOT/'web'
def packed(p):return base64.b64encode(gzip.compress(p.read_bytes(),compresslevel=9)).decode()
assets={}
for name,kind in [('index.html','text/html; charset=utf-8'),('style.css','text/css'),('area-analysis.css','text/css'),('design.css','text/css'),('logo.svg','image/svg+xml'),('logo-symbol.svg','image/svg+xml'),('design.js','text/javascript'),('outlook.js','text/javascript'),('app.js','text/javascript'),('area-analysis.js','text/javascript'),('maplibre.js','text/javascript'),('maplibre.css','text/css')]:assets['/' if name=='index.html' else '/assets/'+name]={'text':(WEB/name).read_text(encoding='utf8'),'type':kind}
for p in D.glob('*-rgb.jpg'):assets['/assets/'+p.name]={'base64':base64.b64encode(p.read_bytes()).decode(),'type':'image/jpeg'}
worker='const DATA_GZIP='+json.dumps(packed(D/'dashboard.json'))+';\nconst FOREST_GZIP='+json.dumps(packed(D/'forest.json'))+';\nconst ASSETS='+json.dumps(assets,separators=(',',':'))+';\n'
worker+=r'''
const bytes=b64=>Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
async function unpack(b64){const stream=new Blob([bytes(b64)]).stream().pipeThrough(new DecompressionStream('gzip'));return JSON.parse(await new Response(stream).text());}
let dataPromise,forestPromise,publicDataPromise;
const data=()=>dataPromise??=(unpack(DATA_GZIP));
const forest=()=>forestPromise??=(unpack(FOREST_GZIP));
function response(body,status=200,headers={}){return new Response(body,{status,headers:{'content-type':'application/json; charset=utf-8','x-content-type-options':'nosniff',...headers}});}
function score(row,f){const probs=[0,0,0,0];for(const t of f.trees){let n=0;while(t.l[n]!==-1)n=row[t.f[n]]<=t.t[n]?t.l[n]:t.r[n];for(let k=0;k<4;k++)probs[k]+=t.v[n][k]/f.trees.length;}let cls=0;for(let k=1;k<4;k++)if(probs[k]>probs[cls])cls=k;return [cls,Math.round(probs[cls]*1000)/1000];}
export default {async fetch(request,env={},ctx={}){
 const u=new URL(request.url),route=u.pathname;
 try{
  if(route==='/api/health')return response(JSON.stringify({status:'ok',project:'ReGrow Amaravati',training:'fitted real-data reference model',runtime:'backend Random Forest inference'}));
  if(route==='/api/data'){
   publicDataPromise??=(async()=>{const d=await data();return JSON.stringify({...d,scenes:d.scenes.map(({features,...scene})=>scene)});})();
   return response(await publicDataPromise);
  }
  if(route==='/api/training-report'){const d=await data();return response(JSON.stringify(d.report,null,2),200,{'content-disposition':'attachment; filename="regrow-training-report.json"'});}
  if(route==='/api/predict'){
   if(request.method!=='POST')return response(JSON.stringify({error:'Use POST'}),405);
   const b=await request.json();if(typeof b.date!=='string'||b.date.length>20)return response(JSON.stringify({error:'A valid observation date is required.'}),400);
   const d=await data(),s=d.scenes.find(s=>s.date===b.date);if(!s)return response(JSON.stringify({error:'Observation not found'}),404);
   const f=await forest(),started=Date.now(),classes=[],confidence=[];
   for(let i=0;i<s.features.length;i++){if(s.classes[i]<0){classes.push(-1);confidence.push(0);}else{const [k,c]=score(s.features[i],f);classes.push(k);confidence.push(c);}}
   return response(JSON.stringify({date:s.date,classes,confidence,cells:classes.length,elapsed_ms:Date.now()-started,algorithm:d.report.algorithm,trees:f.trees.length,scope:'Optical reference-map classification, not NISAR radar inference.'}));
  }
  if(route.startsWith('/api/'))return response(JSON.stringify({error:'Route not found'}),404);
  const a=ASSETS[route];if(!a)return new Response('Not found',{status:404});
  return new Response(a.base64?bytes(a.base64):a.text,{headers:{'content-type':a.type,'cache-control':route==='/'?'no-cache':'public, max-age=3600','x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin'}});
 }catch(e){return response(JSON.stringify({error:'The request could not be completed.',detail:e.message}),500);}
}};
'''
(ROOT/'site'/'worker'/'index.js').write_text(worker,encoding='utf8')
print('Worker packaged:',len(worker.encode()),'bytes')
