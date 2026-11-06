// Admin auth: one shared password (env ADMIN_PASSWORD) and a stateless HMAC-signed session cookie.
// The password is never logged, echoed or stored; the cookie carries only issue/expiry times and a nonce.
import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';

export const COOKIE='cc_admin';
export const SESSION_TTL_MS=12*60*60_000;
export const MAX_FAILURES=5,FAILURE_WINDOW_MS=10*60_000;

export const adminPassword=()=>process.env.ADMIN_PASSWORD||'';
// A short password is treated as not configured: the admin stays closed until a real one (12+ characters) is set.
export const MIN_PASSWORD=12;
export const adminConfigured=()=>adminPassword().length>=MIN_PASSWORD;
// Without ADMIN_SESSION_SECRET the key is derived from the password, so changing the password also ends sessions.
function sessionKey(){
 const s=process.env.ADMIN_SESSION_SECRET;
 return s?Buffer.from(s):createHmac('sha256','crater-crew/admin-session/v1').update(adminPassword()).digest();
}
const mac=data=>createHmac('sha256',sessionKey()).update(data).digest('base64url');

// Constant-time comparison: both sides are hashed to equal-length digests under a per-process random key first,
// so neither the content nor the length of the real password leaks through timing.
const compareKey=randomBytes(32);
export function passwordMatches(given){
 const expected=adminPassword();if(!expected||typeof given!=='string')return false;
 const a=createHmac('sha256',compareKey).update(given).digest(),b=createHmac('sha256',compareKey).update(expected).digest();
 return timingSafeEqual(a,b);
}

export function issueSession(now=Date.now()){
 const payload=Buffer.from(JSON.stringify({v:1,iat:now,exp:now+SESSION_TTL_MS,n:randomBytes(9).toString('base64url')})).toString('base64url');
 return payload+'.'+mac(payload);
}
export function verifySession(token,now=Date.now()){
 if(typeof token!=='string'||token.length>400||!adminConfigured())return false;
 const parts=token.split('.');if(parts.length!==2||!parts[0]||!parts[1])return false;
 const expected=Buffer.from(mac(parts[0])),given=Buffer.from(parts[1]);
 if(expected.length!==given.length||!timingSafeEqual(expected,given))return false;
 try{const p=JSON.parse(Buffer.from(parts[0],'base64url').toString());return p.v===1&&Number.isFinite(p.exp)&&Number.isFinite(p.iat)&&p.exp>now&&p.iat<=now+60_000&&p.exp-p.iat<=SESSION_TTL_MS}catch{return false}
}

export function readCookie(request,name=COOKIE){
 const header=request.headers.get('cookie')||'';
 for(const part of header.split(';')){const i=part.indexOf('=');if(i>0&&part.slice(0,i).trim()===name)return part.slice(i+1).trim()}
 return null;
}
export const isAuthenticated=request=>verifySession(readCookie(request));

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
