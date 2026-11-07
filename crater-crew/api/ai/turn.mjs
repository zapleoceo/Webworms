import {OPEN_RULES} from '../../lib/agent-instructions.mjs';
import {createHmac,timingSafeEqual} from 'node:crypto';

import {brokerKey as key,broker,activeModel,catalog,usableRow,chatCapability} from '../../lib/broker.mjs';
import {validModelId} from '../../settings.js';
import {validHistory} from '../../journal.js';
import {OPEN_PROTOCOL,ACTION_SCHEMA,validAgentAction,MAX_AGENT_STEPS,MAX_UTILITY_STEPS} from '../../agent-contract.js';

// The model is the admin's choice (settings ai.model) or else env BROKER_SUBSCRIPTION_MODEL; any Broker catalog model
// that is not marked unavailable, serves a chat job capability and takes json_schema qualifies (API models included) (checked before every job).
const validModel=s=>s!==''&&validModelId(s);
const enabled=m=>process.env.BROKER_GAME_ENABLED==='true'&&Boolean(key())&&validModel(m);
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const validId=s=>typeof s==='string'&&/^[a-z0-9_-]{1,48}$/.test(s);
const sign=s=>createHmac('sha256',key()).update(s).digest('base64url');
function ticketFor(payload){const encoded=Buffer.from(JSON.stringify(payload)).toString('base64url');return encoded+'.'+sign(encoded)}
function parseTicket(ticket,current){
 if(typeof ticket!=='string'||ticket.length>5000)return null;
 const [encoded,mac,extra]=ticket.split('.');if(!encoded||!mac||extra)return null;
 const actual=Buffer.from(sign(encoded)),given=Buffer.from(mac);if(actual.length!==given.length||!timingSafeEqual(actual,given))return null;
 try{
  const p=JSON.parse(Buffer.from(encoded,'base64url').toString()),now=Date.now();
  if(!p||!Number.isInteger(p.jobId)||p.jobId<1||!Number.isFinite(p.exp)||p.exp<=now||p.exp>now+8*60*60_000+1000||!validId(p.turnId)||p.model!==current||typeof p.billing!=='string')return null;
  // Old, already-issued tickets have no protocol. An open ticket is never a candidate ticket, or vice versa.
  if(p.protocol===OPEN_PROTOCOL)return p.ids===undefined?p:null;
  if(p.protocol!==undefined)return null;
  return Array.isArray(p.ids)&&p.ids.length>0&&p.ids.length<=32&&p.ids.every(validId)&&new Set(p.ids).size===p.ids.length?p:null;
 }catch{return null}
}
const PROP_KINDS=new Set(['mine','barrel','health_crate']);
const validProps=p=>p===undefined||Array.isArray(p)&&p.length<=60&&p.every(q=>q&&PROP_KINDS.has(q.kind)&&Number.isFinite(q.x)&&Number.isFinite(q.y));
// Stable rules first and the per-turn state after them: Broker marks the leading system message as a
// prompt-cache breakpoint, so this text must not change between turns (no names, dates or difficulty here).
const RULES=`You command the team of the active worm (snapshot.activeId) in a turn-based 2D artillery game with destructible terrain; the other team is the enemy. Pick ONE move from the supplied candidates for your active worm. Never invent a move.

World: x grows right, y grows DOWN; the map size is snapshot.size [width,height] (3600x1400 or 6400x1800). Water fills everything below snapshot.water; a worm (radius 15, y is its centre) drowns only once the water closes over it completely, i.e. y > snapshot.water + 15; standing with its feet in the shallows is safe. A round ends once both teams have moved (a coin toss decides which team opens the match); from round 9 (suddenDeath) the water rises 12 px every round. snapshot.terrain is the ground surface height sampled evenly across the map width. Worms start with 100 hp (110 for the team that moves second) and health crates add more; a worm at 0 hp dies.

Weapons (the candidates already contain the aim and power; each description shows the outcome predicted by the game's own physics: who is hit for how much, KILL, friendly fire as "ally"/"SELF", chained barrels/mines, water nearby):
- bazooka: radius 77, damage up to 58; pushed by wind; explodes on impact.
- grenade: radius 84, damage up to 66; not affected by wind; bounces, explodes after 3 s.
- shotgun: two straight shots, up to 25 damage each; needs a clear line.
- dynamite: radius 102, damage up to 82; placed beside the target, 3 s fuse, you retreat.
- airstrike: 5 missiles along the target, radius 56, up to 40 each; any range; wind-proof; only 2 per team per match, offered while your team has one left.
- punch: 30 damage plus strong knockback (can push the target into water).
- jetpack: flies you to safer ground; uses the turn.
Map props: a mine explodes about 1 s after a worm comes within ~46 px (radius 62, damage 42); a barrel explodes when a blast reaches it (radius 80, damage 48) and can chain; a health_crate heals +25 to whoever touches it. Blasts knock worms back in proportion to the weapon's damage (a graze barely moves a worm, a direct dynamite hit throws it); long falls hurt.

Most candidates end with "SIMULATED: ...": the move was actually played on a copy of the match with the full physics (flight, blast, knockback, water, falls, chained barrels/mines), so its hits, KILLs and DROWNED are exact, not guesses; "value" scores it (enemy damage, +70 per kill, minus friendly losses) and "rank" orders the list. Candidates without SIMULATED (teleport/rope/crate combos) carry a planner estimate. Unless you see a clear reason in the snapshot, pick the highest value.
How to choose: prefer KILLs and the largest damage to enemies; avoid moves that hurt allies or SELF; use barrels and mines near enemies; consider knocking enemies into water; when standing close to rising water, escaping can beat a weak shot. Difficulty in the message: "hard" plays solid, safe damage; "ultra" maximises kills and expected damage while protecting allies and exploiting props and water; "god" plays like ultra and also learns from the match history. A snapshot wind of 0 means you have no wind information.
History (only with "god"): "history" lists the last turns of BOTH teams, oldest first. Keys: r round, t team, w worm id, a action ("pass" = nothing fired), u utility used before it (rope/teleport), ang aim in degrees (negative = up), p power 0-100, d facing (+1 right, -1 left; airstrike: flight direction), x airstrike target x, wd wind at the shot, tg intended target worm id, l [x,y] where the shot exploded or left play, m [dx,dy] = l minus the target's position at turn start (dx>0 landed right of it, dy>0 below it), h [[worm id, damage taken]], k worms that died that turn (any team), dr worms that drowned, s damage the shooter did to itself.
How to use history: SIMULATED outcomes assume the current wind, but the wind drifts while a shot flies and between turns. Look at earlier shots of the same weapon in similar wind (wd) and how far and which way they missed (m); when such shots keep missing, prefer candidates that tolerate the error (grenade, airstrike, bigger blasts, props) or whose landing corrects toward it. Sum h by attacker (w) to see which enemy worm has hurt your team most, and prioritise it when values are close. Do not repeat a move that already failed from the same spot against the same target (no damage in h, or self damage s); repeat or adapt what worked. An enemy that survived several direct hits may sit in cover: switch to a weapon that reaches it.
Reply with JSON only: {"turn_id": <the given turn_id>, "candidate_id": <one supplied id>}.`;
// Open turns contain observations and controls, never a local candidate ranking. These instructions are
// stable across maps, turns and difficulty; all configurable facts come from the validated snapshot.


