import {WORLD_SIZES} from './engine.js';
import {OPEN_PROTOCOL,MAX_AGENT_STEPS,MAX_UTILITY_STEPS,validAgentAction} from './agent-contract.js';
import {validHistory,JOURNAL_ACTIONS} from './journal.js';

export const PENDING_KEY='crater-crew-broker-pending-v1';
export const PENDING_AGE_MS=8*60*60_000;
const fields=['seed','map','difficulty','matchId','simDraws','round','waterLevel','wind','windTarget','timer','lastActiveId','selected','playerWeapon','shotgunLeft','grenadeFuse','grenadeBounce','strikeDir','playerGrenadeFuse','playerGrenadeBounce','playerStrikeDir','brokerSequence','used','aim','dir','power','controllers','journal','firstTeam','localAiTeams','ammo'];
const agentFields=['props','crateHeal','suddenDeathRound','agentRules','agentStepCount','agentUtilityCount','agentLastAction','turnLog'];
const CONTROLLERS=new Set(['human','easy','hard','ultra','god']);
function validTurnLog(t,g){
 if(!t||typeof t!=='object'||Array.isArray(t)||Object.keys(t).length!==10||!['r','t','w','wd','before','a','u','aim','tg','land'].every(k=>Object.hasOwn(t,k)))return false;
 if(t.r!==g.round||t.w!==g.activeId||t.t!==g.worms[g.activeId].team||!Number.isInteger(t.wd)||Math.abs(t.wd)>100)return false;
 if(!Array.isArray(t.before)||t.before.length!==6||!t.before.every((w,i)=>w&&w.id===i&&w.team===Math.floor(i/3)&&typeof w.alive==='boolean'&&['hp','x','y'].every(k=>Number.isFinite(w[k]))&&w.hp>=0))return false;
 if(t.a!==null&&!JOURNAL_ACTIONS.includes(t.a)||t.u!==null&&!['rope','teleport'].includes(t.u)||t.tg!==null&&(!Number.isInteger(t.tg)||t.tg<0||t.tg>5))return false;
 const bounded=(v,lo,hi)=>Number.isInteger(v)&&v>=lo&&v<=hi;
 const aimChecks={ang:v=>bounded(v,-90,90),p:v=>bounded(v,0,100),d:v=>v===-1||v===1,x:v=>bounded(v,0,10000)};
 if(t.aim!==null&&(!t.aim||typeof t.aim!=='object'||Array.isArray(t.aim)||!Object.keys(t.aim).every(k=>Object.hasOwn(aimChecks,k)&&aimChecks[k](t.aim[k]))))return false;
 return t.land===null||Array.isArray(t.land)&&t.land.length===2&&t.land.every(v=>bounded(v,-2000,10000));
}


