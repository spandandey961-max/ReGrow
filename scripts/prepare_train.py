"""Reproducible HLS / WorldCover reference model. No synthetic training samples."""
import sys,pathlib,os,json,urllib.request,urllib.parse,concurrent.futures,time
ROOT=pathlib.Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'pydeps'))
import numpy as np, rasterio,certifi,joblib
from rasterio.warp import transform_bounds,reproject,Resampling,transform
from rasterio.transform import from_origin
from rasterio.windows import from_bounds
from sklearn.ensemble import RandomForestClassifier,IsolationForest
from sklearn.model_selection import GroupShuffleSplit
from sklearn.metrics import confusion_matrix,classification_report,accuracy_score,f1_score
from PIL import Image
DATA=ROOT/'data';DATA.mkdir(exist_ok=True);(DATA/'clips').mkdir(exist_ok=True)
BBOX=[80.475,16.49,80.555,16.57];CRS='EPSG:32644';RES=60
left,bottom,right,top=transform_bounds('EPSG:4326',CRS,*BBOX)
W=int(np.ceil((right-left)/RES));H=int(np.ceil((top-bottom)/RES));T=from_origin(left,top,RES,RES)
BANDS=['B02','B03','B04','B8A','B11','B12','Fmask']
def get(u):
 for attempt in range(4):
  try:return json.load(urllib.request.urlopen(u,timeout=90))
  except Exception:
   if attempt==3:raise
   time.sleep(10*(attempt+1))
