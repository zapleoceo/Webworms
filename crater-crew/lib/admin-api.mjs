// Admin and settings API. Every Vercel function under api/admin/** and api/settings.mjs routes through here,
// and server.mjs uses the same handler locally.
//   GET    /api/settings                public, merged defaults + stored settings (enabled sponsors only)
//   POST   /api/admin/login             {password} -> session cookie
//   POST   /api/admin/logout
//   GET    /api/admin/session           {authenticated, storage}
//   GET    /api/admin/settings          (auth) full settings + storage flag
//   PUT    /api/admin/settings          (auth) validated save
//   POST   /api/admin/sponsors          (auth) multipart: logo file + name, link, weight, placements, enabled
//   DELETE /api/admin/sponsors/:id      (auth)
import {randomBytes} from 'node:crypto';
import {adminConfigured,passwordMatches,issueSession,isAuthenticated,sessionCookie,clearCookie,clientIp,loginBlocked,recordFailure,clearFailures} from './auth.mjs';
import {getStore} from './store.mjs';
import {validateLogo,MAX_LOGO_BYTES} from './images.mjs';
import {mergeSettings,validateSettings,MAX_SPONSORS,PLACEMENTS} from '../settings.js';

const MAX_JSON_BYTES=64*1024,MAX_UPLOAD_BYTES=MAX_LOGO_BYTES+64*1024;
const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}});
const err=(status,error,extra)=>json({error,...extra},status);

async function readJson(request){
 if(Number(request.headers.get('content-length'))>MAX_JSON_BYTES)return {error:err(413,'request too large')};
 if(!/^application\/json\b/i.test(request.headers.get('content-type')||''))return {error:err(415,'expected application/json')};
 const raw=await request.text();if(raw.length>MAX_JSON_BYTES)return {error:err(413,'request too large')};
 try{return {body:JSON.parse(raw)}}catch{return {error:err(400,'invalid JSON')}}
}
// SameSite=Strict already keeps the cookie off cross-site requests; a foreign Origin is refused as well.
function foreignOrigin(request){
 const origin=request.headers.get('origin');if(!origin)return false;
 try{return new URL(origin).host!==new URL(request.url).host}catch{return true}
}
async function loadSettings(store){return mergeSettings(store?await store.readSettings():null)}
const publicView=s=>({...s,sponsors:s.sponsors.filter(x=>x.enabled).map(({id,name,logoUrl,link,weight,placements})=>({id,name,logoUrl,link,weight,placements}))});

async function publicSettings(request){
 if(request.method!=='GET'&&request.method!=='HEAD')return err(405,'method not allowed');
 let settings;
 try{settings=await loadSettings(getStore())}catch(e){console.error('settings read failed:',String(e?.message||e).slice(0,200));settings=mergeSettings(null)}
 return json(publicView(settings),200,{'cache-control':'public, max-age=30, s-maxage=30, stale-while-revalidate=60'});
}

async function login(request){
 if(request.method!=='POST')return err(405,'method not allowed');
 const ip=clientIp(request);
 if(loginBlocked(ip))return err(429,'too many failed attempts, try again later',{});
 const {body,error}=await readJson(request);if(error)return error;
 if(!passwordMatches(body?.password)){recordFailure(ip);return err(401,'wrong password')}
 clearFailures(ip);
 return json({ok:true},200,{'set-cookie':sessionCookie(request,issueSession())});
}

async function putSettings(request,store){
 const {body,error}=await readJson(request);if(error)return error;
 if(!store)return err(503,'storage not configured');
 const current=await loadSettings(store),known=new Map(current.sponsors.map(s=>[s.id,s]));
 // Logo URLs are owned by the server: copy them from the stored sponsor; unknown sponsors are refused.
 if(body&&typeof body==='object'&&Array.isArray(body.sponsors)){
  const unknown=body.sponsors.findIndex(s=>!known.has(s?.id));
  if(unknown>=0)return err(422,'invalid settings',{errors:[`sponsors[${unknown}].id: unknown sponsor (upload its logo first)`]});
  body.sponsors=body.sponsors.map(s=>({...s,logoUrl:known.get(s.id).logoUrl}));
 }
 const result=validateSettings(body);
 if(!result.ok)return err(422,'invalid settings',{errors:result.errors});
 const value=result.value;
 if(!Array.isArray(body.sponsors))value.sponsors=current.sponsors;
 else{const listed=new Set(value.sponsors.map(s=>s.id));value.sponsors.push(...current.sponsors.filter(s=>!listed.has(s.id)))}// removal only via DELETE
 await store.writeSettings(value);
 return json({ok:true,settings:value});
}

