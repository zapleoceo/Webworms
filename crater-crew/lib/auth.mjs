// Admin auth: one shared admin password and a stateless HMAC-signed session cookie.
// The password comes from env ADMIN_PASSWORD (wins when set, so the owner can always regain access) or, when that
// is not set, from a scrypt record chosen once in the browser (first-run setup) and kept in the store.
// Neither the password nor the stored record is ever logged or returned; the cookie carries only times and a nonce.
import {createHmac,randomBytes,scrypt as scryptCb,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';

export const COOKIE='cc_admin';
export const SESSION_TTL_MS=12*60*60_000;
export const MAX_FAILURES=5,FAILURE_WINDOW_MS=10*60_000;

export const adminPassword=()=>process.env.ADMIN_PASSWORD||'';
export const sessionSecret=()=>process.env.ADMIN_SESSION_SECRET||'';
// A short password is treated as not configured: the admin stays closed until a real one (12+ characters) is set.
export const MIN_PASSWORD=12,MAX_PASSWORD=200;
export const envPasswordSet=()=>adminPassword().length>=MIN_PASSWORD;
export const adminConfigured=envPasswordSet;
export const validNewPassword=p=>typeof p==='string'&&p.length>=MIN_PASSWORD&&p.length<=MAX_PASSWORD;

// ---------- stored password (first-run setup) ----------
// The Blob store is public, so the record's path must not be guessable from public data: it is keyed by the secret.
export function authPath(secret=sessionSecret()){
 if(!secret)throw Error('ADMIN_SESSION_SECRET is required for a stored admin password');
 return `auth/admin-${createHmac('sha256',secret).update('admin-auth-path').digest('hex')}.json`;
}
// N=2^15, r=8 needs 32 MiB and ~50-100 ms per hash: fine for a serverless function, slow for guessing.
export const SCRYPT={N:2**15,r:8,p:1,keylen:32};
const scrypt=promisify(scryptCb);
const scryptOpts=({N,r,p})=>({N,r,p,maxmem:256*N*r});
export async function hashPassword(password,now=Date.now()){
 const salt=randomBytes(16),hash=await scrypt(password,salt,SCRYPT.keylen,scryptOpts(SCRYPT));
 return {v:1,algo:'scrypt',salt:salt.toString('base64'),hash:hash.toString('base64'),N:SCRYPT.N,r:SCRYPT.r,p:SCRYPT.p,keylen:SCRYPT.keylen,createdAt:new Date(now).toISOString()};
}
// Bounded parameters: a malformed record cannot make verification allocate unbounded memory.
export function validRecord(rec){
 return Boolean(rec&&typeof rec==='object'&&rec.v===1&&rec.algo==='scrypt'&&typeof rec.salt==='string'&&typeof rec.hash==='string'
  &&Number.isInteger(rec.N)&&rec.N>=1024&&rec.N<=2**17&&(rec.N&(rec.N-1))===0&&Number.isInteger(rec.r)&&rec.r>=1&&rec.r<=16&&Number.isInteger(rec.p)&&rec.p>=1&&rec.p<=4
  &&Buffer.from(rec.hash,'base64').length>=16&&Buffer.from(rec.salt,'base64').length>=8);
}
export async function recordMatches(rec,given){
 if(!validRecord(rec)||typeof given!=='string'||given.length>MAX_PASSWORD)return false;
 const expected=Buffer.from(rec.hash,'base64');
 const actual=await scrypt(given,Buffer.from(rec.salt,'base64'),expected.length,scryptOpts(rec));
 return timingSafeEqual(actual,expected);
}
// Short fingerprint of the record, mixed into the session signature: a new password ends the old sessions.
export const recordFingerprint=(rec,secret=sessionSecret())=>createHmac('sha256',secret).update('admin-session-fp:'+rec.hash).digest().subarray(0,8).toString('hex');

// ---------- auth state ----------
// {mode:'env'} | {mode:'stored',record,etag,fp} | {mode:'none',setupPossible,reason}
export async function resolveAuth(store){
 if(envPasswordSet())return {mode:'env',fp:''};
 if(!store)return {mode:'none',setupPossible:false,reason:'storage'};
 if(!sessionSecret())return {mode:'none',setupPossible:false,reason:'secret'};
 const found=await store.readAuth(authPath());
 if(found&&validRecord(found.record))return {mode:'stored',record:found.record,etag:found.etag,fp:recordFingerprint(found.record)};
 if(found)return {mode:'none',setupPossible:false,reason:'record'};// present but unreadable: never offer setup over it
 return {mode:'none',setupPossible:true};
}
// Synchronous view for env-only callers (and the tests): sessions exist only while ADMIN_PASSWORD is set.
const envAuth=()=>envPasswordSet()?{mode:'env',fp:''}:{mode:'none'};

// Without ADMIN_SESSION_SECRET (env password only) the key is derived from the password, so changing it ends sessions.
function sessionKey(){
 const s=sessionSecret();
 return s?Buffer.from(s):createHmac('sha256','crater-crew/admin-session/v1').update(adminPassword()).digest();
}
const mac=(data,fp='')=>createHmac('sha256',sessionKey()).update(fp?`${fp}.${data}`:data).digest('base64url');

// Constant-time comparison: both sides are hashed to equal-length digests under a per-process random key first,
// so neither the content nor the length of the real password leaks through timing.
const compareKey=randomBytes(32);
export function passwordMatches(given){
 const expected=adminPassword();if(!expected||typeof given!=='string')return false;
 const a=createHmac('sha256',compareKey).update(given).digest(),b=createHmac('sha256',compareKey).update(expected).digest();
 return timingSafeEqual(a,b);
}
// Env password when set, otherwise the stored record.
export async function checkPassword(auth,given){
 if(auth.mode==='env')return passwordMatches(given);
 if(auth.mode==='stored')return recordMatches(auth.record,given);
 return false;
}

export function issueSession(now=Date.now(),fp=''){
 const payload=Buffer.from(JSON.stringify({v:1,iat:now,exp:now+SESSION_TTL_MS,n:randomBytes(9).toString('base64url')})).toString('base64url');
 return payload+'.'+mac(payload,fp);
}
export function verifySession(token,now=Date.now(),auth=envAuth()){
 if(typeof token!=='string'||token.length>400||(auth.mode!=='env'&&auth.mode!=='stored'))return false;
 const parts=token.split('.');if(parts.length!==2||!parts[0]||!parts[1])return false;
 const expected=Buffer.from(mac(parts[0],auth.fp||'')),given=Buffer.from(parts[1]);
 if(expected.length!==given.length||!timingSafeEqual(expected,given))return false;
 try{const p=JSON.parse(Buffer.from(parts[0],'base64url').toString());return p.v===1&&Number.isFinite(p.exp)&&Number.isFinite(p.iat)&&p.exp>now&&p.iat<=now+60_000&&p.exp-p.iat<=SESSION_TTL_MS}catch{return false}
}

export function readCookie(request,name=COOKIE){
 const header=request.headers.get('cookie')||'';
 for(const part of header.split(';')){const i=part.indexOf('=');if(i>0&&part.slice(0,i).trim()===name)return part.slice(i+1).trim()}
 return null;
}
export const isAuthenticated=(request,auth)=>verifySession(readCookie(request),Date.now(),auth);

const LOCAL_HOSTS=new Set(['localhost','127.0.0.1','[::1]','::1']);
export const isLocalRequest=request=>LOCAL_HOSTS.has(new URL(request.url).hostname);
export function sessionCookie(request,token){
 return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_MS/1000}${isLocalRequest(request)?'':'; Secure'}`;
}
export function clearCookie(request){
 return `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${isLocalRequest(request)?'':'; Secure'}`;
}

// Naive in-memory limiter: per instance and best effort (serverless instances do not share it).
const failures=new Map();
export const clientIp=request=>(request.headers.get('x-real-ip')||request.headers.get('x-forwarded-for')?.split(',')[0]||'unknown').trim().slice(0,64);
export function loginBlocked(ip,now=Date.now()){
 const f=failures.get(ip);if(!f)return false;
 if(now-f.first>FAILURE_WINDOW_MS){failures.delete(ip);return false}
 return f.count>=MAX_FAILURES;
}
export function recordFailure(ip,now=Date.now()){
 if(failures.size>5000)for(const [k,f] of failures)if(now-f.first>FAILURE_WINDOW_MS)failures.delete(k);
 const f=failures.get(ip);if(!f||now-f.first>FAILURE_WINDOW_MS)failures.set(ip,{count:1,first:now});else f.count++;
}
export const clearFailures=ip=>failures.delete(ip);
export const resetLimiter=()=>failures.clear();
