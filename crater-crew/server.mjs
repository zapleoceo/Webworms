import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import brokerTurn from './api/ai/turn.mjs';
import brokerHealth from './api/ai/health.mjs';
import adminApi from './lib/admin-api.mjs';
import {createFileStore,setStore} from './lib/store.mjs';
const root = process.cwd();
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.json':'application/json' };
export async function serve(req,res){
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/api/ai/turn'||pathname==='/api/ai/health'){
    let body;
    if(req.method==='POST'){
      const chunks=[];let size=0;
      for await(const chunk of req){size+=chunk.length;if(size>50_000){res.writeHead(413);res.end('Request too large');return}chunks.push(chunk)}
      body=Buffer.concat(chunks);
    }
    const request=new Request('http://localhost'+req.url,{method:req.method,headers:req.headers,body});
    const answer=await(pathname==='/api/ai/turn'?brokerTurn:brokerHealth).fetch(request);
    res.writeHead(answer.status,Object.fromEntries(answer.headers));res.end(Buffer.from(await answer.arrayBuffer()));return;
  }
  // Admin and settings API (lib/admin-api.mjs). The real Host is kept so Origin checks and cookie flags match.
  if(pathname==='/api/settings'||pathname.startsWith('/api/admin/')){
    let body;const method=req.method||'GET';
    if(method!=='GET'&&method!=='HEAD'){
      const chunks=[];let size=0;
      for await(const chunk of req){size+=chunk.length;if(size>700_000){res.writeHead(413);res.end('Request too large');return}chunks.push(chunk)}
      body=Buffer.concat(chunks);
    }
    const headers=new Headers();for(const [k,v] of Object.entries(req.headers||{}))if(typeof v==='string')headers.set(k,v);
    if(req.socket?.remoteAddress)headers.set('x-real-ip',req.socket.remoteAddress);
    const answer=await adminApi.fetch(new Request('http://'+(req.headers?.host||'localhost')+req.url,{method,headers,body}));
    res.writeHead(answer.status,Object.fromEntries(answer.headers));res.end(Buffer.from(await answer.arrayBuffer()));return;
  }
  const path = resolve(root, '.' + decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if (!(path===root || path.startsWith(root+sep))) { res.writeHead(403); res.end(); return; }
  const file = path===root?resolve(root,'index.html'):path;
  try { const data=await readFile(file); res.writeHead(200,{'content-type':types[extname(file)]||'application/octet-stream','cache-control':'no-store'}); res.end(data); }
  catch { res.writeHead(404); res.end('Not found'); }
}
// Local dev without Vercel Blob keeps settings and logos in ./.local-store (git-ignored).
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){if(!process.env.BLOB_READ_WRITE_TOKEN)setStore(createFileStore(root));createServer(serve).listen(Number(process.env.PORT)||4173,process.env.HOST||'127.0.0.1',()=>console.log('Crater Crew local server ready'))}