const field=(form,k)=>{const v=form.get(k);return typeof v==='string'?v:undefined};
async function addSponsor(request,store){
 if(!store)return err(503,'storage not configured');
 if(Number(request.headers.get('content-length'))>MAX_UPLOAD_BYTES)return err(413,`logo is larger than ${MAX_LOGO_BYTES/1024} KB`);
 if(!/^multipart\/form-data\b/i.test(request.headers.get('content-type')||''))return err(415,'expected multipart/form-data');
 let form;try{form=await request.formData()}catch{return err(400,'invalid form data')}
 const file=form.get('logo');
 if(!file||typeof file==='string')return err(400,'logo file is required');
 if(file.size>MAX_LOGO_BYTES)return err(413,`logo is larger than ${MAX_LOGO_BYTES/1024} KB`);
 const bytes=new Uint8Array(await file.arrayBuffer()),check=validateLogo(bytes);
 if(!check.ok)return err(check.status,check.error);
 const current=await loadSettings(store);
 if(current.sponsors.length>=MAX_SPONSORS)return err(409,`at most ${MAX_SPONSORS} sponsors`);
 const placementsRaw=form.getAll('placements').flatMap(v=>typeof v==='string'?v.split(','):[]).map(s=>s.trim()).filter(Boolean);
 const weightRaw=field(form,'weight'),enabledRaw=field(form,'enabled');
 const sponsor={id:randomBytes(6).toString('hex'),name:field(form,'name')??'',logoUrl:'/pending.png',link:(field(form,'link')??'').trim(),
  weight:weightRaw===undefined||weightRaw===''?1:Number(weightRaw),enabled:enabledRaw===undefined?true:enabledRaw==='true'||enabledRaw==='on'||enabledRaw==='1',
  placements:placementsRaw.length?[...new Set(placementsRaw)]:[...PLACEMENTS]};
 const probe=validateSettings({sponsors:[sponsor]});
 if(!probe.ok)return err(422,'invalid sponsor',{errors:probe.errors.map(e=>e.replace(/^sponsors\[0\]\./,''))});
 const url=await store.putLogo(sponsor.id,check.ext,bytes,check.contentType);
 const saved={...probe.value.sponsors[0],logoUrl:url},next={...current,sponsors:[...current.sponsors,saved]};
 try{await store.writeSettings(next)}catch(e){await store.deleteLogo(url).catch(()=>{});throw e}
 return json({ok:true,sponsor:saved,settings:next},201);
}

async function deleteSponsor(id,store){
 if(!store)return err(503,'storage not configured');
 const current=await loadSettings(store),sponsor=current.sponsors.find(s=>s.id===id);
 if(!sponsor)return err(404,'sponsor not found');
 const next={...current,sponsors:current.sponsors.filter(s=>s.id!==id)};
 await store.writeSettings(next);
 try{await store.deleteLogo(sponsor.logoUrl)}catch(e){console.error('logo delete failed:',String(e?.message||e).slice(0,200))}
 return json({ok:true,settings:next});
}

async function admin(request,path){
 if(!adminConfigured())return err(503,'admin not configured');
 if(request.method!=='GET'&&request.method!=='HEAD'&&foreignOrigin(request))return err(403,'cross-origin request refused');
 if(path==='/api/admin/login')return login(request);
 if(path==='/api/admin/logout'){if(request.method!=='POST')return err(405,'method not allowed');return json({ok:true},200,{'set-cookie':clearCookie(request)})}
 const store=getStore(),authed=isAuthenticated(request);
 if(path==='/api/admin/session')return json({authenticated:authed,storage:Boolean(store)});
 if(!authed)return err(401,'not signed in');
 if(path==='/api/admin/settings'){
  if(request.method==='GET')return json({settings:await loadSettings(store),storage:Boolean(store)});
  if(request.method==='PUT')return putSettings(request,store);
  return err(405,'method not allowed');
 }
 if(path==='/api/admin/sponsors'){if(request.method!=='POST')return err(405,'method not allowed');return addSponsor(request,store)}
 const m=/^\/api\/admin\/sponsors\/([a-z0-9]{8,32})$/.exec(path);
 if(m){if(request.method!=='DELETE')return err(405,'method not allowed');return deleteSponsor(m[1],store)}
 return err(404,'not found');
}

export async function handle(request){
 const path=new URL(request.url).pathname.replace(/\/+$/,'');
 try{
  if(path==='/api/settings')return await publicSettings(request);
  if(path.startsWith('/api/admin/'))return await admin(request,path);
  return err(404,'not found');
 }catch(e){
  // Storage/runtime failures only; request bodies (and so passwords) are never logged.
  console.error('admin api error:',String(e?.message||e).slice(0,200));
  return err(502,'storage error');
 }
}
export default {fetch:handle};
