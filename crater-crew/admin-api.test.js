import test from 'node:test';
import assert from 'node:assert/strict';
import {handle} from './lib/admin-api.mjs';
import {issueSession,verifySession,SESSION_TTL_MS,resetLimiter,passwordMatches} from './lib/auth.mjs';
import {setStore,createMemoryStore,createBlobStore,SETTINGS_PATH} from './lib/store.mjs';
import {validateLogo,sniffImage,MAX_LOGO_BYTES} from './lib/images.mjs';
import {defaultSettings} from './settings.js';

const PASSWORD='correct horse battery staple';
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64');
const HOST='https://crater.example';

// Every console line written while these tests run; the password must never appear in it.
const logged=[];for(const k of ['log','error','warn','info'])console[k]=(...a)=>logged.push(a.join(' '));

function env(vars){
 for(const k of ['ADMIN_PASSWORD','ADMIN_SESSION_SECRET','BLOB_READ_WRITE_TOKEN'])delete process.env[k];
 Object.assign(process.env,vars);resetLimiter();
}
const call=(path,{method='GET',body,headers={},cookie,ip='203.0.113.7',host=HOST}={})=>handle(new Request(host+path,{method,body,headers:{'x-real-ip':ip,...(cookie?{cookie}:{}),...headers}}));
const postJson=(path,data,opts={})=>call(path,{method:opts.method||'POST',body:JSON.stringify(data),...opts,headers:{'content-type':'application/json',...opts.headers}});
async function signIn(){const r=await postJson('/api/admin/login',{password:PASSWORD});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0]}
function upload(cookie,file,fields={},filename='logo.png'){
 const form=new FormData();form.set('logo',new Blob([file]),filename);for(const [k,v] of Object.entries(fields))form.set(k,v);
 return call('/api/admin/sponsors',{method:'POST',body:form,cookie});
}

test('without ADMIN_PASSWORD the admin API answers 503 and public settings still work',async()=>{
 env({});setStore(null);
 for(const [path,method] of [['/api/admin/login','POST'],['/api/admin/session','GET'],['/api/admin/settings','PUT'],['/api/admin/sponsors','POST']]){
  const r=await call(path,{method,body:method==='GET'?undefined:'{}',headers:{'content-type':'application/json'}});
  assert.equal(r.status,503,path);const b=await r.json();assert.equal(b.error,'admin not configured');assert.match(b.detail,/BLOB_READ_WRITE_TOKEN|ADMIN_PASSWORD/);
 }
 const pub=await call('/api/settings');assert.equal(pub.status,200);assert.deepEqual(await pub.json(),defaultSettings());
 assert.match(pub.headers.get('cache-control'),/max-age=30/);
});

test('login: wrong password is refused, the right one sets a strict HttpOnly cookie',async()=>{
 env({ADMIN_PASSWORD:PASSWORD});
 const bad=await postJson('/api/admin/login',{password:'nope'});
 assert.equal(bad.status,401);assert.equal(bad.headers.get('set-cookie'),null);
 assert.equal((await postJson('/api/admin/login',{})).status,401);
 assert.equal((await call('/api/admin/login',{method:'POST',body:'password=x',headers:{'content-type':'application/x-www-form-urlencoded'}})).status,415);
 const ok=await postJson('/api/admin/login',{password:PASSWORD});
 assert.equal(ok.status,200);const text=await ok.text();assert.ok(!text.includes(PASSWORD));
 const cookie=ok.headers.get('set-cookie');
 assert.match(cookie,/^cc_admin=[\w-]+\.[\w-]+; Path=\/; HttpOnly; SameSite=Strict; Max-Age=43200; Secure$/);
 assert.ok(!cookie.includes(PASSWORD));
 const local=await postJson('/api/admin/login',{password:PASSWORD},{host:'http://localhost:4173'});
 assert.doesNotMatch(local.headers.get('set-cookie'),/Secure/,'no Secure flag on plain-http localhost');
 const session=await call('/api/admin/session',{cookie:cookie.split(';')[0]});assert.deepEqual(await session.json(),{authenticated:true,setupRequired:false,storage:false,passwordSource:'env'});
 const out=await call('/api/admin/logout',{method:'POST'});assert.match(out.headers.get('set-cookie'),/^cc_admin=; .*Max-Age=0/);
 assert.equal(passwordMatches(PASSWORD+' '),false);assert.equal(passwordMatches(undefined),false);
});

