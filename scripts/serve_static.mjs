import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../site/static');
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.jpg':'image/jpeg','.svg':'image/svg+xml','.gz':'application/octet-stream'};
http.createServer(async (req,res) => {
  try {
    let route = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const prefix=process.env.REGROW_STATIC_BASE||'';
    if(prefix){if(!route.startsWith(prefix+'/'))throw Error('Not found');route=route.slice(prefix.length);}
    const file = path.resolve(root,'.'+(route==='/'?'/index.html':route));
    if (!file.startsWith(root+path.sep)) { res.writeHead(403); return res.end(); }
    const body = await fs.readFile(file);
    res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-cache'});
    res.end(body);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(Number(process.env.REGROW_STATIC_PORT||4318),'127.0.0.1',()=>console.log('Static ReGrow preview ready'));
