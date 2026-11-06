// Match journal for PC GOD: one compact entry per finished turn (both teams), so the Broker model can look back at
// what was tried and what it did. Short keys keep 40 turns at a few KB; the same schema check runs on the server.
//   r round · t team · w worm id · a action (a weapon id, or 'pass' when nothing was fired) · u utility used first
//   ang aim in degrees (negative = up) · p power 0-100 · d facing (+1 right / -1 left; airstrike: flight direction)
//   x airstrike target x · wd wind at the shot · tg intended target worm id · l [x,y] where the shot exploded or left play
//   m [dx,dy] = l minus the target's position at turn start · h [[worm id, damage]] · k worms that died (any team)
//   dr worms that drowned · s damage the shooter did to itself
export const JOURNAL_MAX=40;
export const JOURNAL_ACTIONS=['bazooka','grenade','shotgun','dynamite','airstrike','punch','jetpack','rope','teleport','pass'];
const ACTIONS=new Set(JOURNAL_ACTIONS),UTILITIES=new Set(['rope','teleport']);
const KEYS=new Set(['r','t','w','a','u','ang','p','d','x','wd','tg','l','m','h','k','dr','s']);
const clampInt=(v,lo,hi)=>Math.max(lo,Math.min(hi,Math.round(v)));

// Turn start: who acts and everybody's health and position, to measure the outcome against.
export function openTurn(state){
 const w=state.active;if(!w)return null;
 return {r:state.round,t:w.team,w:w.id,wd:clampInt(state.wind,-100,100),before:state.worms.map(x=>({id:x.id,team:x.team,hp:x.hp,alive:x.alive,x:x.x,y:x.y})),a:null,u:null,aim:null,tg:null,land:null};
}
// fire(): the first real shot of the turn is the action; rope/teleport before it count as the utility.
export function noteAction(turn,state,weapon,power=state.power){
 if(!turn||!ACTIONS.has(weapon))return;
 if(UTILITIES.has(weapon)){if(!turn.a&&!turn.u)turn.u=weapon;return}
 if(turn.a)return;
 turn.a=weapon;turn.wd=clampInt(state.wind,-100,100);
 const aim={};
 if(weapon==='bazooka'||weapon==='grenade'||weapon==='shotgun'){aim.ang=clampInt(state.aim*180/Math.PI,-90,90);aim.d=state.dir<0?-1:1}
 if(weapon==='bazooka'||weapon==='grenade')aim.p=clampInt(power*100,0,100);
 if(weapon==='punch'||weapon==='dynamite')aim.d=state.dir<0?-1:1;
 if(weapon==='airstrike'){aim.d=state.strikeDir<0?-1:1;if(Number.isFinite(state.airTarget))aim.x=clampInt(state.airTarget,0,10000)}
 turn.aim=aim;
}
export function noteTarget(turn,id){if(turn&&Number.isInteger(id)&&id>=0&&id<=5)turn.tg=id}
// The candidate ids name their target worm: bazooka_4, grenade_3, air_5_left, punch_4, shotgun_3, dynamite_4.
export function targetFromCandidate(id){const m=/^(?:bazooka|grenade|shotgun|punch|air|dynamite)_([0-5])(?:_|$)/.exec(String(id));return m?Number(m[1]):null}
// A projectile of the acting worm ended (exploded, sank or left the map): the first one marks where the shot went.
export function noteLanding(turn,p){if(turn&&!turn.land&&p&&p.source===turn.w&&Number.isFinite(p.x)&&Number.isFinite(p.y))turn.land=[clampInt(p.x,-2000,10000),clampInt(p.y,-2000,10000)]}

// Turn end: compare with the turn start and append one compact entry; the journal keeps the last JOURNAL_MAX turns.
export function closeTurn(turn,state,journal){
 if(!turn||!Array.isArray(journal))return null;
 const h=[],k=[],dr=[];let s=0;
 for(const b of turn.before){
  const w=state.worms.find(x=>x.id===b.id);if(!w||!b.alive)continue;
  const lost=clampInt(Math.max(0,b.hp-(w.alive?w.hp:0)),0,400);
  if(lost>0)h.push([b.id,lost]);
  if(!w.alive){k.push(b.id);if(w.y>state.waterLevel-12)dr.push(b.id)}
  if(b.id===turn.w)s=lost;
 }
 const e={r:clampInt(turn.r,1,500),t:turn.t,w:turn.w,a:turn.a||turn.u||'pass'};
 if(turn.a&&turn.u)e.u=turn.u;
 Object.assign(e,turn.aim||{});e.wd=turn.wd;
 let tg=turn.tg;
 if(tg==null&&turn.land&&turn.a){
  // Not told the target (a human or the local AI shot): the enemy nearest to where the shot came down.
  let best=Infinity;for(const b of turn.before){if(!b.alive||b.team===turn.t)continue;const d=Math.hypot(b.x-turn.land[0],b.y-turn.land[1]);if(d<best){best=d;tg=b.id}}
 }
 if(tg!=null)e.tg=tg;
 if(turn.land){e.l=turn.land;const target=turn.before.find(b=>b.id===tg);if(target)e.m=[clampInt(turn.land[0]-target.x,-10000,10000),clampInt(turn.land[1]-target.y,-10000,10000)]}
 Object.assign(e,{h,k,dr,s});
 journal.push(e);if(journal.length>JOURNAL_MAX)journal.splice(0,journal.length-JOURNAL_MAX);
 return e;
}

// Strict schema for one entry and for the whole history (shared by the browser and api/ai/turn.mjs).
const int=(v,lo,hi)=>Number.isInteger(v)&&v>=lo&&v<=hi;
const opt=(v,lo,hi)=>v===undefined||int(v,lo,hi);
const pair=(v,lo,hi)=>Array.isArray(v)&&v.length===2&&int(v[0],lo,hi)&&int(v[1],lo,hi);
const ids=v=>Array.isArray(v)&&v.length<=6&&v.every(i=>int(i,0,5));
export function validEntry(e){
 if(!e||typeof e!=='object'||Array.isArray(e))return false;
 for(const key of Object.keys(e))if(!KEYS.has(key))return false;
 return int(e.r,1,500)&&int(e.t,0,1)&&int(e.w,0,5)&&ACTIONS.has(e.a)&&(e.u===undefined||UTILITIES.has(e.u))&&opt(e.ang,-90,90)&&opt(e.p,0,100)&&(e.d===undefined||e.d===1||e.d===-1)&&opt(e.x,0,10000)&&int(e.wd,-100,100)&&opt(e.tg,0,5)&&(e.l===undefined||pair(e.l,-2000,10000))&&(e.m===undefined||pair(e.m,-10000,10000))&&Array.isArray(e.h)&&e.h.length<=6&&e.h.every(p=>Array.isArray(p)&&p.length===2&&int(p[0],0,5)&&int(p[1],1,400))&&ids(e.k)&&ids(e.dr)&&int(e.s,0,400);
}
export const validHistory=h=>Array.isArray(h)&&h.length<=JOURNAL_MAX&&h.every(validEntry);
