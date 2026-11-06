import {createHmac,timingSafeEqual} from 'node:crypto';

import {brokerKey as key,broker,activeModel,catalog,usableRow,chatCapability} from '../../lib/broker.mjs';
import {validModelId} from '../../settings.js';

// The model is the admin's choice (settings ai.model) or else env BROKER_SUBSCRIPTION_MODEL; any Broker catalog model
// that is not marked unavailable, serves a chat job capability and takes json_schema qualifies (API models included) (checked before every job).
const validModel=s=>s!==''&&validModelId(s);
const enabled=m=>process.env.BROKER_GAME_ENABLED==='true'&&Boolean(key())&&validModel(m);
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const validId=s=>typeof s==='string'&&/^[a-z0-9_-]{1,48}$/.test(s);
const sign=s=>createHmac('sha256',key()).update(s).digest('base64url');
function ticketFor(payload){const encoded=Buffer.from(JSON.stringify(payload)).toString('base64url');return encoded+'.'+sign(encoded)}
function parseTicket(ticket,current){if(typeof ticket!=='string'||ticket.length>5000)return null;const [encoded,mac,extra]=ticket.split('.');if(!encoded||!mac||extra)return null;const actual=Buffer.from(sign(encoded)),given=Buffer.from(mac);if(actual.length!==given.length||!timingSafeEqual(actual,given))return null;try{const p=JSON.parse(Buffer.from(encoded,'base64url').toString()),now=Date.now();return Number.isInteger(p.jobId)&&p.jobId>0&&p.exp>now&&p.exp<=now+8*60*60_000+1000&&typeof p.turnId==='string'&&Array.isArray(p.ids)&&p.ids.length>0&&p.ids.length<=32&&p.model===current&&typeof p.billing==='string'?p:null}catch{return null}}
const PROP_KINDS=new Set(['mine','barrel','health_crate']);
const validProps=p=>p===undefined||Array.isArray(p)&&p.length<=60&&p.every(q=>q&&PROP_KINDS.has(q.kind)&&Number.isFinite(q.x)&&Number.isFinite(q.y));
// Stable rules first and the per-turn state after them: Broker marks the leading system message as a
// prompt-cache breakpoint, so this text must not change between turns (no names, dates or difficulty here).
const RULES=`You command the team of the active worm (snapshot.activeId) in a turn-based 2D artillery game with destructible terrain; the other team is the enemy. Pick ONE move from the supplied candidates for your active worm. Never invent a move.

World: x grows right, y grows DOWN; the map size is snapshot.size [width,height] (3600x1400 or 6400x1800). Water fills everything below snapshot.water; a worm that touches it dies. From round 9 (suddenDeath) the water rises 12 px every round. snapshot.terrain is the ground surface height sampled evenly across the map width. Worms have up to 100+ hp; a worm at 0 hp dies.

Weapons (the candidates already contain the aim and power; each description shows the outcome predicted by the game's own physics: who is hit for how much, KILL, friendly fire as "ally"/"SELF", chained barrels/mines, water nearby):
- bazooka: radius 77, damage up to 58; pushed by wind; explodes on impact.
- grenade: radius 84, damage up to 66; not affected by wind; bounces, explodes after 3 s.
- shotgun: two straight shots, up to 25 damage each; needs a clear line.
- dynamite: radius 102, damage up to 82; placed beside the target, 3 s fuse, you retreat.
- airstrike: 5 missiles along the target, radius 56, up to 40 each; any range; wind-proof.
- punch: 30 damage plus strong knockback (can push the target into water).
- jetpack: flies you to safer ground; uses the turn.
Map props: a mine explodes about 1 s after a worm comes within ~46 px (radius 62, damage 42); a barrel explodes when a blast reaches it (radius 80, damage 48) and can chain; a health_crate heals +25 to whoever touches it. Big knockbacks and long falls also hurt.

Most candidates end with "SIMULATED: ...": the move was actually played on a copy of the match with the full physics (flight, blast, knockback, water, falls, chained barrels/mines), so its hits, KILLs and DROWNED are exact, not guesses; "value" scores it (enemy damage, +70 per kill, minus friendly losses) and "rank" orders the list. Candidates without SIMULATED (teleport/rope/crate combos) carry a planner estimate. Unless you see a clear reason in the snapshot, pick the highest value.
How to choose: prefer KILLs and the largest damage to enemies; avoid moves that hurt allies or SELF; use barrels and mines near enemies; consider knocking enemies into water; when standing close to rising water, escaping can beat a weak shot. Difficulty in the message: "hard" plays solid, safe damage; "ultra" maximises kills and expected damage while protecting allies and exploiting props and water. A snapshot wind of 0 means you have no wind information.
Reply with JSON only: {"turn_id": <the given turn_id>, "candidate_id": <one supplied id>}.`;
function validate(body){if(!body||typeof body!=='object'||!validId(body.turnId)||!Number.isInteger(body.difficulty)||body.difficulty<0||body.difficulty>2)return false;const s=body.snapshot;if(!s||!Number.isInteger(s.map)||s.map<0||s.map>3||!Number.isInteger(s.round)||s.round<1||s.round>500||!Number.isFinite(s.wind)||Math.abs(s.wind)>100||!Array.isArray(s.worms)||s.worms.length>6||!Array.isArray(s.terrain)||(s.terrain.length!==32&&s.terrain.length!==64)||!validProps(s.props)||!s.worms.every(w=>w&&(w.name===undefined||typeof w.name==='string'&&w.name.length<=24)))return false;if(!Array.isArray(body.candidates)||body.candidates.length<1||body.candidates.length>32)return false;const ids=new Set();for(const c of body.candidates){if(!validId(c.id)||ids.has(c.id)||typeof c.description!=='string'||c.description.length>240)return false;ids.add(c.id)}return true}
// Returns the catalog row of a usable model, or null (nothing is submitted then).
async function verifiedModel(m){
 const row=(await catalog()).find(item=>item.id===m)||null;
 const ok=usableRow(row);
 // Only public catalog fields are logged, so a rejected model is diagnosable without exposing the key.
 if(!ok)console.error('broker model rejected:',JSON.stringify(row?{id:row.id,source:row.source,billing_type:row.billing_type,available:row.available,capabilities:row.capabilities,job_request:row.job_request}:{id:m,found:false}));
 return ok?row:null;
}
// Server-side diagnostics for a failed job: Broker's own status, error text and route, and the head of the model
// reply. None of these carry the project key.
function logJob(what,r){console.error('broker '+what+':',JSON.stringify({job:r?.job_id,status:r?.status,error:String(r?.error??'').slice(0,200),error_class:r?.result_meta?.error_class,model:r?.model,provider:r?.provider,billing:r?.billing_type,text:String(r?.text??'').slice(0,160)}))}
// The job must have run on exactly the requested model. A model the catalog lists as subscription-billed must also
// come back as a subscription run with no per-token cost.
function attested(result,pinned,billing){
 if(result.model!==pinned||result.requested_model!==pinned)return false;
 return billing!=='subscription'||result.billing_type==='subscription'&&result.provider===pinned.split('/')[0]&&result.cost_usd===null;
}
function complete(result,turnId,ids,pinned,billing){
 if(!attested(result,pinned,billing)){logJob('route not attested',result);return json({status:'error',error:'Broker did not attest the requested model route.'},502)}
 let plan;try{plan=JSON.parse(result.text)}catch{logJob('invalid JSON',result);return json({status:'error',error:'Broker returned invalid JSON.'},502)}
 if(!plan||plan.turn_id!==turnId||!ids.includes(plan.candidate_id)){logJob('invalid move',result);return json({status:'error',error:'Broker returned an invalid move.'},502)}
 return json({status:'done',turnId,candidateId:plan.candidate_id});
}
export default {async fetch(request){
 const {model}=await activeModel();
 if(!enabled(model))return json({status:'unavailable',error:'Broker is not configured for this game.'},503);
 try{
  if(request.method==='POST'){
   if(Number(request.headers.get('content-length'))>50_000)return json({error:'request too large'},413);
   const raw=await request.text();if(raw.length>50_000)return json({error:'request too large'},413);
   let body;try{body=JSON.parse(raw)}catch{return json({error:'invalid JSON'},400)}
   if(!validate(body))return json({error:'invalid turn snapshot'},422);
   const row=await verifiedModel(model);
   if(!row)return json({status:'unavailable',error:'The selected Broker model is unavailable.'},503);
   const billing=typeof row.billing_type==='string'?row.billing_type:'unknown';
   const names=['easy','hard','ultra'];

   const payload={model,messages:[{role:'system',content:RULES},{role:'user',content:JSON.stringify({turn_id:body.turnId,difficulty:names[body.difficulty],snapshot:body.snapshot,candidates:body.candidates})}],response_format:{type:'json_schema',json_schema:{name:'artillery_turn',strict:true,schema:{type:'object',properties:{turn_id:{type:'string'},candidate_id:{type:'string'}},required:['turn_id','candidate_id'],additionalProperties:false}}},workflow:'webworms-turn'};
   // Broker's project-scoped unique key replays the same job even after completion.
   // A changed payload for the same turn gets 409 instead of a second subscription run.
   const idempotencyKey='ww_'+sign('idem:'+body.turnId);
   const result=await broker('/v1/jobs?capability='+chatCapability(row),{method:'POST',headers:{'content-type':'application/json','Idempotency-Key':idempotencyKey},body:JSON.stringify(payload)});
   if(!Number.isInteger(result.job_id)||result.job_id<1)throw Error('invalid broker response');
   const ids=body.candidates.map(c=>c.id);
   if(result.status==='done')return complete(result,body.turnId,ids,model,billing);
   if(result.status==='error'||result.status==='cancelled'){logJob('job ended',result);return json({status:'error',error:'Broker could not complete this turn.'},502)}
   return json({status:'pending',ticket:ticketFor({jobId:result.job_id,turnId:body.turnId,ids,model,billing,exp:Date.now()+8*60*60_000}),pollAfter:Math.min(10,Math.max(1,Number(result.poll_after_s)||2))},202);
  }
  if(request.method==='GET'){
   const p=parseTicket(new URL(request.url).searchParams.get('ticket'),model);if(!p)return json({error:'invalid or expired ticket'},400);
   const result=await broker(`/v1/jobs/${p.jobId}`);
   if(result.status==='pending'||result.status==='running')return json({status:'pending',pollAfter:Math.min(10,Math.max(1,Number(result.poll_after_s)||2))});
   if(result.status!=='done'){logJob('job ended',result);return json({status:'error',error:'Broker could not complete this turn.'},502)}
   return complete(result,p.turnId,p.ids,p.model,p.billing);
  }
  return json({error:'method not allowed'},405);
 }catch(error){
  console.error('broker turn failed:',error?.message);
  // Tell the player the parsed Broker code (never the key): a refusal needs a Broker setting, not a retry.
  const m=/^broker (\d+) on [^:]+: ([a-z0-9_.-]+)$/.exec(error?.message||''),status=Number(m?.[1]),code=m?.[2];
  if(status===401||status===403)return json({status:'unavailable',code,error:`Broker refused this game project (${code}). Enable agent runs for it in Broker.`},503);
  return json({status:'unavailable',code,error:'Broker is unavailable. Retry this turn later.'},503)}
}};
