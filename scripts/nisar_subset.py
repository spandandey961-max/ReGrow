"""Subset real NISAR GCOV power layers without downloading whole mission files.

Authentication: EARTHDATA_TOKEN in the environment, or NASA's standard .netrc.
No credential is written to the dataset or logged. This does not train a model.
"""
import io, os, sys, json, pathlib, collections
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'pydeps'))
import requests

class RangeReader(io.RawIOBase):
    """Bounded LRU byte-range reader suitable for h5py's file-object driver."""
    def __init__(self,url,session=None,block_size=262144,max_blocks=128):
        super().__init__()
        from urllib.parse import urlsplit
        parsed=urlsplit(url)
        if parsed.scheme!='https' or parsed.hostname!='nisar.asf.earthdatacloud.nasa.gov':
            raise ValueError('Expected the official NASA NISAR HTTPS download endpoint')
        self.url=url;self.session=session or requests.Session();self.pos=0
        self.block_size=block_size;self.max_blocks=max_blocks;self.cache=collections.OrderedDict()
        token=os.environ.get('EARTHDATA_TOKEN')
        if token:self.session.headers['Authorization']='Bearer '+token.strip()
        self.bytes_transferred=0;self.requests_made=0
        with self.session.get(url,headers={'Range':'bytes=0-7'},timeout=(20,90),stream=True) as r:
            if r.status_code in (401,403):raise PermissionError('NASA Earthdata authentication is required. No SAR measurements downloaded.')
            if r.status_code!=206 or not r.headers.get('Content-Range','').startswith('bytes 0-7/'):
                raise IOError('Server did not provide a safe partial response; full download refused')
            self.size=int(r.headers['Content-Range'].split('/')[-1]);magic=r.raw.read(8)
        if magic!=b'\x89HDF\r\n\x1a\n':raise ValueError('Response is not an HDF5 science product')
    def readable(self):return True
    def seekable(self):return True
    def tell(self):return self.pos
    def seek(self,offset,whence=0):
        pos=offset if whence==0 else self.pos+offset if whence==1 else self.size+offset if whence==2 else -1
        if pos<0:raise ValueError('Invalid seek')
        self.pos=pos;return pos
    def _block(self,index):
        if index in self.cache:self.cache.move_to_end(index);return self.cache[index]
        start=index*self.block_size;end=min(self.size,start+self.block_size)-1
        if start>=self.size:return b''
        with self.session.get(self.url,headers={'Range':f'bytes={start}-{end}'},timeout=(20,90),stream=True) as r:
            if r.status_code!=206 or r.headers.get('Content-Range')!=f'bytes {start}-{end}/{self.size}':
                raise IOError('Partial download failed; refusing unexpected response')
            result=r.raw.read(end-start+2)
        if len(result)!=end-start+1:raise IOError('Truncated or oversized byte range')
        self.requests_made+=1;self.bytes_transferred+=len(result);self.cache[index]=result
        while len(self.cache)>self.max_blocks:self.cache.popitem(last=False)
        return result
    def read(self,size=-1):
        if size is None or size<0:size=self.size-self.pos
        if size>64*1024*1024:raise ValueError('Unbounded HDF5 read refused; select a spatial subset')
        size=min(size,max(0,self.size-self.pos));chunks=[]
        while size:
            block=self._block(self.pos//self.block_size);offset=self.pos%self.block_size
            part=block[offset:offset+size]
            if not part:raise IOError('Unexpected empty range')
            chunks.append(part);self.pos+=len(part);size-=len(part)
        return b''.join(chunks)
    def readinto(self,buffer):
        data=self.read(len(buffer));buffer[:len(data)]=data;return len(data)
    def close(self):
        if not self.closed:self.cache.clear();self.session.close()
        super().close()

def select_sources():
    catalog=json.loads((ROOT/'data/sar/NISAR_L2_GCOV_V1-search.json').read_text(encoding='utf-8'))
    records=[]
    for item in catalog['feed']['entry']:
        ident=item['producer_granule_id'];parts=ident.split('_')
        urls=[p['href'] for p in item.get('links',[]) if p.get('href','').endswith('.h5') and p['href'].startswith('https:')]
        if not urls:continue
        if len(parts)<12 or parts[6] not in ('A','D'):raise ValueError('Unexpected NISAR product identifier')
        records.append({'id':ident,'date':item['time_start'],'track':parts[5],'direction':parts[6],'frame':parts[7],
                        'bandwidth_mode':parts[8],'polarization_mode':parts[9],'url':urls[0],'maturity':'VALIDATED',
                        'collection':'NISAR_L2_GCOV_V1','role':'Candidate science product; measurement extraction pending authentication'})
    groups=collections.defaultdict(list)
    for r in records:groups[(r['track'],r['direction'],r['frame'],r['bandwidth_mode'],r['polarization_mode'])].append(r)
    candidates=[sorted(v,key=lambda r:r['date']) for v in groups.values() if len(v)>=2]
    if not candidates:raise ValueError('No matching validated same-track pair; do not mix observation geometry')
    return sorted(candidates,key=lambda v:v[-1]['date'],reverse=True)[0][-2:]

def inventory(record):
    import h5py
    with RangeReader(record['url']) as stream:
        with h5py.File(stream,'r') as product:
            base=product['/science/LSAR/GCOV/grids/frequencyA']
            layers={name:{'shape':list(dataset.shape),'dtype':str(dataset.dtype),'description':str(dataset.attrs.get('description',''))}
                    for name,dataset in base.items() if isinstance(dataset,h5py.Dataset)}
        return {'source':record,'layers':layers,'bytes_transferred':stream.bytes_transferred,'requests':stream.requests_made}

if __name__=='__main__':
    selected=select_sources()
    manifest={'bbox':[80.475,16.49,80.555,16.57],'sources':selected,
              'challenge_resource':'https://hackathlone.com/challenges/dancing-with-the-sars#resources',
              'documentation':'https://nisar-docs.asf.alaska.edu/gcov/',
              'status':'catalogue verified; not yet used as model inputs'}
    (ROOT/'data/sar/selected-nisar.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    print('Selected matching validated products:',[r['date'] for r in selected],flush=True)
    if '--inventory' in sys.argv:
        for r in selected:
            info=inventory(r)
            (ROOT/'data/sar'/f"inventory-{r['date'][:10]}.json").write_text(json.dumps(info,indent=2),encoding='utf-8')
            print('Science layers inspected:',r['date'],'Bytes transferred:',info['bytes_transferred'],flush=True)
