// Headless bot-vs-bot balance harness: loads game.js with DOM stubs and plays whole PC Easy vs PC Easy matches
// (the local sandbox AI only, no Broker), then reports who won, how worms died and which weapons did it.
// Used by balance.test.js (small N) and from the command line for the big runs:
//   node balance-sim.js [matchesPerMap=40] [firstSeed=1]
import {R,WATER,groundY,wormDrowned} from './engine.js';

const elements=new Map();
function element(id){if(!elements.has(id))elements.set(id,{id,style:{},classList:{add(){},remove(){},toggle(){}},dataset:{},listeners:{},textContent:'',innerHTML:'',value:'0',checked:false,disabled:false,hidden:false,addEventListener(event,fn){this.listeners[event]=fn},appendChild(){},setPointerCapture(){},getBoundingClientRect(){return {left:0,top:0,width:1600,height:800}}});return elements.get(id)}
const context=new Proxy({},{get:(o,k)=>k==='createImageData'?(w,h)=>({data:new Uint8ClampedArray(w*h*4)}):k==='createLinearGradient'||k==='createRadialGradient'?()=>({addColorStop(){}}):()=>{}});
element('game').getContext=()=>context;
globalThis.document??={getElementById:element,createElement:tag=>tag==='canvas'?{width:0,height:0,getContext:()=>context}:element('created-'+Math.random()),querySelectorAll:()=>[]};
globalThis.window??={listeners:{},addEventListener(event,fn){this.listeners[event]=fn}};
globalThis.sessionStorage??={getItem:()=>null,setItem(){},removeItem(){}};
globalThis.requestAnimationFrame??=()=>{};
// BALANCE_GAME swaps in another copy of game.js (e.g. the main branch's) to measure before/after side by side.
await import(process.env.BALANCE_GAME||'./game.js');
export const game=window.__craterCrew;

// How far (px, horizontally) a worm stands from the nearest open water column: sea, a channel or the map edge.
export function waterDistance(t,x,limit=600){
 for(let d=0;d<=limit;d+=10)for(const s of [-1,1]){const cx=x+s*d;if(cx<0||cx>=t.top.length||groundY(t,cx)>WATER-5)return d}
 return Infinity;
}

// One full match. Returns the winner (0, 1 or 2 = draw), who moved first, the turn count and every death.
export function playMatch(map,seed,{controllers=['easy','easy'],maxSeconds=1500,dt=1/30,setup=null}={}){
 const {state,newGame}=game;state.controllers=[...controllers];state.aiDriver='local';
 newGame(map,2,seed);setup?.(state);
 const first=state.team,startNear=state.worms.map(w=>waterDistance(state.terrain,w.x));
 const turns=[],deaths=[];let seen=null,turnNo=1,turnTeam=state.team,turnWeapon=null;
 const alive=state.worms.map(w=>w.alive);let turnHp=state.worms.map(w=>w.hp);
 for(let time=0;time<maxSeconds&&!state.ended;time+=dt){
  game.update(dt);
  const j=state.journal,last=j?.[j.length-1];
  if(state.turnLog?.a&&!turnWeapon)turnWeapon=state.turnLog.a;
  state.worms.forEach((w,i)=>{if(alive[i]&&!w.alive){alive[i]=false;deaths.push({id:w.id,team:w.team,turn:turnNo,hpBefore:turnHp[i],near:startNear[i],round:state.round,by:turnTeam,weapon:turnWeapon||'none',drowned:wormDrowned(w,state.waterLevel)})}});
  if(last&&last!==seen){seen=last;turns.push(last);turnNo++;turnTeam=state.team;turnWeapon=null;turnHp=state.worms.map(w=>w.hp)}
 }
 const winner=state.ended?(state.worms.some(w=>w.alive&&w.team===0)?state.worms.some(w=>w.alive&&w.team===1)?2:0:state.worms.some(w=>w.alive&&w.team===1)?1:2):-1;
 return {map,seed,first,winner,turns:turns.length,rounds:state.round,weapons:turns.map(t=>t.a),deaths,startNear,hp:state.worms.map(w=>w.alive?Math.round(w.hp):0)};
}

// Aggregate statistics over many matches.
export function summarize(results){
 const n=results.length,decided=results.filter(r=>r.winner===0||r.winner===1);
 const kills=results.flatMap(r=>r.deaths),byWeapon={},use={};
 for(const r of results)for(const a of r.weapons)use[a]=(use[a]||0)+1;
 for(const d of kills){const k=d.weapon;(byWeapon[k]??={kills:0,drowned:0}).kills++;if(d.drowned)byWeapon[k].drowned++}
 const near=results.flatMap(r=>r.startNear);
 return {matches:n,unfinished:results.filter(r=>r.winner<0).length,draws:results.filter(r=>r.winner===2).length,
  firstMoverWin:decided.length?decided.filter(r=>r.winner===r.first).length/decided.length:NaN,
  team0Starts:results.filter(r=>r.first===0).length/n,
  team0Win:decided.length?decided.filter(r=>r.winner===0).length/decided.length:NaN,
  deaths:kills.length,drownShare:kills.length?kills.filter(d=>d.drowned).length/kills.length:0,
  earlyKills:kills.filter(d=>d.turn<=2).length,earlyKillMatches:results.filter(r=>r.deaths.some(d=>d.turn<=2)).length/n,
  avgTurns:results.reduce((s,r)=>s+r.turns,0)/n,avgRounds:results.reduce((s,r)=>s+r.rounds,0)/n,
  startNearWater:{within150:near.filter(d=>d<=150).length/near.length,within300:near.filter(d=>d<=300).length/near.length},
  use,byWeapon};
}

if(import.meta.url===`file://${process.argv[1]?.replace(/\\/g,'/').replace(/^(?=[A-Za-z]:)/,'/')}`){
 const perMap=Number(process.argv[2]||40),seed0=Number(process.argv[3]||1),maps=(process.argv[4]||'0,1,2,3').split(',').map(Number),all=[];
 for(const map of maps){const rs=[];const t0=Date.now();for(let i=0;i<perMap;i++)rs.push(playMatch(map,seed0+i*7919));all.push(...rs);console.log(`map ${map}`,JSON.stringify(summarize(rs)),`${((Date.now()-t0)/1000).toFixed(0)}s`)}
 console.log('ALL',JSON.stringify(summarize(all),null,1));
}
