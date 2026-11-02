import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import brokerTurn from './api/ai/turn.mjs';
import brokerHealth from './api/ai/health.mjs';
const root = process.cwd();
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml' };
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
  const path = resolve(root, '.' + decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if (!(path===root || path.startsWith(root+sep))) { res.writeHead(403); res.end(); return; }
  const file = path===root?resolve(root,'index.html'):path;
  try { const data=await readFile(file); res.writeHead(200,{'content-type':types[extname(file)]||'application/octet-stream','cache-control':'no-store'}); res.end(data); }
  catch { res.writeHead(404); res.end('Not found'); }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))createServer(serve).listen(Number(process.env.PORT)||4173,process.env.HOST||'127.0.0.1',()=>console.log('Crater Crew local server ready'));