function packMask(mask){
 const runs=[];let value=0,count=0;
 for(const pixel of mask){if(pixel!==value){runs.push(count);value=pixel;count=0}count++}
 runs.push(count);return runs;
}
function unpackMask(runs,width,height){
 if(!Array.isArray(runs)||runs.length<2||runs.length>100000)return null;
 const mask=new Uint8Array(width*height);let offset=0,value=0;
 for(const length of runs){if(!Number.isInteger(length)||length<0||offset+length>mask.length)return null;if(value)mask.fill(1,offset,offset+length);offset+=length;value=1-value}
 return offset===mask.length?mask:null;
}
export function clearPendingTurn(storage=globalThis.sessionStorage){try{storage?.removeItem(PENDING_KEY)}catch{}}
export function savePendingTurn(state,storage=globalThis.sessionStorage){
 try{
  if(!storage||!state.brokerRequest||!state.terrain?.mask)return false;
  const game=Object.fromEntries([...fields,...(state.brokerRequest.protocol===OPEN_PROTOCOL?agentFields:[])].map(field=>[field,state[field]]));
  game.activeId=state.active?.id;game.worms=state.worms.map(w=>({...w}));
  game.top=Array.from(state.terrain.top);game.maskRuns=packMask(state.terrain.mask);
  const savedAt=state.brokerSavedAt||Date.now();if(Date.now()-savedAt>PENDING_AGE_MS)return false;
  const record={version:1,savedAt,checkpointAt:Date.now(),deadlineAt:state.brokerDeadlineAt>=savedAt&&state.brokerDeadlineAt<=Date.now()+Math.max(0,(state.timer-5)*1000)+1000?state.brokerDeadlineAt:null,request:state.brokerRequest,ticket:state.brokerTicket,game};
  const text=JSON.stringify(record);if(text.length>500000)return false;
  storage.setItem(PENDING_KEY,text);return true;
 }catch{return false}
}
export function readPendingTurn(storage=globalThis.sessionStorage,now=Date.now()){
 try{
  const raw=storage?.getItem(PENDING_KEY);if(!raw||raw.length>500000)return null;
  const record=JSON.parse(raw),g=record.game,r=record.request;
  if(record.checkpointAt!==undefined&&(!Number.isFinite(record.checkpointAt)||record.checkpointAt<record.savedAt||record.checkpointAt>now))return null;
  if(record.deadlineAt!==undefined&&record.deadlineAt!==null&&(!Number.isFinite(record.deadlineAt)||record.deadlineAt<record.savedAt||record.deadlineAt>(record.checkpointAt??record.savedAt)+Math.max(0,(g?.timer-5)*1000)+1000))return null;
  const open=r?.protocol===OPEN_PROTOCOL;if(r?.protocol!==undefined&&!open)return null;
  if(record.version!==1||!Number.isFinite(record.savedAt)||record.savedAt>now||now-record.savedAt>PENDING_AGE_MS)return null;
  if(!g||!r||!Array.isArray(g.worms)||g.worms.length!==6||!g.worms.every((w,i)=>w.id===i&&w.team===Math.floor(i/3)&&Number.isFinite(w.x)&&Number.isFinite(w.y)&&Number.isFinite(w.hp)))return null;
  if(!Number.isInteger(g.activeId)||g.activeId<(open?0:3)||g.activeId>5||!g.worms[g.activeId].alive||!Number.isInteger(g.round)||g.round<1||g.round>500||!Number.isInteger(g.map)||g.map<0||g.map>=WORLD_SIZES.length||!Number.isInteger(g.difficulty)||g.difficulty<0||g.difficulty>2)return null;
  if(!Number.isInteger(g.seed)||g.seed<0||!Number.isInteger(g.simDraws)||g.simDraws<0||g.simDraws>1_000_000||!Number.isInteger(g.brokerSequence)||g.brokerSequence<1||g.brokerSequence>(open?6000:1000))return null;
  if(!Array.isArray(g.lastActiveId)||g.lastActiveId.length!==2||!g.lastActiveId.every(id=>Number.isInteger(id)&&id>=-1&&id<=5)||!Number.isFinite(g.wind)||!Number.isFinite(g.waterLevel)||!Number.isFinite(g.timer))return null;
  if(typeof g.matchId!=='string'||!/^[a-f0-9]{16}$/.test(g.matchId)||typeof r.turnId!=='string'||!r.turnId.startsWith(`t${g.matchId}_`)||r.snapshot?.activeId!==g.activeId||r.snapshot?.round!==g.round)return null;
  // PC GOD asks as difficulty 3 while the local profile stays at 2; its journal and the team controllers come back too.
  if(!open&&(!Array.isArray(r.candidates)||r.candidates.length<1||r.candidates.length>32||!r.candidates.every(c=>typeof c.id==='string'&&typeof c.description==='string')))return null;
  if(r.difficulty!==g.difficulty&&!(r.difficulty===3&&g.difficulty===2))return null;
  if(open){
   if(!validTurnLog(g.turnLog,g))return null;
   if(!Number.isInteger(g.agentStepCount)||g.agentStepCount<0||g.agentStepCount>=MAX_AGENT_STEPS||!Number.isInteger(g.agentUtilityCount)||g.agentUtilityCount<0||g.agentUtilityCount>MAX_UTILITY_STEPS||g.agentLastAction!==null&&!validAgentAction(g.agentLastAction))return null;
   if(!Array.isArray(g.props)||g.props.length>1000||!g.props.every(p=>p&&['mine','barrel','crate'].includes(p.kind)&&Number.isFinite(p.x)&&Number.isFinite(p.y)))return null;
   if(!g.agentRules||!['gravity','waterRise','turnTime','walkSpeed','windDrift','windCap'].every(k=>Number.isFinite(g.agentRules[k]))||!Number.isFinite(g.crateHeal)||!Number.isFinite(g.suddenDeathRound))return null;
   if(g.controllers&& !['hard','ultra','god'].includes(g.controllers[g.worms[g.activeId].team]))return null;
  }
  if(g.journal!==undefined&&!validHistory(g.journal)||g.firstTeam!==undefined&&g.firstTeam!==0&&g.firstTeam!==1||g.controllers!==undefined&&!(Array.isArray(g.controllers)&&g.controllers.length===2&&g.controllers.every(c=>CONTROLLERS.has(c))))return null;
  if(g.localAiTeams!==undefined&&!(Array.isArray(g.localAiTeams)&&g.localAiTeams.length===2&&g.localAiTeams.every(v=>typeof v==='boolean')&&!g.localAiTeams[open?g.worms[g.activeId].team:1]))return null;
  if(g.ammo!==undefined&&!(Array.isArray(g.ammo)&&g.ammo.length===2&&g.ammo.every(a=>a&&['teleport','airstrike'].every(k=>Number.isInteger(a[k])&&a[k]>=0&&a[k]<=99))))return null;
  if(record.ticket!==null&&(typeof record.ticket!=='string'||record.ticket.length>5000))return null;
  const [width,height]=WORLD_SIZES[g.map];
  if(!Array.isArray(g.top)||g.top.length!==width||!g.top.every(y=>Number.isInteger(y)&&y>=0&&y<=height))return null;
  const mask=unpackMask(g.maskRuns,width,height);if(!mask)return null;
  return {savedAt:record.savedAt,checkpointAt:record.checkpointAt??record.savedAt,deadlineAt:record.deadlineAt??(record.checkpointAt??record.savedAt)+Math.max(0,(g.timer-5)*1000),request:r,ticket:record.ticket,game:{...g,terrain:{mask,top:Int16Array.from(g.top),map:g.map,seed:g.seed}}};
 }catch{return null}
}
