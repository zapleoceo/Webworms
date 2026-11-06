import {createHmac,timingSafeEqual} from 'node:crypto';

const brokerBase=()=>process.env.BROKER_URL||'https://aib.zapleo.com';
const key=()=>process.env.BROKER_PROJECT_KEY||'';
const model=()=>process.env.BROKER_SUBSCRIPTION_MODEL||'';
const validModel=s=>/^(claude-sub|codex-sub)\/[a-z0-9][a-z0-9.-]{1,80}$/.test(s);
const enabled=()=>process.env.BROKER_GAME_ENABLED==='true'&&Boolean(key())&&validModel(model());
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const validId=s=>typeof s==='string'&&/^[a-z0-9_-]{1,48}$/.test(s);
const sign=s=>createHmac('sha256',key()).update(s).digest('base64url');
function ticketFor(payload){const encoded=Buffer.from(JSON.stringify(payload)).toString('base64url');return encoded+'.'+sign(encoded)}
function parseTicket(ticket){if(typeof ticket!=='string'||ticket.length>5000)return null;const [encoded,mac,extra]=ticket.split('.');if(!encoded||!mac||extra)return null;const actual=Buffer.from(sign(encoded)),given=Buffer.from(mac);if(actual.length!==given.length||!timingSafeEqual(actual,given))return null;try{const p=JSON.parse(Buffer.from(encoded,'base64url').toString()),now=Date.now();return Number.isInteger(p.jobId)&&p.jobId>0&&p.exp>now&&p.exp<=now+8*60*60_000+1000&&typeof p.turnId==='string'&&Array.isArray(p.ids)&&p.ids.length>0&&p.ids.length<=32&&p.model===model()?p:null}catch{return null}}
function validate(body){if(!body||typeof body!=='object'||!validId(body.turnId)||!Number.isInteger(body.difficulty)||body.difficulty<0||body.difficulty>2)return false;const s=body.snapshot;if(!s||!Number.isInteger(s.map)||s.map<0||s.map>2||!Number.isInteger(s.round)||s.round<1||s.round>500||!Number.isFinite(s.wind)||Math.abs(s.wind)>100||!Array.isArray(s.worms)||s.worms.length>6||!Array.isArray(s.terrain)||s.terrain.length!==32)return false;if(!Array.isArray(body.candidates)||body.candidates.length<1||body.candidates.length>32)return false;const ids=new Set();for(const c of body.candidates){if(!validId(c.id)||ids.has(c.id)||typeof c.description!=='string'||c.description.length>240)return false;ids.add(c.id)}return true}
async function broker(path,options={}){const url=new URL(path,brokerBase());if(url.protocol!=='https:')throw Error('broker configuration');const response=await fetch(url,{...options,headers:{'X-Project-Key':key(),'accept':'application/json',...(options.headers||{})},signal:AbortSignal.timeout(7000)});if(!response.ok)throw Error(`broker ${response.status} on ${url.pathname}: ${(await response.text().catch(()=>"")).slice(0,200)}`);return response.json()}
async function verifiedSubscriptionModel(){
 const catalog=await broker('/v1/models');
 const row=Array.isArray(catalog?.data)?catalog.data.find(item=>item?.id===model()):null;
 const ok=Boolean(row&&row.source==='broker'&&row.billing_type==='subscription'&&row.available===true&&Array.isArray(row.capabilities)&&row.capabilities.includes('chat:fast')&&Array.isArray(row.job_request?.response_format_types)&&row.job_request.response_format_types.includes('json_schema'));
 // Only public catalog fields are logged, so a rejected model is diagnosable without exposing the key.
 if(!ok)console.error('broker model rejected:',JSON.stringify(row?{id:row.id,source:row.source,billing_type:row.billing_type,available:row.available,capabilities:row.capabilities,job_request:row.job_request}:{id:model(),found:false}));
 return ok;
}
function attestedSubscription(result,pinned){return result.billing_type==='subscription'&&result.provider===pinned.split('/')[0]&&result.model===pinned&&result.requested_model===pinned&&result.cost_usd===null}
function complete(result,turnId,ids,pinned){
 if(!attestedSubscription(result,pinned))return json({status:'error',error:'Broker did not attest the approved subscription route.'},502);
 let plan;try{plan=JSON.parse(result.text)}catch{return json({status:'error',error:'Broker returned invalid JSON.'},502)}
 if(!plan||plan.turn_id!==turnId||!ids.includes(plan.candidate_id))return json({status:'error',error:'Broker returned an invalid move.'},502);
 return json({status:'done',turnId,candidateId:plan.candidate_id});
}
export default {async fetch(request){
 if(!enabled())return json({status:'unavailable',error:'Broker is not configured for this game.'},503);
 try{
  if(request.method==='POST'){
   if(Number(request.headers.get('content-length'))>50_000)return json({error:'request too large'},413);
   const raw=await request.text();if(raw.length>50_000)return json({error:'request too large'},413);
   let body;try{body=JSON.parse(raw)}catch{return json({error:'invalid JSON'},400)}
   if(!validate(body))return json({error:'invalid turn snapshot'},422);
   if(!await verifiedSubscriptionModel())return json({status:'unavailable',error:'The approved subscription model is unavailable.'},503);
   const names=['easy','normal','hard'];
   const instruction=`You choose ONE legal move for the enemy in a turn-based artillery game. Difficulty: ${names[body.difficulty]}. Analyze the team health, terrain heights, wind, predicted weapon effects, water risk and allies. Choose only a candidate_id from the supplied candidates. Do not invent actions. Return only the required JSON.`;
   const payload={model:model(),messages:[{role:'system',content:instruction},{role:'user',content:JSON.stringify({turn_id:body.turnId,snapshot:body.snapshot,candidates:body.candidates})}],response_format:{type:'json_schema',json_schema:{name:'artillery_turn',strict:true,schema:{type:'object',properties:{turn_id:{type:'string'},candidate_id:{type:'string'}},required:['turn_id','candidate_id'],additionalProperties:false}}},workflow:'webworms-turn'};
   // Broker's project-scoped unique key replays the same job even after completion.
   // A changed payload for the same turn gets 409 instead of a second subscription run.
   const idempotencyKey='ww_'+sign('idem:'+body.turnId);
   const result=await broker('/v1/jobs?capability=chat:fast',{method:'POST',headers:{'content-type':'application/json','Idempotency-Key':idempotencyKey},body:JSON.stringify(payload)});
   if(!Number.isInteger(result.job_id)||result.job_id<1)throw Error('invalid broker response');
   const ids=body.candidates.map(c=>c.id);
   if(result.status==='done')return complete(result,body.turnId,ids,model());
   if(result.status==='error'||result.status==='cancelled')return json({status:'error',error:'Broker could not complete this turn.'},502);
   return json({status:'pending',ticket:ticketFor({jobId:result.job_id,turnId:body.turnId,ids,model:model(),exp:Date.now()+8*60*60_000}),pollAfter:Math.min(10,Math.max(1,Number(result.poll_after_s)||2))},202);
  }
  if(request.method==='GET'){
   const p=parseTicket(new URL(request.url).searchParams.get('ticket'));if(!p)return json({error:'invalid or expired ticket'},400);
   const result=await broker(`/v1/jobs/${p.jobId}`);
   if(result.status==='pending'||result.status==='running')return json({status:'pending',pollAfter:Math.min(10,Math.max(1,Number(result.poll_after_s)||2))});
   if(result.status!=='done')return json({status:'error',error:'Broker could not complete this turn.'},502);
   return complete(result,p.turnId,p.ids,p.model);
  }
  return json({error:'method not allowed'},405);
 }catch(error){console.error('broker turn failed:',error?.message);return json({status:'unavailable',error:'Broker is unavailable. Retry this turn later.'},503)}
}};
