// Admin and settings API. Every Vercel function under api/admin/** and api/settings.mjs routes through here,
// and server.mjs uses the same handler locally.
//   GET    /api/settings                public, merged defaults + stored settings (enabled sponsors only)
//   POST   /api/admin/login             {password} -> session cookie
//   POST   /api/admin/logout
//   GET    /api/admin/session           {authenticated, setupRequired, storage, passwordSource: 'env'|'stored'|null}
//   POST   /api/admin/setup             {password} first run only: stores the admin password, signs in
//   POST   /api/admin/password          (auth) {current, next} changes the stored password (not the env one)
//   GET    /api/admin/settings          (auth) full settings + storage flag
//   PUT    /api/admin/settings          (auth) validated save
//   POST   /api/admin/sponsors          (auth) multipart: logo file + name, link, weight, placements, enabled
//   DELETE /api/admin/sponsors/:id      (auth)
//   GET    /api/admin/models            (auth) Broker catalog, trimmed, plus the active model
//   POST   /api/admin/models/test       (auth) {model} runs one tiny JSON job on that model (rate-limited)
import {randomBytes} from 'node:crypto';
import {resolveAuth,checkPassword,recordMatches,hashPassword,recordFingerprint,authPath,validNewPassword,MIN_PASSWORD,MAX_PASSWORD,issueSession,isAuthenticated,sessionCookie,clearCookie,clientIp,loginBlocked,recordFailure,clearFailures,INIT_MARKER,invalidateAuthCache} from './auth.mjs';
import {getStore} from './store.mjs';
import {broker,brokerKey,catalog,trimModel,activeModel,envModel,resetModelCache} from './broker.mjs';
import {validateLogo,MAX_LOGO_BYTES} from './images.mjs';
import {mergeSettings,validateSettings,validModelId,MAX_SPONSORS,PLACEMENTS} from '../settings.js';

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

async function login(request,auth){
 if(request.method!=='POST')return err(405,'method not allowed');
 const ip=clientIp(request);
 if(loginBlocked(ip))return err(429,'too many failed attempts, try again later',{});
 // Count the attempt before the first await, so a burst of parallel guesses cannot all pass the check; a success clears it.
 recordFailure(ip);
 const {body,error}=await readJson(request);if(error)return error;
 if(!await checkPassword(auth,body?.password))return err(401,'wrong password');
 clearFailures(ip);
 return json({ok:true},200,{'set-cookie':sessionCookie(request,issueSession(Date.now(),auth.fp))});
}

const PASSWORD_RULE=`password must be ${MIN_PASSWORD} to ${MAX_PASSWORD} characters`;
const NOT_CONFIGURED={
 storage:'admin not configured: connect a Blob store (BLOB_READ_WRITE_TOKEN) or set ADMIN_PASSWORD',
 secret:'admin not configured: set ADMIN_SESSION_SECRET (random, 32+ characters) to choose the admin password here, or set ADMIN_PASSWORD',
 record:'admin not configured: the stored admin password record is unreadable; set ADMIN_PASSWORD or delete the auth blob',
 'env-short':'admin closed: ADMIN_PASSWORD is shorter than 12 characters',
 reset:'admin closed: a password was set before but its record is gone (secret rotated or store changed); set ADMIN_PASSWORD to regain access',
};

// First run: whoever completes this first becomes the admin. Allowed only while no password exists anywhere.
async function setup(request,store,auth){
 if(request.method!=='POST')return err(405,'method not allowed');
 if(auth.mode==='env')return err(409,'admin password is set by ADMIN_PASSWORD on the server');
 if(auth.mode==='stored')return err(409,'admin password already set');
 if(!auth.setupPossible){console.error(NOT_CONFIGURED[auth.reason]||'admin not configured');return err(503,'admin not configured')}
 const {body,error}=await readJson(request);if(error)return error;
 if(!validNewPassword(body?.password))return err(422,PASSWORD_RULE);
 const record=await hashPassword(body.password),path=authPath();
 // Re-check right before writing (hashing took a while); createAuth itself refuses to overwrite an existing record.
 if(await store.readAuth(path))return err(409,'admin password already set');
 if(!await store.createAuth(path,record))return err(409,'admin password already set');
 await store.createAuth(INIT_MARKER,{v:1,at:new Date().toISOString()});invalidateAuthCache();
 return json({ok:true},200,{'set-cookie':sessionCookie(request,issueSession(Date.now(),recordFingerprint(record)))});
}

