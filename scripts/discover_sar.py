"""Find real SAR products over ReGrow's existing study area. No credentials logged."""
import json,urllib.request,urllib.parse,pathlib,concurrent.futures
ROOT=pathlib.Path(__file__).resolve().parents[1];OUT=ROOT/'data'/'sar';OUT.mkdir(exist_ok=True)
BBOX=[80.475,16.49,80.555,16.57]
def get(url,params):
 req=urllib.request.Request(url+'?'+urllib.parse.urlencode(params,doseq=True),headers={'User-Agent':'ReGrow-SAR-research/2.0'})
 with urllib.request.urlopen(req,timeout=60) as r:return json.load(r)
def cmr():
 cols=get('https://cmr.earthdata.nasa.gov/search/collections.json',{'keyword':'NISAR GCOV','page_size':30})
 (OUT/'collections.json').write_text(json.dumps(cols,indent=2),encoding='utf-8')
 results=[]
 for c in cols['feed']['entry']:
  name=c['short_name']
  if 'GCOV' not in name:continue
  q=get('https://cmr.earthdata.nasa.gov/search/granules.json',{'collection_concept_id':c['id'],'bounding_box':','.join(map(str,BBOX)),'page_size':6,'sort_key':'-start_date'})
  (OUT/(name+'-search.json')).write_text(json.dumps(q,indent=2),encoding='utf-8')
  entries=q.get('feed',{}).get('entry',[])
  results.append({'collection':name,'id':c['id'],'hits_sampled':len(entries),'dates':[e.get('time_start') for e in entries]})
  if entries:
   for link in entries[0].get('links',[]):
    url=link.get('href','')
    if url.endswith('.h5') and url.startswith('https:'):
     try:
      req=urllib.request.Request(url,headers={'Range':'bytes=0-7','User-Agent':'ReGrow-SAR-research/2.0'})
      with urllib.request.urlopen(req,timeout=45) as r:
       magic=r.read(8);results[-1]['access_probe']={'status':r.status,'hdf5':magic==b'\x89HDF\r\n\x1a\n','final_host':urllib.parse.urlsplit(r.url).hostname}
     except Exception as ex:results[-1]['access_probe']={'error':str(ex)}
     break
 return results
def pc():
 d=get('https://planetarycomputer.microsoft.com/api/stac/v1/collections',{})
 return [{'id':c['id'],'title':c.get('title')} for c in d['collections'] if any(x in c['id'].lower() for x in ['rtc','sentinel-1','opera'])]
for name,fn in [('nisar',cmr),('public_sar_mirrors',pc)]:
 try:result=fn()
 except Exception as e:result={'error':str(e)}
 (OUT/(name+'-discovery.json')).write_text(json.dumps(result,indent=2),encoding='utf-8');print(name,json.dumps(result),flush=True)
