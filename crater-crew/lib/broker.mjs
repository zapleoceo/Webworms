// Broker access shared by the game's AI functions (api/ai/*) and the admin model picker.
// The project key is sent only as the X-Project-Key header; it never appears in responses, errors or logs.
import {getStore} from './store.mjs';
import {mergeSettings,validModelId} from '../settings.js';

export const brokerBase=()=>process.env.BROKER_URL||'https://aib.zapleo.com';
export const brokerKey=()=>process.env.BROKER_PROJECT_KEY||'';
export const envModel=()=>process.env.BROKER_SUBSCRIPTION_MODEL||'';

// Errors carry only the HTTP status, the path and Broker's short error code: "broker 503 on /v1/models: unavailable".
export async function broker(path,options={},timeoutMs=7000){
 const url=new URL(path,brokerBase());if(url.protocol!=='https:')throw Error('broker configuration');
 const response=await fetch(url,{...options,headers:{'X-Project-Key':brokerKey(),'accept':'application/json',...(options.headers||{})},signal:AbortSignal.timeout(timeoutMs)});
 if(!response.ok){let code='unparsed';try{const e=(await response.json()).error;if(typeof e==='string'&&/^[a-z0-9_.-]{1,64}$/.test(e))code=e}catch{}throw Error(`broker ${response.status} on ${url.pathname}: ${code}`)}
 return response.json();
}

// ---------- the active model: admin setting (ai.model) first, else env BROKER_SUBSCRIPTION_MODEL ----------
export const SETTINGS_TTL_MS=30_000;
let cache=null;
export const resetModelCache=()=>{cache=null};
// Cached per function instance for 30 s, so a saved change reaches new turns within half a minute.
export async function storedModel(now=Date.now()){
 if(cache&&now-cache.at<SETTINGS_TTL_MS)return cache.model;
 let model='';
 try{const store=getStore();model=store?mergeSettings(await store.readSettings()).ai.model:''}
 catch(e){console.error('ai.model read failed:',String(e?.message||e).slice(0,200));model=cache?.model??''}
 cache={at:now,model};
 return model;
}
export async function activeModel(){
 const stored=await storedModel();
 return stored?{model:stored,source:'settings'}:{model:envModel(),source:envModel()?'env':null};
}

// ---------- catalog ----------
const caps=row=>Array.isArray(row?.capabilities)?row.capabilities:[];
export const supportsChat=row=>caps(row).includes('chat:fast');
export const supportsJson=row=>Array.isArray(row?.job_request?.response_format_types)&&row.job_request.response_format_types.includes('json_schema');
// What the game needs: the model is up, runs fast chat jobs and honours a strict JSON schema.
export const usableRow=row=>Boolean(row&&row.available===true&&supportsChat(row)&&supportsJson(row));

// Price objects differ between providers; show their numeric fields compactly ("input 3 · output 15").
export function priceSummary(price){
 if(typeof price==='number'&&Number.isFinite(price))return String(price);
 if(typeof price==='string')return price.slice(0,60)||null;
 if(!price||typeof price!=='object'||Array.isArray(price))return null;
 const parts=[];
 for(const [k,v] of Object.entries(price)){
  if(parts.length>=4)break;
  if(typeof v==='number'&&Number.isFinite(v))parts.push(`${k.replace(/_/g,' ').slice(0,24)} ${v}`);
  else if(typeof v==='string'&&/^[\w.$ /-]{1,20}$/.test(v)&&k!=='currency')parts.push(`${k.replace(/_/g,' ').slice(0,24)} ${v}`);
 }
 const out=parts.join(' · ');return out?(typeof price.currency==='string'?`${out} ${price.currency.slice(0,5)}`:out):null;
}
export function trimModel(row){
 return {
  id:row.id,
  name:typeof row.name==='string'?row.name.slice(0,80):null,
  billing_type:typeof row.billing_type==='string'?row.billing_type.slice(0,20):null,
  available:row.available===true,
  chat_fast:supportsChat(row),
  json_schema:supportsJson(row),
  price:priceSummary(row.price),
  intelligence_index:typeof row.intelligence_index==='number'&&Number.isFinite(row.intelligence_index)?row.intelligence_index:null,
  usable:usableRow(row),
 };
}
export async function catalog(){
 const data=await broker('/v1/models');
 return Array.isArray(data?.data)?data.data.filter(r=>r&&typeof r.id==='string'&&r.id!==''&&validModelId(r.id)):[];
}
