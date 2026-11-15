from discover import get,OUT
import json,urllib.parse,urllib.request,urllib.error,pathlib
base='https://planetarycomputer.microsoft.com/api/stac/v1/search'
selected=[]
for year in [2021,2024,2025,2026]:
 q={'collections':['hls2-s30'],'bbox':[80.475,16.49,80.555,16.57],'datetime':f'{year}-03-01T00:00:00Z/{year}-05-15T23:59:59Z','limit':100,'query':{'eo:cloud_cover':{'lt':10}}}
 d=get(base,q)['features']
 d.sort(key=lambda f:(f['properties'].get('eo:cloud_cover',100),abs(int(f['id'].split('.')[3][4:7])-110)))
 if d:
  selected.append(d[0]);print('SELECT',d[0]['id'],d[0]['properties']['datetime'],d[0]['properties'].get('eo:cloud_cover'),flush=True)
(OUT/'selected-hls.json').write_text(json.dumps(selected),encoding='utf8')
u='https://cmr.earthdata.nasa.gov/search/granules.json?'+urllib.parse.urlencode({'collection_concept_id':'C3622241360-ASF','bounding_box':'80.475,16.49,80.555,16.57','page_size':3})
try:
 d=get(u);(OUT/'nisar-catalog.json').write_text(json.dumps(d),encoding='utf8')
 print('NISAR',[(f.get('title'),f.get('time_start'),[(l.get('href'),l.get('rel')) for l in f.get('links',[])][:4]) for f in d['feed']['entry']],flush=True)
except urllib.error.HTTPError as e:print('CMR ERROR',e.read().decode(),flush=True)