def read_clip(url,kind='band'):
 arr=np.full((H,W),255 if kind=='mask' else -9999,dtype=np.float32)
 with rasterio.Env(CURL_CA_BUNDLE=certifi.where(),GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR',GDAL_HTTP_TIMEOUT='90',GDAL_HTTP_CONNECTTIMEOUT='30'):
  with rasterio.open(url) as src:
   bb=transform_bounds(CRS,src.crs,left,bottom,right,top)
   win=from_bounds(*bb,src.transform).round_offsets().round_lengths()
   raw=src.read(1,window=win)
   reproject(raw,arr,src_transform=src.window_transform(win),src_crs=src.crs,dst_transform=T,dst_crs=CRS,src_nodata=src.nodata,dst_nodata=255 if kind=='mask' else -9999,resampling=Resampling.mode if kind=='mask' else Resampling.average)
 return arr
token=None
def sign(url):
 global token
 if token is None:token=get('https://planetarycomputer.microsoft.com/api/sas/v1/token/hls2euwest/hls2')['token']
 return url+('?' if '?' not in url else '&')+token
features=json.loads((DATA/'selected-hls.json').read_text())
scenes=[]
for f in features:
 date=f['properties']['datetime'][:10];cache=DATA/'clips'/(date+'.npz')
 if cache.exists():d=np.load(cache);cube=d['cube'];qa=d['qa']
 else:
  def fetch(b):
   print('READ',date,b,flush=True)
   return b,read_clip(sign(f['assets'][b]['href']),'mask' if b=='Fmask' else 'band')
  arrays=dict(concurrent.futures.ThreadPoolExecutor(max_workers=3).map(fetch,BANDS))
  cube=np.stack([arrays[b]*.0001 for b in BANDS[:-1]],axis=-1);qa=arrays['Fmask'].astype(np.uint8)
  np.savez_compressed(cache,cube=cube,qa=qa)
 valid=np.all(np.isfinite(cube)&(cube>-.1)&(cube<1.2),axis=-1)&(qa!=255)&((qa&15)==0)
 blue,green,red,nir,s1,s2=np.moveaxis(cube,-1,0)
 ratio=lambda a,b:np.divide(a-b,a+b,out=np.zeros_like(a),where=np.abs(a+b)>.00001)
 ndvi=ratio(nir,red);ndwi=ratio(green,nir);ndmi=ratio(nir,s1);ndbi=ratio(s1,nir)
 X=np.concatenate([cube,np.stack([ndvi,ndwi,ndmi,ndbi],axis=-1)],axis=-1)
 scenes.append(dict(date=date,id=f['id'],features=X,valid=valid,ndvi=ndvi,ndwi=ndwi,ndmi=ndmi))
 rgb=np.clip(cube[:,:,[2,1,0]]/.28,0,1)**.8;rgb[~valid]=.15
 Image.fromarray((rgb*255).astype(np.uint8)).resize((W*4,H*4)).save(DATA/(date+'-rgb.jpg'),quality=90)
 print('SCENE',date,'valid',float(valid.mean()),flush=True)
labelcache=DATA/'clips'/'worldcover.npy'
if labelcache.exists():wc=np.load(labelcache)
else:
 wc=read_clip('https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_N15E078_Map.tif','mask');np.save(labelcache,wc)
y=np.full((H,W),-1,dtype=np.int8)
y[np.isin(wc,[10,20,30,40])]=0;y[wc==60]=1;y[wc==80]=2;y[wc==50]=3
base=scenes[0];valid=base['valid']&(y>=0)
rr,cc=np.indices((H,W));groups=(rr//16)*100+(cc//16)
X=base['features'][valid];Y=y[valid];G=groups[valid]
print('TRAIN ROWS',len(Y),'classes',np.unique(Y,return_counts=True),flush=True)
split=GroupShuffleSplit(n_splits=1,test_size=.2,random_state=37);dev,test=next(split.split(X,Y,G))
split2=GroupShuffleSplit(n_splits=1,test_size=.25,random_state=11);tr,va=next(split2.split(X[dev],Y[dev],G[dev]));tr=dev[tr];va=dev[va]
trials=[];best=None
for depth,leaf in [(10,3),(14,3),(14,7)]:
 m=RandomForestClassifier(n_estimators=96,max_depth=depth,min_samples_leaf=leaf,class_weight='balanced_subsample',n_jobs=-1,random_state=42)
 m.fit(X[tr],Y[tr]);score=f1_score(Y[va],m.predict(X[va]),average='macro',zero_division=0)
 trials.append({'max_depth':depth,'min_samples_leaf':leaf,'validation_macro_f1':round(float(score),4)})
 if best is None or score>best[0]:best=(score,depth,leaf)
model=RandomForestClassifier(n_estimators=96,max_depth=best[1],min_samples_leaf=best[2],class_weight='balanced_subsample',n_jobs=-1,random_state=42);model.fit(X[dev],Y[dev])
pred=model.predict(X[test]);names=['Vegetation','Exposed ground','Water','Built surfaces'];classids=list(range(4))
report={'algorithm':'Random Forest','trees':96,'max_depth':best[1],'min_samples_leaf':best[2],'seed':42,'training_date':base['date'],'training_source':'NASA HLS S30 v2','label_source':'ESA WorldCover 2021 v200 (reference map; not field truth)','split':'Spatial groups, 16 x 16 analysis cells (~960 m blocks). 60% fit / 20% validation / 20% held-out test. Final model refit on development blocks.','train_samples':len(dev),'test_samples':len(test),'validation_samples':len(va),'train_blocks':int(len(np.unique(G[dev]))),'test_blocks':int(len(np.unique(G[test]))),'accuracy':round(float(accuracy_score(Y[test],pred)),4),'macro_f1':round(float(f1_score(Y[test],pred,average='macro',zero_division=0)),4),'confusion':confusion_matrix(Y[test],pred,labels=classids).tolist(),'classes':classification_report(Y[test],pred,labels=classids,target_names=names,output_dict=True,zero_division=0),'trials':trials,'feature_names':['Blue','Green','Red','NIR','SWIR 1','SWIR 2','NDVI','NDWI','NDMI','NDBI'],'importance':model.feature_importances_.round(5).tolist(),'caveat':'Held-out agreement with a dated reference map, not independently verified field accuracy. Later years are temporal transfer predictions, not validated rehabilitation outcomes.'}
assert not set(G[dev])&set(G[test])
iso=IsolationForest(n_estimators=80,contamination=.08,random_state=42,n_jobs=-1).fit(X[Y==0][:,6:10])
joblib.dump({'model':model,'anomaly_model':iso,'report':report},DATA/'model.joblib')
forest=[]
for tree in model.estimators_:
 t=tree.tree_;value=t.value[:,0,:];value=value/np.maximum(value.sum(axis=1,keepdims=True),1e-9)
 forest.append({'l':t.children_left.tolist(),'r':t.children_right.tolist(),'f':t.feature.tolist(),'t':t.threshold.round(7).tolist(),'v':value.round(6).tolist()})
(DATA/'forest.json').write_text(json.dumps({'classes':classids,'trees':forest},separators=(',',':')))
export=[]
for s in scenes:
 flat=s['features'].reshape(-1,10);p=model.predict_proba(flat);cls=model.classes_[p.argmax(axis=1)];conf=p.max(axis=1)
 cls[~s['valid'].ravel()]=-1;conf[~s['valid'].ravel()]=0
 anomaly=-iso.decision_function(flat[:,6:10]);anomaly=np.clip((anomaly+.15)/.35,0,1)
 export.append({'date':s['date'],'id':s['id'],'valid':round(float(s['valid'].mean()),4),'classes':cls.tolist(),'confidence':conf.round(3).tolist(),'ndvi':s['ndvi'].ravel().astype(float).round(3).tolist(),'ndwi':s['ndwi'].ravel().astype(float).round(3).tolist(),'ndmi':s['ndmi'].ravel().astype(float).round(3).tolist(),'anomaly':anomaly.astype(float).round(3).tolist(),'features':flat.astype(float).round(7).tolist(),'rgb':s['date']+'-rgb.jpg','counts':[int(np.sum(cls==k)) for k in classids]})
xs=left+(cc+.5)*RES;ys=top-(rr+.5)*RES;lons,lats=transform(CRS,'EPSG:4326',xs.ravel().tolist(),ys.ravel().tolist())
result={'location':'Amaravati, Andhra Pradesh','center':[80.515,16.53],'bbox':BBOX,'width':W,'height':H,'resolution':RES,'cell_area_m2':RES**2,'crs':CRS,'grid_transform':list(T)[:6],'coordinates':[[round(a,6),round(b,6)] for a,b in zip(lons,lats)],'classes':names,'scenes':export,'report':report,'sources':[{'name':'NASA HLS S30 v2','role':'Optical model inputs, 30 m source observations aggregated to a 60 m analysis grid','url':'https://hls.gsfc.nasa.gov/data-products/','access':'Microsoft Planetary Computer HLS mirror'},{'name':'ESA WorldCover 2021 v200','role':'Dated reference labels, aggregated by modal class','url':'https://esa-worldcover.org/en/data-access','license':'© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium'},{'name':'NASA–ISRO NISAR GCOV','role':'Planned radar integration. No NISAR measurements used to train this optical model.','url':'https://nisar-docs.asf.alaska.edu/gcov/','status':'Authentication / coverage verification required'}],'limitations':['Model predicts land cover at an observed date, not future yield or time to recovery.','Reference-map agreement is not field validation. Built surfaces and exposed soil can be confused.','No verified mine, restoration intervention, farm boundary, planting record, soil chemistry, groundwater depth or measured crop health is supplied.','Analysis sectors are regular grid summaries, not cadastral parcels.','Anomaly scores compare optical features with the 2021 vegetated reference and are not a crop diagnosis.','Cross-year observations are from broadly similar months, but planting and weather conditions may differ.','Water layer maps surface extent. No measured water depth or reservoir level is supplied.']}
(DATA/'dashboard.json').write_text(json.dumps(result,separators=(',',':')))
(DATA/'training-report.json').write_text(json.dumps(report,indent=2))
print('COMPLETE',json.dumps({k:report[k] for k in ['accuracy','macro_f1','train_samples','test_samples']}),flush=True)

