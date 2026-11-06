// One serverless function for every /api/admin/* route (the Hobby plan allows 12 functions per deployment).
// vercel.json rewrites /api/admin/<path> here with the original path in __p; lib/admin-api.mjs routes by pathname.
import {handle} from '../lib/admin-api.mjs';
export default {async fetch(request){
 const url=new URL(request.url),sub=url.searchParams.get('__p')||'';url.searchParams.delete('__p');
 url.pathname='/api/admin/'+sub.replace(/^\/+/,'');
 const init={method:request.method,headers:request.headers};
 if(request.method!=='GET'&&request.method!=='HEAD'){init.body=request.body;init.duplex='half'}
 return handle(new Request(url,init));
}};