// Numerical observations must remain numerical. Unknown keys cannot smuggle prose into the model's context.
const object=v=>Boolean(v&&typeof v==='object'&&!Array.isArray(v));
const exact=(v,required,optional=[])=>object(v)&&required.every(k=>Object.hasOwn(v,k))&&Object.keys(v).every(k=>required.includes(k)||optional.includes(k));
const num=(v,lo,hi)=>Number.isFinite(v)&&v>=lo&&v<=hi;
const int=(v,lo,hi)=>Number.isInteger(v)&&v>=lo&&v<=hi;
const numericRecord=(v,keys,lo=0,hi=10000)=>exact(v,keys)&&keys.every(k=>num(v[k],lo,hi));
const OPEN_ACTIONS=new Set(ACTION_SCHEMA.anyOf.map(s=>s.properties.type.enum[0]));
const GRID_LEGEND='0=empty, 1=mixed, 2=solid; each cell covers a rectangle of size width/columns by height/rows. Approximate: mixed cells do not reveal exact collision geometry.';
function validOpenSnapshot(s){
 const fields=['map','size','round','suddenDeath','timer','wind','windKnown','water','activeId','worms','props','propsTotal','propsTruncated','terrain','team','shotgunLeft','ammo','availableActions','remainingDecisions','remainingUtilities','rules','weapons','terrainGrid'];
 if(!exact(s,fields,['previousAction'])||!int(s.map,0,3)||!Array.isArray(s.size)||s.size.length!==2)return false;
 const [width,height]=s.size;if(width!==(s.map===3?6400:3600)||height!==(s.map===3?1800:1400))return false;
 if(!int(s.round,1,500)||typeof s.suddenDeath!=='boolean'||!num(s.timer,0,120)||typeof s.windKnown!=='boolean'||(s.windKnown?!num(s.wind,-100,100):s.wind!==null)||!num(s.water,0,height)||!int(s.activeId,0,5)||!int(s.team,0,1)||!int(s.shotgunLeft,0,1))return false;
 if(!Array.isArray(s.worms)||s.worms.length<1||s.worms.length>6||!s.worms.every(w=>exact(w,['id','team','x','y','hp','alive'],['name'])&&int(w.id,0,5)&&int(w.team,0,1)&&num(w.x,-2000,width+2000)&&num(w.y,-2000,height+2000)&&int(w.hp,0,100000)&&typeof w.alive==='boolean'&&(w.name===undefined||typeof w.name==='string'&&w.name.length<=24&&!/[\u0000-\u001f\u007f]/.test(w.name))))return false;
 if(new Set(s.worms.map(w=>w.id)).size!==s.worms.length||!s.worms.some(w=>w.id===s.activeId&&w.team===s.team&&w.alive))return false;
 if(!Array.isArray(s.props)||s.props.length>200||!int(s.propsTotal,0,100000)||s.props.length!==Math.min(200,s.propsTotal)||s.propsTruncated!==(s.propsTotal>200)||!s.props.every(p=>exact(p,['kind','x','y'],['armed'])&&PROP_KINDS.has(p.kind)&&num(p.x,-2000,width+2000)&&num(p.y,-2000,height+2000)&&(p.armed===undefined||p.kind==='mine'&&typeof p.armed==='boolean')))return false;
 if(!Array.isArray(s.terrain)||![32,64].includes(s.terrain.length)||!s.terrain.every(v=>num(v,0,height)))return false;
 if(!exact(s.ammo,['airstrike','teleport'])||!int(s.ammo.airstrike,0,9)||!int(s.ammo.teleport,0,9)||!int(s.remainingDecisions,1,MAX_AGENT_STEPS)||!int(s.remainingUtilities,0,MAX_UTILITY_STEPS))return false;
 if(!Array.isArray(s.availableActions)||!s.availableActions.length||s.availableActions.length>OPEN_ACTIONS.size||!s.availableActions.every(a=>OPEN_ACTIONS.has(a))||new Set(s.availableActions).size!==s.availableActions.length||!s.availableActions.includes('pass'))return false;
 if(s.previousAction!==undefined&&!validAgentAction(s.previousAction))return false;
 const r=s.rules;
 if(!numericRecord(r,['gravity','waterRise','turnTime','walkSpeed','windDrift','windCap','wormRadius','crateHeal','suddenDeathRound'])||!num(r.turnTime,10,120)||!num(r.waterRise,0,60)||!num(r.windDrift,0,60)||!num(r.windCap,0,100)||!num(r.crateHeal,0,100)||!int(r.suddenDeathRound,2,99)||r.wormRadius!==15)return false;
 const w=s.weapons;
 if(!exact(w,['bazooka','grenade','shotgun','dynamite','punch','airstrike','jetpack','rope'])||!numericRecord(w.bazooka,['damage','radius','speedBase','speedPerPower','windAcceleration','fuse'])||!exact(w.grenade,['damage','radius','speedBase','speedPerPower','windAcceleration','fuseRange','bounce'])||!['damage','radius','speedBase','speedPerPower','windAcceleration'].every(k=>num(w.grenade[k],0,10000))||!Array.isArray(w.grenade.fuseRange)||w.grenade.fuseRange.length!==2||w.grenade.fuseRange[0]!==1||w.grenade.fuseRange[1]!==5||!numericRecord(w.grenade.bounce,['high','low'],0,1))return false;
 if(!numericRecord(w.shotgun,['pellets','damagePerPellet','shotsPerTurn','range','spreadRadians'])||!numericRecord(w.dynamite,['damage','radius','fuse'])||!exact(w.punch,['damage','rangeX','rangeY','knockback'])||!['damage','rangeX','rangeY'].every(k=>num(w.punch[k],0,10000))||!Array.isArray(w.punch.knockback)||w.punch.knockback.length!==2||!w.punch.knockback.every(v=>num(v,-10000,10000))||!numericRecord(w.airstrike,['missiles','damage','radius','windAcceleration'])||!numericRecord(w.jetpack,['seconds'])||!numericRecord(w.rope,['maxLength']))return false;
 const g=s.terrainGrid;
 return exact(g,['columns','rows','cells','legend'])&&g.columns===96&&g.rows===48&&Array.isArray(g.cells)&&g.cells.length===48&&g.cells.every(row=>typeof row==='string'&&/^[012]{96}$/.test(row))&&g.legend===GRID_LEGEND;
}