test('session tokens: verify, expire after 12 h, reject tampering and other secrets',()=>{
 env({ADMIN_PASSWORD:PASSWORD});
 const now=Date.now(),token=issueSession(now);
 assert.equal(verifySession(token,now),true);
 assert.equal(verifySession(token,now+SESSION_TTL_MS-1000),true);
 assert.equal(verifySession(token,now+SESSION_TTL_MS+1),false,'expired');
 const [payload,mac]=token.split('.');
 const forged=Buffer.from(JSON.stringify({v:1,iat:now,exp:now+365*864e5,n:'x'})).toString('base64url');
 assert.equal(verifySession(forged+'.'+mac,now),false,'payload swapped');
 assert.equal(verifySession(payload+'.'+mac.slice(0,-2)+(mac.endsWith('AA')?'BB':'AA'),now),false,'mac changed');
 for(const junk of ['',payload,payload+'.'+mac+'.x','a.b',null,'x'.repeat(500)])assert.equal(verifySession(junk,now),false);
 // Password-derived key by default: a new password ends old sessions; an explicit secret is used when set.
 env({ADMIN_PASSWORD:'another password'});assert.equal(verifySession(token,now),false);
 env({ADMIN_PASSWORD:PASSWORD,ADMIN_SESSION_SECRET:'s3cret-a'});const t2=issueSession(now);assert.equal(verifySession(t2,now),true);
 env({ADMIN_PASSWORD:PASSWORD,ADMIN_SESSION_SECRET:'s3cret-b'});assert.equal(verifySession(t2,now),false);
 env({});assert.equal(verifySession(t2,now),false,'no admin password, no sessions');
});

test('login is rate-limited per IP after 5 failures',async()=>{
 env({ADMIN_PASSWORD:PASSWORD});
 for(let i=0;i<5;i++)assert.equal((await postJson('/api/admin/login',{password:'guess'+i},{ip:'198.51.100.1'})).status,401);
 const blocked=await postJson('/api/admin/login',{password:PASSWORD},{ip:'198.51.100.1'});
 assert.equal(blocked.status,429,'even the right password waits');
 assert.equal((await postJson('/api/admin/login',{password:PASSWORD},{ip:'198.51.100.2'})).status,200,'other clients are unaffected');
});

test('admin routes need a valid session; foreign origins are refused',async()=>{
 env({ADMIN_PASSWORD:PASSWORD});setStore(createMemoryStore());
 assert.equal((await call('/api/admin/settings')).status,401);
 assert.equal((await call('/api/admin/settings',{cookie:'cc_admin=forged.token'})).status,401);
 const cookie=await signIn();
 const r=await call('/api/admin/settings',{cookie});assert.equal(r.status,200);
 assert.deepEqual(await r.json(),{settings:defaultSettings(),storage:true});
 const cross=await postJson('/api/admin/settings',defaultSettings(),{method:'PUT',cookie,headers:{origin:'https://evil.example'}});
 assert.equal(cross.status,403);
 const same=await postJson('/api/admin/settings',defaultSettings(),{method:'PUT',cookie,headers:{origin:HOST}});
 assert.equal(same.status,200);
});

