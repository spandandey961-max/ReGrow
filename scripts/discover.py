import json,urllib.request,urllib.parse,pathlib
OUT=pathlib.Path(__file__).resolve().parents[1]/'data'
def get(url,payload=None):
 b=None if payload is None else json.dumps(payload).encode()
 req=urllib.request.Request(url,data=b,headers={'Content-Type':'application/json','User-Agent':'ReGrow-research/1.0'})
 return json.load(urllib.request.urlopen(req,timeout=60))
base='https://planetarycomputer.microsoft.com/api/stac/v1'
cols=get(base+'/collections')['collections']
print('MATCHING COLLECTIONS',[(c['id'],c.get('title')) for c in cols if any(s in c['id'] for s in ['hls','landsat','worldcover'])])
bbox=[80.475,16.49,80.555,16.57]
for name,col,dt in [('landsat','landsat-c2-l2','2021-01-01T00:00:00Z/2026-11-14T23:59:59Z'),('worldcover','esa-worldcover',None)]:
 q={'collections':[col],'bbox':bbox,'limit':100}
 if dt:q.update(datetime=dt,query={'eo:cloud_cover':{'lt':15}})
 d=get(base+'/search',q);(OUT/(name+'-catalog.json')).write_text(json.dumps(d),encoding='utf8')
 print(name,[(f['id'],f['properties'].get('datetime'),f['properties'].get('eo:cloud_cover')) for f in d['features'][:12]])
cmr='https://cmr.earthdata.nasa.gov/search/granules.json?'+urllib.parse.urlencode({'short_name':'NISAR_L2_GCOV_V1','bounding_box':','.join(map(str,bbox)),'page_size':5,'sort_key':'-start_date'})
try:
 d=get(cmr);(OUT/'nisar-catalog.json').write_text(json.dumps(d),encoding='utf8')
 print('NISAR',[(f.get('title'),f.get('time_start'),[l.get('href') for l in f.get('links',[]) if 'data#' in l.get('rel','')][:1]) for f in d.get('feed',{}).get('entry',[])])
except Exception as e:print('NISAR ERROR',str(e))
