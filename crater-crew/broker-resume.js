import {WORLD_SIZES} from './engine.js';
import {validHistory} from './journal.js';

export const PENDING_KEY='crater-crew-broker-pending-v1';
export const PENDING_AGE_MS=8*60*60_000;
const fields=['seed','map','difficulty','matchId','simDraws','round','waterLevel','wind','windTarget','timer','lastActiveId','selected','playerWeapon','shotgunLeft','grenadeFuse','grenadeBounce','strikeDir','playerGrenadeFuse','playerGrenadeBounce','playerStrikeDir','brokerSequence','used','aim','dir','power','controllers','journal','firstTeam','localAiTeams','ammo'];
const CONTROLLERS=new Set(['human','easy','hard','ultra','god']);

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
  const game=Object.fromEntries(fields.map(field=>[field,state[field]]));
  game.activeId=state.active?.id;game.worms=state.worms.map(w=>({...w}));
  game.top=Array.from(state.terrain.top);game.maskRuns=packMask(state.terrain.mask);
  const savedAt=state.brokerSavedAt||Date.now();if(Date.now()-savedAt>PENDING_AGE_MS)return false;
  const record={version:1,savedAt,request:state.brokerRequest,ticket:state.brokerTicket,game};
  const text=JSON.stringify(record);if(text.length>500000)return false;
  storage.setItem(PENDING_KEY,text);return true;
 }catch{return false}
}
export function readPendingTurn(storage=globalThis.sessionStorage,now=Date.now()){
 try{
  const raw=storage?.getItem(PENDING_KEY);if(!raw||raw.length>500000)return null;
  const record=JSON.parse(raw),g=record.game,r=record.request;
  if(record.version!==1||!Number.isFinite(record.savedAt)||record.savedAt>now||now-record.savedAt>PENDING_AGE_MS)return null;
  if(!g||!r||!Array.isArray(g.worms)||g.worms.length!==6||!g.worms.every((w,i)=>w.id===i&&w.team===Math.floor(i/3)&&Number.isFinite(w.x)&&Number.isFinite(w.y)&&Number.isFinite(w.hp)))return null;
  if(!Number.isInteger(g.activeId)||g.activeId<3||g.activeId>5||!g.worms[g.activeId].alive||!Number.isInteger(g.round)||g.round<1||g.round>500||!Number.isInteger(g.map)||g.map<0||g.map>=WORLD_SIZES.length||!Number.isInteger(g.difficulty)||g.difficulty<0||g.difficulty>2)return null;
  if(!Number.isInteger(g.seed)||g.seed<0||!Number.isInteger(g.simDraws)||g.simDraws<0||g.simDraws>1_000_000||!Number.isInteger(g.brokerSequence)||g.brokerSequence<1||g.brokerSequence>1000)return null;
  if(!Array.isArray(g.lastActiveId)||g.lastActiveId.length!==2||!g.lastActiveId.every(id=>Number.isInteger(id)&&id>=-1&&id<=5)||!Number.isFinite(g.wind)||!Number.isFinite(g.waterLevel)||!Number.isFinite(g.timer))return null;
  if(typeof g.matchId!=='string'||!/^[a-f0-9]{16}$/.test(g.matchId)||typeof r.turnId!=='string'||!r.turnId.startsWith(`t${g.matchId}_`)||r.snapshot?.activeId!==g.activeId||r.snapshot?.round!==g.round)return null;
  // PC GOD asks as difficulty 3 while the local profile stays at 2; its journal and the team controllers come back too.
  if(!Array.isArray(r.candidates)||r.candidates.length<1||r.candidates.length>32||!r.candidates.every(c=>typeof c.id==='string'&&typeof c.description==='string')||r.difficulty!==g.difficulty&&!(r.difficulty===3&&g.difficulty===2))return null;
  if(g.journal!==undefined&&!validHistory(g.journal)||g.firstTeam!==undefined&&g.firstTeam!==0&&g.firstTeam!==1||g.controllers!==undefined&&!(Array.isArray(g.controllers)&&g.controllers.length===2&&g.controllers.every(c=>CONTROLLERS.has(c))))return null;
  if(g.localAiTeams!==undefined&&!(Array.isArray(g.localAiTeams)&&g.localAiTeams.length===2&&g.localAiTeams.every(v=>typeof v==='boolean')&&!g.localAiTeams[1]))return null;
  if(g.ammo!==undefined&&!(Array.isArray(g.ammo)&&g.ammo.length===2&&g.ammo.every(a=>a&&['teleport','airstrike'].every(k=>Number.isInteger(a[k])&&a[k]>=0&&a[k]<=99))))return null;
  if(record.ticket!==null&&(typeof record.ticket!=='string'||record.ticket.length>5000))return null;
  const [width,height]=WORLD_SIZES[g.map];
  if(!Array.isArray(g.top)||g.top.length!==width||!g.top.every(y=>Number.isInteger(y)&&y>=0&&y<=height))return null;
  const mask=unpackMask(g.maskRuns,width,height);if(!mask)return null;
  return {savedAt:record.savedAt,request:r,ticket:record.ticket,game:{...g,terrain:{mask,top:Int16Array.from(g.top),map:g.map,seed:g.seed}}};
 }catch{return null}
}