test('PUT settings validates, strips unknown keys, saves; GET /api/settings merges with defaults',async()=>{
 env({ADMIN_PASSWORD:PASSWORD});const store=createMemoryStore();setStore(store);const cookie=await signIn();
 const bad=await postJson('/api/admin/settings',{match:{turnTime:500},props:{crateChance:'often'}},{method:'PUT',cookie});
 assert.equal(bad.status,422);const be=await bad.json();
 assert.ok(be.errors.includes('match.turnTime: must be between 10 and 120'));assert.ok(be.errors.includes('props.crateChance: must be a number'));
 assert.equal(store.files.has(SETTINGS_PATH),false,'nothing saved on error');
 const good=await postJson('/api/admin/settings',{match:{turnTime:50,teleports:4},water:{suddenDeathRound:5},secret:'x'},{method:'PUT',cookie});
 assert.equal(good.status,200);
 const stored=JSON.parse(store.files.get(SETTINGS_PATH));assert.equal(stored.match.turnTime,50);assert.equal('secret' in stored,false);
 const pub=await(await call('/api/settings')).json();
 assert.equal(pub.match.turnTime,50);assert.equal(pub.match.teleports,4);assert.equal(pub.water.suddenDeathRound,5);
 assert.equal(pub.water.waterRise,12,'unsaved fields keep their defaults');assert.deepEqual(pub.props,defaultSettings().props);
 // A partially broken stored document only loses the broken field.
 store.files.set(SETTINGS_PATH,JSON.stringify({match:{turnTime:'x',teleports:3}}));
 const merged=await(await call('/api/settings')).json();assert.equal(merged.match.turnTime,35);assert.equal(merged.match.teleports,3);
 assert.equal((await call('/api/admin/settings',{method:'PUT',body:'{',headers:{'content-type':'application/json'},cookie})).status,400);
 assert.equal((await call('/api/admin/settings',{method:'PUT',body:'x'.repeat(70_000),headers:{'content-type':'application/json'},cookie})).status,413);
});

test('writes without storage answer 503 storage not configured',async()=>{
 env({ADMIN_PASSWORD:PASSWORD});setStore(null);const cookie=await signIn();
 const put=await postJson('/api/admin/settings',defaultSettings(),{method:'PUT',cookie});
 assert.equal(put.status,503);assert.deepEqual(await put.json(),{error:'storage not configured'});
 const up=await upload(cookie,PNG,{name:'Acme'});assert.equal(up.status,503);
 assert.equal((await call('/api/admin/sponsors/abcdef123456',{method:'DELETE',cookie})).status,503);
 const get=await call('/api/admin/settings',{cookie});assert.deepEqual(await get.json(),{settings:defaultSettings(),storage:false});
});