async function changePassword(request,store,auth){
 if(request.method!=='POST')return err(405,'method not allowed');
 if(auth.mode==='env')return err(409,'the admin password comes from ADMIN_PASSWORD on the server; change it there and redeploy');
 const ip=clientIp(request);
 if(loginBlocked(ip))return err(429,'too many failed attempts, try again later',{});
 recordFailure(ip);
 const {body,error}=await readJson(request);if(error)return error;
 if(!await recordMatches(auth.record,body?.current))return err(403,'current password is wrong');
 clearFailures(ip);
 if(!validNewPassword(body?.next))return err(422,PASSWORD_RULE);
 const record=await hashPassword(body.next);
 try{await store.writeAuth(authPath(),record,auth.etag);invalidateAuthCache()}
 catch(e){if(e?.name==='BlobPreconditionFailedError'||/precondition failed/i.test(String(e?.message)))return err(409,'the password was changed meanwhile; sign in again');throw e}
 // The new record has a new fingerprint: every other session ends, this browser gets a fresh one.
 return json({ok:true},200,{'set-cookie':sessionCookie(request,issueSession(Date.now(),recordFingerprint(record)))});
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
 // A save without an ai section keeps the chosen model (older admin pages do not send it).
 if(body.ai===undefined)value.ai=current.ai;
 if(!Array.isArray(body.sponsors))value.sponsors=current.sponsors;
 else{const listed=new Set(value.sponsors.map(s=>s.id));value.sponsors.push(...current.sponsors.filter(s=>!listed.has(s.id)))}// removal only via DELETE
 await store.writeSettings(value);resetModelCache();
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

// ---------- Broker model picker ----------
const BROKER_OFF='Broker is not configured on this server (BROKER_PROJECT_KEY)';
// Broker errors are reduced to status and code ("broker 503 on /v1/models: unavailable"); the key is never in them.
const brokerError=e=>{const m=/^broker (\d+) on [^:]+: ([a-z0-9_.-]+)$/.exec(e?.message||'');return m?`Broker answered ${m[1]} (${m[2]})`:/timeout|abort/i.test(String(e?.name)+String(e?.message))?'Broker did not answer in time':'Broker is unreachable'};
async function listModels(request){
 if(request.method!=='GET')return err(405,'method not allowed');
 if(!brokerKey())return err(503,BROKER_OFF);
 resetModelCache();const active=await activeModel();
 let rows;try{rows=await catalog()}catch(e){console.error('broker catalog failed:',String(e?.message).slice(0,200));return err(502,brokerError(e))}
 const models=rows.slice(0,500).map(trimModel).sort((a,b)=>Number(b.usable)-Number(a.usable)||a.id.localeCompare(b.id));
 return json({models,active:{model:active.model||null,source:active.source},envModel:envModel()||null});
}

// A connectivity test runs a real job, so it is capped per function instance.
export const MODEL_TESTS=6,MODEL_TEST_WINDOW_MS=10*60_000,MODEL_TEST_DEADLINE_MS=25_000;
export const testClock={now:()=>Date.now(),sleep:ms=>new Promise(r=>setTimeout(r,ms))};
let testRuns=[];
export const resetModelTests=()=>{testRuns=[]};
const TEST_SCHEMA={type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false};
async function testModel(request){
 if(request.method!=='POST')return err(405,'method not allowed');
 if(!brokerKey())return err(503,BROKER_OFF);
 const {body,error}=await readJson(request);if(error)return error;
 const model=body?.model;
 if(typeof model!=='string'||model===''||!validModelId(model))return err(422,'model: a Broker model ID like provider/model');
 const start=testClock.now();testRuns=testRuns.filter(t=>start-t<MODEL_TEST_WINDOW_MS);
 if(testRuns.length>=MODEL_TESTS)return err(429,`at most ${MODEL_TESTS} model tests per ${MODEL_TEST_WINDOW_MS/60_000} minutes`);
 testRuns.push(start);
 const payload={model,messages:[{role:'system',content:'You are a connectivity check. Reply with JSON only.'},{role:'user',content:'Reply with {"ok": true}.'}],
  response_format:{type:'json_schema',json_schema:{name:'connectivity_check',strict:true,schema:TEST_SCHEMA}},workflow:'webworms-model-test'};
 const out=(fields)=>json({model,latency_ms:testClock.now()-start,...fields});
 let job;
 try{
  // A fresh random key: every test is its own job, never a replay of an earlier one.
  job=await broker('/v1/jobs?capability=chat:fast',{method:'POST',headers:{'content-type':'application/json','Idempotency-Key':'wwt_'+randomBytes(16).toString('hex')},body:JSON.stringify(payload)});
  while(job&&(job.status===undefined||job.status==='pending'||job.status==='running'||job.status==='queued')){
   if(!Number.isInteger(job.job_id)||job.job_id<1)throw Error('invalid broker response');
   const left=MODEL_TEST_DEADLINE_MS-(testClock.now()-start);
   if(left<=0)return out({ok:false,status:'timeout',error:'No answer within 25 s; the job may still finish in Broker.',job_id:job.job_id});
   await testClock.sleep(Math.min(left,Math.min(3000,Math.max(500,(Number(job.poll_after_s)||1)*1000))));
   const id=job.job_id;job=await broker(`/v1/jobs/${id}`);if(job&&job.job_id===undefined)job.job_id=id;
  }
 }catch(e){console.error('model test failed:',String(e?.message).slice(0,200));return out({ok:false,status:'error',error:brokerError(e)})}
 const reply=String(job?.text??'').slice(0,200);
 if(job?.status!=='done')return out({ok:false,status:String(job?.status||'error').slice(0,20),error:String(job?.error??'Broker could not complete the job').slice(0,200),billing_type:job?.billing_type??null});
 let parsed=null;try{parsed=JSON.parse(job.text)}catch{}
 const sameModel=job.model===undefined||job.model===model;
 return out({ok:parsed?.ok===true&&sameModel,status:'done',reply,billing_type:job.billing_type??null,ran_on:typeof job.model==='string'?job.model.slice(0,120):null,
  ...(parsed?.ok===true?{}:{error:'The reply was not the requested JSON.'}),...(sameModel?{}:{error:'Broker ran a different model.'})});
}

async function admin(request,path){
 if(request.method!=='GET'&&request.method!=='HEAD'&&foreignOrigin(request))return err(403,'cross-origin request refused');
 const store=getStore(),auth=await resolveAuth(store);
 if(path==='/api/admin/setup')return setup(request,store,auth);
 if(auth.mode==='none'){
  // Anonymous callers only learn that the admin is closed; the reason goes to the server log.
  if(!auth.setupPossible){console.error(NOT_CONFIGURED[auth.reason]||'admin not configured');return err(503,'admin not configured')}
  if(path==='/api/admin/session')return json({authenticated:false,setupRequired:true,storage:true,passwordSource:null});
  return err(403,'setup required');
 }
 if(path==='/api/admin/login')return login(request,auth);
 if(path==='/api/admin/logout'){if(request.method!=='POST')return err(405,'method not allowed');return json({ok:true},200,{'set-cookie':clearCookie(request)})}
 const authed=isAuthenticated(request,auth);
 if(path==='/api/admin/session')return json({authenticated:authed,setupRequired:false,storage:Boolean(store),passwordSource:auth.mode});
 if(!authed)return err(401,'not signed in');
 if(path==='/api/admin/password')return changePassword(request,store,auth);
 if(path==='/api/admin/models')return listModels(request);
 if(path==='/api/admin/models/test')return testModel(request);
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