function validBase(body){
 if(!body||typeof body!=='object'||Array.isArray(body)||!validId(body.turnId)||!Number.isInteger(body.difficulty)||body.difficulty<0||body.difficulty>3)return false;
 return body.history===undefined||body.difficulty===3&&validHistory(body.history)&&JSON.stringify(body.history).length<=16_000;
}
function validateLegacy(body){
 const s=body.snapshot;if(!s||!Number.isInteger(s.map)||s.map<0||s.map>3||!Number.isInteger(s.round)||s.round<1||s.round>500||!Number.isFinite(s.wind)||Math.abs(s.wind)>100||!Array.isArray(s.worms)||s.worms.length>6||!Array.isArray(s.terrain)||(s.terrain.length!==32&&s.terrain.length!==64)||!validProps(s.props)||!s.worms.every(w=>w&&(w.name===undefined||typeof w.name==='string'&&w.name.length<=24)))return false;
 if(!Array.isArray(body.candidates)||body.candidates.length<1||body.candidates.length>32)return false;
 const ids=new Set();for(const c of body.candidates){if(!c||!validId(c.id)||ids.has(c.id)||typeof c.description!=='string'||c.description.length>240)return false;ids.add(c.id)}return true;
}
function validate(body){
 if(!validBase(body))return false;
 if(body.protocol===OPEN_PROTOCOL)return Object.keys(body).every(k=>['protocol','turnId','difficulty','snapshot','history'].includes(k))&&validOpenSnapshot(body.snapshot);
 return body.protocol===undefined&&validateLegacy(body);
}
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
function complete(result,turnId,ids,pinned,billing,protocol){
 if(!attested(result,pinned,billing)){logJob('route not attested',result);return json({status:'error',error:'Broker did not attest the requested model route.'},502)}
 let plan;try{plan=JSON.parse(result.text)}catch{logJob('invalid JSON',result);return json({status:'error',error:'Broker returned invalid JSON.'},502)}
 if(protocol===OPEN_PROTOCOL){
  if(!plan||typeof plan!=='object'||Array.isArray(plan)||Object.keys(plan).length!==2||!Object.hasOwn(plan,'action')||plan.turn_id!==turnId||!validAgentAction(plan.action)){logJob('invalid move',result);return json({status:'error',error:'Broker returned an invalid move.'},502)}
  return json({status:'done',turnId,action:plan.action});
 }
 if(!plan||plan.turn_id!==turnId||!ids.includes(plan.candidate_id)){logJob('invalid move',result);return json({status:'error',error:'Broker returned an invalid move.'},502)}
 return json({status:'done',turnId,candidateId:plan.candidate_id});
}
export default {async fetch(request){
 const {model}=await activeModel();
 if(!enabled(model))return json({status:'unavailable',retryable:false,error:'Broker is not configured for this game.'},503);
 try{
  if(request.method==='POST'){
   if(Number(request.headers.get('content-length'))>50_000)return json({error:'request too large'},413);
   const raw=await request.text();if(Buffer.byteLength(raw,'utf8')>50_000)return json({error:'request too large'},413);
   let body;try{body=JSON.parse(raw)}catch{return json({error:'invalid JSON'},400)}
   if(!validate(body))return json({error:'invalid turn snapshot'},422);
   const row=await verifiedModel(model);
   if(!row)return json({status:'unavailable',retryable:false,error:'The selected Broker model is unavailable.'},503);
   const billing=typeof row.billing_type==='string'?row.billing_type:'unknown';
   const names=['easy','hard','ultra','god'];

   const open=body.protocol===OPEN_PROTOCOL;
   const schema={type:'object',properties:{turn_id:{type:'string'},...(open?{action:ACTION_SCHEMA}:{candidate_id:{type:'string'}})},required:open?['turn_id','action']:['turn_id','candidate_id'],additionalProperties:false};
   const user={turn_id:body.turnId,difficulty:names[body.difficulty],snapshot:body.snapshot,...(!open?{candidates:body.candidates}:{}),...(body.history?{history:body.history}:{})};
   const payload={model,messages:[{role:'system',content:open?OPEN_RULES:RULES},{role:'user',content:JSON.stringify(user)}],response_format:{type:'json_schema',json_schema:{name:open?'artillery_action':'artillery_turn',strict:true,schema}},workflow:'webworms-turn'};
   // Broker's project-scoped unique key replays the same job even after completion.
   // A changed payload for the same turn gets 409 instead of a second subscription run.
   const idempotencyKey='ww_'+sign('idem:'+body.turnId);
   const result=await broker('/v1/jobs?capability='+chatCapability(row),{method:'POST',headers:{'content-type':'application/json','Idempotency-Key':idempotencyKey},body:JSON.stringify(payload)});
   if(!Number.isInteger(result.job_id)||result.job_id<1)throw Error('invalid broker response');
   const ids=open?undefined:body.candidates.map(c=>c.id);
   if(result.status==='done')return complete(result,body.turnId,ids,model,billing,body.protocol);
   if(result.status==='error'||result.status==='cancelled'){logJob('job ended',result);return json({status:'error',error:'Broker could not complete this turn.'},502)}
   return json({status:'pending',ticket:ticketFor({jobId:result.job_id,turnId:body.turnId,...(open?{protocol:OPEN_PROTOCOL}:{ids}),model,billing,exp:Date.now()+8*60*60_000}),pollAfter:Math.min(10,Math.max(1,Number(result.poll_after_s)||2))},202);
  }
  if(request.method==='GET'){
   const p=parseTicket(new URL(request.url).searchParams.get('ticket'),model);if(!p)return json({error:'invalid or expired ticket'},400);
   const result=await broker(`/v1/jobs/${p.jobId}`);
   if(result.status==='pending'||result.status==='running')return json({status:'pending',pollAfter:Math.min(10,Math.max(1,Number(result.poll_after_s)||2))});
   if(result.status!=='done'){logJob('job ended',result);return json({status:'error',error:'Broker could not complete this turn.'},502)}
   return complete(result,p.turnId,p.ids,p.model,p.billing,p.protocol);
  }
  return json({error:'method not allowed'},405);
 }catch(error){
  console.error('broker turn failed:',error?.message);
  // Tell the player the parsed Broker code (never the key): a refusal needs a Broker setting, not a retry.
  const m=/^broker (\d+) on [^:]+: ([a-z0-9_.-]+)$/.exec(error?.message||''),status=Number(m?.[1]),code=m?.[2];
  if(status===401||status===403)return json({status:'unavailable',retryable:false,code,error:`Broker refused this game project (${code}). Enable agent runs for it in Broker.`},503);
  const retryable=status===408||status===429||status>=500||!status&&error?.code!=='ERR_INVALID_URL'&&['TypeError','AbortError','TimeoutError'].includes(error?.name);
  return json({status:'unavailable',retryable,code,error:retryable?'Broker is temporarily unavailable. Retrying the same turn.':'Broker request failed. Check the game configuration before retrying.'},503)}
}};