test('logo validation: magic bytes, size and SVG safety',()=>{
 assert.equal(sniffImage(PNG),'png');
 assert.equal(sniffImage(Buffer.from([0xff,0xd8,0xff,0xe0,0,0])),'jpg');
 assert.equal(sniffImage(Buffer.from('RIFF\x10\x00\x00\x00WEBPVP8 ','latin1')),'webp');
 assert.equal(sniffImage(Buffer.from('<?xml version="1.0"?>\n<!-- logo --><svg xmlns="http://www.w3.org/2000/svg"></svg>')),'svg');
 assert.equal(sniffImage(Buffer.from('GIF89a......')),null);
 assert.deepEqual(validateLogo(Buffer.from('<html>not an image</html>')),{ok:false,status:415,error:'logo must be a PNG, JPEG, WebP or SVG image'});
 assert.equal(validateLogo(Buffer.alloc(0)).status,400);
 const big=Buffer.concat([PNG,Buffer.alloc(MAX_LOGO_BYTES)]);assert.equal(validateLogo(big).status,413);
 assert.deepEqual(validateLogo(PNG),{ok:true,ext:'png',contentType:'image/png'});
 const svg=b=>validateLogo(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${b}</svg>`));
 assert.equal(svg('<defs><linearGradient id="g"/></defs><style>.a{fill:red}</style><rect class="a" fill="url(#g)" width="10" height="10"/>').ok,true);
 for(const evil of ['<script>alert(1)</script>','<rect onload="alert(1)"/>','<foreignObject><div/></foreignObject>','<image href="https://t.example/p.gif"/>','<a href="https://x"><rect/></a>','<use href="https://x/s.svg#a"/>','<rect style="fill:url(https://t.example/x)"/>','<style>@import "https://x/y.css";</style>','<rect fill="url(data:x)"/>','<animate attributeName="href" to="javascript:alert(1)"/>'])
  assert.equal(svg(evil).ok,false,evil);
 assert.equal(validateLogo(Buffer.from('<!DOCTYPE svg [<!ENTITY x "y">]><svg></svg>')).ok,false);
});

test('sponsor upload, update and delete',async()=>{
 env({ADMIN_PASSWORD:PASSWORD});const store=createMemoryStore();setStore(store);const cookie=await signIn();
 assert.equal((await upload(null,PNG,{name:'Acme'})).status,401);
 const fake=await upload(cookie,Buffer.from('definitely text'),{name:'Acme'},'logo.png');
 assert.equal(fake.status,415,'a .png name does not make it a PNG');
 assert.equal((await upload(cookie,Buffer.concat([PNG,Buffer.alloc(MAX_LOGO_BYTES)]),{name:'Acme'})).status,413);
 const badLink=await upload(cookie,PNG,{name:'Acme',link:'http://acme.example'});
 assert.equal(badLink.status,422);assert.ok((await badLink.json()).errors.some(e=>e.startsWith('link')));
 assert.equal((await upload(cookie,Buffer.from('<svg><script>alert(1)</script></svg>'),{name:'Acme'},'a.svg')).status,422);
 const ok=await upload(cookie,PNG,{name:' Acme Tools ',link:'https://acme.example',weight:'5',placements:'billboard,crate'});
 assert.equal(ok.status,201);const {sponsor}=await ok.json();
 assert.match(sponsor.id,/^[a-f0-9]{12}$/);assert.equal(sponsor.name,'Acme Tools');assert.equal(sponsor.weight,5);
 assert.deepEqual(sponsor.placements,['billboard','crate']);assert.equal(sponsor.logoUrl,`https://blob.test/sponsors/${sponsor.id}.png`);
 assert.deepEqual(store.files.get(`sponsors/${sponsor.id}.png`),PNG);
 const svgUp=await upload(cookie,Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><rect width="4" height="4" fill="#fc0"/></svg>'),{name:'Sun',enabled:'false'},'sun.svg');
 assert.equal(svgUp.status,201);const sun=(await svgUp.json()).sponsor;assert.ok(sun.logoUrl.endsWith('.svg'));assert.equal(sun.enabled,false);
 // Public settings list enabled sponsors only.
 let pub=await(await call('/api/settings')).json();assert.deepEqual(pub.sponsors.map(s=>s.id),[sponsor.id]);
 // Update via PUT: fields change, the logo URL stays the server's, unknown sponsors are refused.
 const all=(await(await call('/api/admin/settings',{cookie})).json()).settings;
 all.sponsors[1].enabled=true;all.sponsors[0].weight=9;all.sponsors[0].logoUrl='https://tracker.example/pixel.gif';
 const put=await postJson('/api/admin/settings',all,{method:'PUT',cookie});assert.equal(put.status,200);
 const saved=(await put.json()).settings.sponsors;assert.equal(saved[0].weight,9);assert.equal(saved[0].logoUrl,sponsor.logoUrl);
 pub=await(await call('/api/settings')).json();assert.equal(pub.sponsors.length,2);
 const unknown=await postJson('/api/admin/settings',{...all,sponsors:[{...all.sponsors[0],id:'ffffffffffff'}]},{method:'PUT',cookie});
 assert.equal(unknown.status,422);
 // Omitting sponsors from a PUT keeps them (removal is DELETE only).
 const {sponsors:_,...rulesOnly}=all;assert.equal((await postJson('/api/admin/settings',rulesOnly,{method:'PUT',cookie})).status,200);
 assert.equal(JSON.parse(store.files.get(SETTINGS_PATH)).sponsors.length,2);
 const del=await call(`/api/admin/sponsors/${sponsor.id}`,{method:'DELETE',cookie});assert.equal(del.status,200);
 assert.equal(store.files.has(`sponsors/${sponsor.id}.png`),false,'logo removed');
 assert.deepEqual(JSON.parse(store.files.get(SETTINGS_PATH)).sponsors.map(s=>s.id),[sun.id]);
 assert.equal((await call(`/api/admin/sponsors/${sponsor.id}`,{method:'DELETE',cookie})).status,404);
 assert.equal((await call('/api/admin/sponsors/..%2Fsettings',{method:'DELETE',cookie})).status,404);
});

test('blob store adapter: paths and options, no network',async()=>{
 const calls=[];class BlobNotFoundError extends Error{}
 const fake={BlobNotFoundError,
  async put(pathname,body,opts){calls.push(['put',pathname,opts]);return {url:'https://s.public.blob.vercel-storage.com/'+pathname}},
  async head(pathname){calls.push(['head',pathname]);if(!fake.exists)throw new BlobNotFoundError();return {url:'https://s.public.blob.vercel-storage.com/'+pathname,uploadedAt:new Date(1700000000000)}},
  async del(url){calls.push(['del',url])}};
 const store=createBlobStore(fake);
 assert.equal(await store.readSettings(),null);
 await store.writeSettings({match:{turnTime:40}});
 assert.deepEqual(calls[1],['put','settings/game.json',{access:'public',contentType:'application/json; charset=utf-8',addRandomSuffix:false,allowOverwrite:true,cacheControlMaxAge:60}]);
 const url=await store.putLogo('abcdef123456','png',PNG,'image/png');
 assert.equal(url,'https://s.public.blob.vercel-storage.com/sponsors/abcdef123456.png');
 assert.equal(calls[2][2].allowOverwrite,false);assert.equal(calls[2][2].contentType,'image/png');
 fake.exists=true;const realFetch=globalThis.fetch;let fetched;
 globalThis.fetch=async u=>{fetched=u;return new Response('{"match":{"turnTime":40}}')};
 try{assert.deepEqual(await store.readSettings(),{match:{turnTime:40}})}finally{globalThis.fetch=realFetch}
 assert.equal(fetched,'https://s.public.blob.vercel-storage.com/settings/game.json?v=1700000000000');
 await store.deleteLogo(url);assert.deepEqual(calls.at(-1),['del',url]);
});

test('storage failures surface as 502 without leaking details; the public GET falls back to defaults',async()=>{
 env({ADMIN_PASSWORD:PASSWORD});
 setStore({readSettings:async()=>{throw Error('boom')},writeSettings:async()=>{throw Error('boom')}});
 const pub=await call('/api/settings');assert.equal(pub.status,200);assert.deepEqual(await pub.json(),defaultSettings());
 const cookie=await signIn();const r=await call('/api/admin/settings',{cookie});
 assert.equal(r.status,502);assert.deepEqual(await r.json(),{error:'storage error'});
 setStore(null);
});

test('the password never reaches the logs',()=>{
 assert.ok(!logged.some(l=>l.includes(PASSWORD)),'password found in console output');
});

test('a burst of parallel wrong logins is capped too, not just sequential ones',async()=>{
 env({ADMIN_PASSWORD:PASSWORD});
 const res=await Promise.all(Array.from({length:40},(_,i)=>postJson('/api/admin/login',{password:'guess'+i},{ip:'198.51.100.9'})));
 const counts=res.reduce((m,r)=>(m[r.status]=(m[r.status]||0)+1,m),{});
 assert.equal(counts[401],5,'only five guesses are checked');assert.equal(counts[429],35);
});

test('a password shorter than 12 characters leaves the admin closed',async()=>{
 env({ADMIN_PASSWORD:'short'});
 assert.equal((await postJson('/api/admin/login',{password:'short'})).status,503);
});

test('SVG with namespace-prefixed script elements is rejected',()=>{
 for(const svg of ['<svg xmlns="http://www.w3.org/2000/svg" xmlns:s="http://www.w3.org/2000/svg"><s:script>alert(1)</s:script></svg>','<svg xmlns="http://www.w3.org/2000/svg"><h:script xmlns:h="http://www.w3.org/1999/xhtml">alert(1)</h:script></svg>'])
  assert.equal(validateLogo(Buffer.from(svg)).ok,false,svg);
 assert.equal(validateLogo(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><rect width="4" height="4"/></svg>')).ok,true,'plain static SVG still passes');
});
