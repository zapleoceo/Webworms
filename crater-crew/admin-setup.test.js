// First-run admin password: chosen once in the browser, stored as a scrypt record at a secret-derived path.
import test from 'node:test';
import assert from 'node:assert/strict';
import {handle} from './lib/admin-api.mjs';
import {authPath,resetLimiter,hashPassword,recordMatches,validRecord} from './lib/auth.mjs';
import {setStore,createMemoryStore,createFileStore,createBlobStore} from './lib/store.mjs';
import {mkdtemp,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const SECRET='test-session-secret-0123456789abcdef';
const FIRST='first run password 1',SECOND='second password 22',ENV_PW='env password wins!';
const HOST='https://crater.example';

const logged=[];for(const k of ['log','error','warn','info'])console[k]=(...a)=>logged.push(a.join(' '));

function env(vars){
 for(const k of ['ADMIN_PASSWORD','ADMIN_SESSION_SECRET','BLOB_READ_WRITE_TOKEN'])delete process.env[k];
 Object.assign(process.env,vars);resetLimiter();
}
const call=(path,{method='GET',body,headers={},cookie,ip='203.0.113.7'}={})=>handle(new Request(HOST+path,{method,body,headers:{'x-real-ip':ip,...(cookie?{cookie}:{}),...headers}}));
const postJson=(path,data,opts={})=>call(path,{method:opts.method||'POST',body:JSON.stringify(data),...opts,headers:{'content-type':'application/json',...opts.headers}});
const cookieOf=r=>r.headers.get('set-cookie')?.split(';')[0];
const sessionOf=async cookie=>(await call('/api/admin/session',{cookie})).json();
function fresh(vars={ADMIN_SESSION_SECRET:SECRET}){env(vars);const store=createMemoryStore();setStore(store);return store}

test('first run: session reports setupRequired, other admin routes answer 403 setup required',async()=>{
 fresh();
 const s=await call('/api/admin/session');assert.equal(s.status,200);
 assert.deepEqual(await s.json(),{authenticated:false,setupRequired:true,storage:true,passwordSource:null});
 for(const [path,method] of [['/api/admin/login','POST'],['/api/admin/settings','GET'],['/api/admin/settings','PUT'],['/api/admin/sponsors','POST'],['/api/admin/password','POST']]){
  const r=await call(path,{method,body:method==='GET'?undefined:'{}',headers:{'content-type':'application/json'}});
  assert.equal(r.status,403,path);assert.deepEqual(await r.json(),{error:'setup required'});
 }
});

test('setup stores a scrypt record, signs in, and works only once (second setup 409)',async()=>{
 const store=fresh();
 const ok=await postJson('/api/admin/setup',{password:FIRST});assert.equal(ok.status,200);
 assert.deepEqual(await ok.json(),{ok:true});
 const cookie=cookieOf(ok);assert.match(ok.headers.get('set-cookie'),/^cc_admin=[\w-]+\.[\w-]+; Path=\/; HttpOnly; SameSite=Strict; Max-Age=43200; Secure$/);
 assert.deepEqual(await sessionOf(cookie),{authenticated:true,setupRequired:false,storage:true,passwordSource:'stored'});
 assert.equal((await call('/api/admin/settings',{cookie})).status,200);
 const rec=JSON.parse(store.files.get(authPath(SECRET)));
 assert.equal(rec.v,1);assert.equal(rec.algo,'scrypt');assert.equal(rec.N,2**15);assert.equal(rec.r,8);assert.equal(rec.p,1);
 assert.ok(rec.salt&&rec.hash&&rec.createdAt);assert.ok(!JSON.stringify(rec).includes(FIRST),'no plain password stored');
 const again=await postJson('/api/admin/setup',{password:SECOND});assert.equal(again.status,409);
 assert.equal(again.headers.get('set-cookie'),null);
 assert.deepEqual(JSON.parse(store.files.get(authPath(SECRET))),rec,'record unchanged');
 // Two setups racing: exactly one wins.
 const raced=fresh();
 const res=await Promise.all([postJson('/api/admin/setup',{password:FIRST}),postJson('/api/admin/setup',{password:SECOND})]);
 assert.deepEqual(res.map(r=>r.status).sort(),[200,409]);assert.equal(raced.files.size,1);
});

test('login against the stored record: wrong refused, right accepted, rate limit kept',async()=>{
 fresh();await postJson('/api/admin/setup',{password:FIRST});
 const bad=await postJson('/api/admin/login',{password:SECOND});assert.equal(bad.status,401);assert.equal(bad.headers.get('set-cookie'),null);
 const good=await postJson('/api/admin/login',{password:FIRST});assert.equal(good.status,200);
 assert.equal((await call('/api/admin/settings',{cookie:cookieOf(good)})).status,200);
 const burst=await Promise.all(Array.from({length:12},(_,i)=>postJson('/api/admin/login',{password:'guess number '+i},{ip:'198.51.100.50'})));
 const counts=burst.reduce((m,r)=>(m[r.status]=(m[r.status]||0)+1,m),{});
 assert.equal(counts[401],5);assert.equal(counts[429],7);
});

test('password change ends old sessions; env password cannot be changed here',async()=>{
 const store=fresh();
 const first=cookieOf(await postJson('/api/admin/setup',{password:FIRST}));
 const other=cookieOf(await postJson('/api/admin/login',{password:FIRST},{ip:'198.51.100.60'}));
 assert.equal((await postJson('/api/admin/password',{current:FIRST,next:SECOND})).status,401,'needs a session');
 assert.equal((await postJson('/api/admin/password',{current:'wrong password 1',next:SECOND},{cookie:first})).status,403);
 assert.equal((await postJson('/api/admin/password',{current:FIRST,next:'short'},{cookie:first})).status,422);
 assert.equal((await postJson('/api/admin/password',{current:FIRST,next:SECOND},{cookie:first,headers:{origin:'https://evil.example'}})).status,403);
 const changed=await postJson('/api/admin/password',{current:FIRST,next:SECOND},{cookie:first});
 assert.equal(changed.status,200);const renewed=cookieOf(changed);
 assert.equal((await sessionOf(first)).authenticated,false,'old session of this browser ended');
 assert.equal((await sessionOf(other)).authenticated,false,'other sessions ended');
 assert.equal((await sessionOf(renewed)).authenticated,true,'the changing browser stays signed in');
 assert.equal((await postJson('/api/admin/login',{password:FIRST},{ip:'198.51.100.61'})).status,401);
 assert.equal((await postJson('/api/admin/login',{password:SECOND},{ip:'198.51.100.61'})).status,200);
 assert.equal(store.files.size,1);
 // Env password wins over the stored record, and is not changeable from the panel.
 process.env.ADMIN_PASSWORD=ENV_PW;resetLimiter();
 assert.equal((await postJson('/api/admin/login',{password:SECOND})).status,401,'stored password ignored while env is set');
 const envCookie=cookieOf(await postJson('/api/admin/login',{password:ENV_PW}));
 assert.equal((await sessionOf(envCookie)).passwordSource,'env');
 const refused=await postJson('/api/admin/password',{current:ENV_PW,next:'whatever password'},{cookie:envCookie});
 assert.equal(refused.status,409);assert.match((await refused.json()).error,/ADMIN_PASSWORD/);
});

test('setup refused when ADMIN_PASSWORD is set, without ADMIN_SESSION_SECRET, or without storage',async()=>{
 const store=fresh({ADMIN_SESSION_SECRET:SECRET,ADMIN_PASSWORD:ENV_PW});
 const r=await postJson('/api/admin/setup',{password:FIRST});assert.equal(r.status,409);assert.match((await r.json()).error,/ADMIN_PASSWORD/);
 assert.equal(store.files.size,0);
 assert.deepEqual(await(await call('/api/admin/session')).json(),{authenticated:false,setupRequired:false,storage:true,passwordSource:'env'});
 const noSecret=fresh({});
 const n=await postJson('/api/admin/setup',{password:FIRST});assert.equal(n.status,503);assert.match((await n.json()).error,/ADMIN_SESSION_SECRET/);
 assert.equal(noSecret.files.size,0);
 const ns=await call('/api/admin/session');assert.equal(ns.status,503);assert.match((await ns.json()).detail,/ADMIN_SESSION_SECRET/);
 env({ADMIN_SESSION_SECRET:SECRET});setStore(null);
 assert.equal((await postJson('/api/admin/setup',{password:FIRST})).status,503);
});

test('short and long passwords are rejected; foreign origin refused',async()=>{
 const store=fresh();
 for(const password of ['x'.repeat(11),'x'.repeat(201),'',null,12345678901234,undefined]){
  const r=await postJson('/api/admin/setup',{password});assert.equal(r.status,422,String(password).slice(0,20));
 }
 assert.equal((await postJson('/api/admin/setup',{password:FIRST},{headers:{origin:'https://evil.example'}})).status,403);
 assert.equal((await call('/api/admin/setup',{method:'POST',body:'password=x',headers:{'content-type':'application/x-www-form-urlencoded'}})).status,415);
 assert.equal((await call('/api/admin/setup')).status,405);
 assert.equal(store.files.size,0);
 assert.equal((await postJson('/api/admin/setup',{password:'x'.repeat(12)})).status,200,'exactly 12 is fine');
 fresh();assert.equal((await postJson('/api/admin/setup',{password:'x'.repeat(200)})).status,200,'exactly 200 is fine');
});

test('the record path is not derivable without the secret',async()=>{
 const a=authPath(SECRET),b=authPath(SECRET+'x');
 assert.match(a,/^auth\/admin-[0-9a-f]{64}\.json$/);assert.notEqual(a,b);assert.ok(!a.includes(SECRET));
 assert.throws(()=>authPath(''),/ADMIN_SESSION_SECRET/);
 const store=fresh();await postJson('/api/admin/setup',{password:FIRST});
 assert.deepEqual([...store.files.keys()],[a]);
 // Another secret looks elsewhere: it finds no record, and old sessions do not carry over.
 process.env.ADMIN_SESSION_SECRET=SECRET+'x';
 assert.equal((await(await call('/api/admin/session')).json()).setupRequired,true);
});

test('the scrypt record is never returned by an endpoint and never logged',async()=>{
 const store=fresh();const cookie=cookieOf(await postJson('/api/admin/setup',{password:FIRST}));
 const rec=JSON.parse(store.files.get(authPath(SECRET)));
 const bodies=[];
 for(const [path,opts] of [['/api/settings',{}],['/api/admin/session',{cookie}],['/api/admin/settings',{cookie}],['/api/admin/session',{}]])bodies.push(await(await call(path,opts)).text());
 bodies.push(await(await postJson('/api/admin/login',{password:FIRST})).text());
 bodies.push(await(await postJson('/api/admin/setup',{password:FIRST})).text());
 for(const b of bodies)for(const secret of [rec.hash,rec.salt,FIRST,SECRET,authPath(SECRET)])assert.ok(!b.includes(secret),`leak in ${b.slice(0,60)}`);
 const all=logged.join('\n');for(const secret of [rec.hash,rec.salt,FIRST,SECOND,ENV_PW,SECRET])assert.ok(!all.includes(secret),'leaked into logs');
});

test('scrypt helpers and stores: verify, bounded params, file store create-once',async()=>{
 const rec=await hashPassword(FIRST);assert.ok(validRecord(rec));
 assert.equal(await recordMatches(rec,FIRST),true);assert.equal(await recordMatches(rec,FIRST+' '),false);
 assert.equal(await recordMatches(rec,undefined),false);
 assert.equal(validRecord({...rec,N:2**24}),false,'oversized cost refused');assert.equal(validRecord({...rec,algo:'md5'}),false);
 // A broken record never reopens setup: the admin stays closed until ADMIN_PASSWORD or the blob is fixed.
 const store=fresh();store.files.set(authPath(SECRET),'{"v":1}');
 assert.equal((await call('/api/admin/session')).status,503);assert.equal((await postJson('/api/admin/setup',{password:FIRST})).status,503);
 const dir=await mkdtemp(join(tmpdir(),'cc-auth-'));
 try{
  const fs=createFileStore(dir);
  assert.equal(await fs.createAuth('auth/admin-x.json',rec),true);assert.equal(await fs.createAuth('auth/admin-x.json',rec),false);
  assert.deepEqual((await fs.readAuth('auth/admin-x.json')).record,rec);assert.equal(await fs.readAuth('auth/admin-y.json'),null);
  assert.deepEqual(await readdir(join(dir,'.local-store','auth')),['admin-x.json']);
 }finally{await rm(dir,{recursive:true,force:true})}
});

test('blob store adapter: create refuses overwrite, change is conditional on the etag',async()=>{
 const calls=[];class BlobNotFoundError extends Error{}
 let exists=false;
 const fake={BlobNotFoundError,
  async put(pathname,body,opts){calls.push(['put',pathname,opts]);if(exists&&!opts.allowOverwrite)throw Error('Vercel Blob: This blob already exists');exists=true;return {url:'https://s.public.blob.vercel-storage.com/'+pathname}},
  async head(pathname){calls.push(['head',pathname]);if(!exists)throw new BlobNotFoundError();return {url:'https://s.public.blob.vercel-storage.com/'+pathname,uploadedAt:new Date(1700000000000),etag:'"e1"'}}};
 const store=createBlobStore(fake),path=authPath(SECRET),realFetch=globalThis.fetch;
 assert.equal(await store.readAuth(path),null);
 assert.equal(await store.createAuth(path,{v:1}),true);
 assert.deepEqual(calls[1][2],{access:'public',contentType:'application/json; charset=utf-8',addRandomSuffix:false,allowOverwrite:false,cacheControlMaxAge:60});
 globalThis.fetch=async()=>new Response('{"v":1}');
 try{
  assert.equal(await store.createAuth(path,{v:2}),false,'lost race reported, not thrown');
  assert.deepEqual(await store.readAuth(path),{record:{v:1},etag:'"e1"'});
 }finally{globalThis.fetch=realFetch}
 await store.writeAuth(path,{v:3},'"e1"');
 assert.equal(calls.at(-1)[2].ifMatch,'"e1"');assert.equal(calls.at(-1)[2].allowOverwrite,true);
});
