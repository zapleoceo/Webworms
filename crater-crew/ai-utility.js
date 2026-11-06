// ---- AI utility planning: teleport, health crates and the ninja rope. ----
// Pure, deterministic planners over the game state (no DOM, no Math.random). Every plan is checked against
// the same physics the game runs: selectShot/selectLob for shots, rope.js for the swing and a copy of
// game.js updateWorm's airborne branch (plus land() and the grounded slide) for the fall after release.
import {W,R,GRAVITY,WATER,wormDrowned,solid,groundY,wormFits,wormGrounded,crawl,selectShot,selectLob} from './engine.js';
import {fireRope,stepRope,releaseRope} from './rope.js';

export const ROPE_DT=1/60;
const MIN_SHOT=12;

const waterOf=state=>state.waterLevel??WATER;
const mineList=state=>(state.props||[]).filter(p=>p.kind==='mine'&&!p.dead);
const foesOf=(state,w)=>state.worms.filter(o=>o.alive&&o.team!==w.team);
const alliesOf=(state,w)=>state.worms.filter(o=>o.alive&&o.team===w.team&&o!==w);
const nearest=(list,x,y)=>list.reduce((a,b)=>!a||Math.hypot(b.x-x,b.y-y)<Math.hypot(a.x-x,a.y-y)?b:a,null);
const standY=(t,x)=>groundY(t,x)-R-1;

// ---------------------------------------------------------------- teleport

// A spot the worm can stand on: dry, level, roomy, away from mines, allies and (too close) enemies.
function teleportSpot(t,x,{water,mines,allies,foes}){
  if(x<40||x>W-40)return null;
  const g=groundY(t,x),y=g-R-1;
  if(g>water-90||Math.abs(groundY(t,x-14)-groundY(t,x+14))>14)return null;
  if(!wormFits(t,x,y)||!wormFits(t,x,y-8)||!wormGrounded(t,x,y+1))return null;
  if(mines.some(m=>Math.hypot(m.x-x,m.y-y)<70))return null;
  if(allies.some(a=>Math.hypot(a.x-x,a.y-y)<35))return null;
  if(foes.some(f=>Math.hypot(f.x-x,f.y-y)<200))return null;
  return {x,y};
}

export function planTeleport(state,{baseScore=0}={}){
  const w=state.active;if(!w?.alive||!state.terrain)return null;
  if(!(state.ammo?.[w.team]?.teleport>0))return null;
  const t=state.terrain,water=waterOf(state),foes=foesOf(state,w),allies=alliesOf(state,w),mines=mineList(state);
  if(!foes.length)return null;
  const diff=state.difficulty??1,wind=state.wind||0,ctx={water,mines,allies,foes};
  // Rings of candidate columns at 200..650 px on both sides of every enemy.
  const seen=new Set(),cand=[];
  for(const f of foes)for(const side of [-1,1])for(let d=200;d<=650;d+=45){
    const x=Math.round(f.x+side*d),key=Math.round(x/15);if(seen.has(key))continue;seen.add(key);
    const s=teleportSpot(t,x,ctx);if(!s)continue;
    const near=nearest(foes,s.x,s.y),dist=Math.hypot(near.x-s.x,near.y-s.y);
    // Prefer high ground at a comfortable bazooka range.
    cand.push({...s,pre:(near.y-s.y)*.08-Math.abs(dist-380)*.05});
  }
  cand.sort((a,b)=>b.pre-a.pre||a.x-b.x);
  const picked=[];for(const c of cand){if(picked.every(p=>Math.abs(p.x-c.x)>=40))picked.push(c);if(picked.length===16)break}
  if(!picked.length)return null;
  const friendsAt=s=>allies.concat({x:s.x,y:s.y,hp:w.hp});
  // Hard AI: screen with the normal sweep (5x cheaper), then re-aim the best few with the hard one.
  const screenDiff=diff===2?1:diff;
  let rated=picked.map(s=>({s,shot:selectShot(t,s,foes,friendsAt(s),wind,screenDiff,water)})).filter(r=>r.shot);
  rated.sort((a,b)=>b.shot.score-a.shot.score||a.s.x-b.s.x);
  if(screenDiff!==diff)rated=rated.slice(0,4).map(r=>({s:r.s,shot:selectShot(t,r.s,foes,friendsAt(r.s),wind,diff,water)||r.shot})).sort((a,b)=>b.shot.score-a.shot.score||a.s.x-b.s.x);
  let best=null;
  for(const [i,r] of rated.entries()){
    let plan={x:r.s.x,y:r.s.y,weapon:'bazooka',shot:r.shot,score:r.shot.score};
    if(diff>0&&i<3&&Math.hypot(nearest(foes,r.s.x,r.s.y).x-r.s.x,nearest(foes,r.s.x,r.s.y).y-r.s.y)<650){
      const lob=selectLob(t,r.s,foes,friendsAt(r.s),wind,diff,water);
      if(lob&&lob.score>plan.score)plan={...plan,weapon:'grenade',shot:lob,score:lob.score};
    }
    if(!best||plan.score>best.score)best=plan;
  }
  return best&&best.score>=30&&best.score>=baseScore+20?best:null;
}

// ---------------------------------------------------------------- health crates

// game.js safeWalk: ground samples every 18 px, climbs <= 30, drops <= 50, stays 40 px above the sea.
export function safeWalkPath(t,a,b,water=WATER){
  const dir=Math.sign(b-a);if(!dir)return true;let prior=groundY(t,a);
  for(let x=a+dir*18;dir>0?x<=b:x>=b;x+=dir*18){const y=groundY(t,x);if(y>water-40||prior-y>30||y-prior>50)return false;prior=y}
  return groundY(t,b)<water-40;
}

export function planCrate(state){
  const w=state.active;if(!w?.alive||!state.terrain||w.hp>60)return null;
  const t=state.terrain,water=waterOf(state);
  const crates=(state.props||[]).filter(p=>p.kind==='crate'&&!p.parachute&&!p.dead).sort((a,b)=>Math.abs(a.x-w.x)-Math.abs(b.x-w.x)||a.x-b.x);
  if(!crates.length)return null;
  for(const crate of crates)if(Math.abs(crate.x-w.x)<=420&&safeWalkPath(t,w.x,crate.x,water))return {how:'walk',x:crate.x,crate};
  if(w.hp>40||!(state.ammo?.[w.team]?.teleport>0))return null;
  for(const crate of crates)for(const dx of [0,-8,8,-16,16]){
    const x=Math.round(crate.x+dx),y=standY(t,x);
    if(x>R&&x<W-R&&y<water-40&&y>R&&wormFits(t,x,y))return {how:'teleport',x,y,crate};
  }
  return null;
}

// ---------------------------------------------------------------- ninja rope

// Inputs for the attached rope at time t (seconds since the hook attached, read before that frame's step).
export function executeRopeInputs(plan,t){
  const release=t>=plan.releaseAt-1e-6;
  return {left:!release&&plan.swing<0,right:!release&&plan.swing>0,up:!release&&!!plan.reel&&t<.5-1e-6,down:false,release};
}

// game.js updateWorm for a worm with no input after it leaves the rope: the airborne branch, land(),
// and the grounded skid, until it rests, drowns or the time cap runs out.
export function simulateFall(t,w0,{water=WATER,maxTime=4,dt=ROPE_DT}={}){
  const w={x:w0.x,y:w0.y,vx:w0.vx,vy:w0.vy,grounded:false,sliding:false,shoves:0,climbDebt:0};let hurt=0;
  const land=()=>{
    let gap=0;while(gap<8&&!solid(t,w.x,w.y+R+gap))gap++;
    if(gap>=8){const away=solid(t,w.x-7,w.y+R-3)||solid(t,w.x-9,w.y-1)?1:-1,nx=Math.max(R,Math.min(W-R,w.x+away*2));if(wormFits(t,nx,w.y)&&(w.shoves=(w.shoves||0)+1)<40){w.x=nx;w.vx=away*Math.max(40,Math.abs(w.vx)*.5);w.vy=Math.min(w.vy,40);return}}
    w.shoves=0;w.climbDebt=0;const impact=w.vy;
    if(impact>560)hurt+=Math.min(30,Math.round((impact-560)/8));
    if(impact>300){w.vy=-impact*.25;w.vx*=.6;return}
    w.y=Math.floor(w.y);for(let k=0;k<3&&!wormGrounded(t,w.x,w.y)&&wormFits(t,w.x,w.y+1);k++)w.y++;
    w.vy=0;w.grounded=true;w.sliding=Math.abs(w.vx)>60;if(!w.sliding)w.vx=0;
  };
  for(let time=0;time<maxTime-1e-9;time+=dt){
    if(w.grounded){
      if(w.sliding&&Math.abs(w.vx)>18){const st=crawl(t,w,Math.sign(w.vx),Math.abs(w.vx)*dt);w.vx*=Math.max(0,1-4.5*dt);if(st==='blocked')w.vx=0;if(st==='fell'){w.grounded=false;w.vy=0}}
      else{w.vx=0;w.sliding=false}
      if(w.grounded&&!wormGrounded(t,w.x,w.y)){w.grounded=false;w.vy=0}
    }
    if(!w.grounded){
      w.vy+=GRAVITY*dt;w.vy=Math.max(-600,Math.min(750,w.vy));
      for(let k=0;k<14&&!wormFits(t,w.x,w.y);k++)w.y--;
      const steps=Math.max(1,Math.ceil(Math.hypot(w.vx,w.vy)*dt/3));
      for(let i=0;i<steps;i++){
        const nx=Math.max(R,Math.min(W-R,w.x+w.vx*dt/steps)),ny=w.y+w.vy*dt/steps;
        if(wormFits(t,nx,ny)){w.x=nx;w.y=ny;continue}
        if(w.vy>0&&!wormFits(t,w.x,ny)){land();if(wormFits(t,nx,w.y))w.x=nx;break}
        if(!wormFits(t,nx,w.y)){w.vx=-w.vx*.3;if(wormFits(t,w.x,ny))w.y=ny;continue}
        w.vy=0;w.x=nx;
      }
    }
    if(wormDrowned(w,water))return {x:w.x,y:w.y,landed:false,drowned:true,hurt};
    if(w.grounded&&!w.sliding)return {x:w.x,y:w.y,landed:true,drowned:false,hurt};
  }
  return {x:w.x,y:w.y,landed:false,drowned:false,hurt};
}

// Can the worm just crawl there (through caves too, unlike the top-surface safeWalk)? Small drops are followed.
function crawlReaches(t,start,goal,water){
  const w={x:start.x,y:start.y,vx:0,vy:0,climbDebt:0},dir=Math.sign(goal.x-w.x);if(!dir)return Math.abs(goal.y-w.y)<20;
  for(let falls=0;falls<4;){
    const st=crawl(t,w,dir,Math.abs(goal.x-w.x));
    if(Math.abs(w.x-goal.x)<20)return Math.abs(w.y-goal.y)<20;
    if(st!=='fell')return false;
    const f=simulateFall(t,w,{water,maxTime:2});if(!f.landed||f.hurt>0)return false;w.x=f.x;w.y=f.y;w.climbDebt=0;falls++;
  }
  return false;
}

// Release times 0.3..2.4 s on whole frames (every 9 frames = 0.15 s).
const RELEASE_FRAMES=Array.from({length:15},(_,i)=>18+9*i);
const ROPE_ANGLES=[0,-15,15,-30,30,-45,45,-60,60];

// One attached swing; returns every acceptable landing (one per release time).
function ropeRun(t,start,aim,swing,reel,{water,mines,hp}){
  const w={x:start.x,y:start.y,vx:0,vy:0},a=aim*Math.PI/180,dirX=Math.sin(a),dirY=-Math.cos(a);
  const rope=fireRope(t,w,dirX,dirY);
  for(let i=0;i<60&&rope.state==='flying';i++)stepRope(t,w,rope,ROPE_DT,{});
  if(rope.state!=='attached')return [];
  const plan={dirX,dirY,swing,reel,releaseAt:Infinity},out=[];
  for(let k=0,r=0;r<RELEASE_FRAMES.length;k++){
    if(k===RELEASE_FRAMES[r]){
      const c={x:w.x,y:w.y,vx:w.vx,vy:w.vy};releaseRope(c,{...rope});r++;
      const f=simulateFall(t,c,{water});
      if(f.landed&&f.hurt<=25&&f.hurt<hp&&groundY(t,f.x)<=water-60&&f.y+R<water-60&&wormGrounded(t,f.x,f.y)&&!mines.some(m=>Math.hypot(m.x-f.x,m.y-f.y)<60))
        out.push({...plan,releaseAt:k/60,landing:{x:f.x,y:f.y},hurt:f.hurt});
    }
    stepRope(t,w,rope,ROPE_DT,executeRopeInputs(plan,k/60));
    if(wormDrowned(w,water))break;
  }
  return out;
}

export function planRope(state,{target}={}){
  const w=state.active;if(!w?.alive||!state.terrain)return null;
  const t=state.terrain,water=waterOf(state),foes=foesOf(state,w);
  if(!wormFits(t,w.x,w.y)||!(wormGrounded(t,w.x,w.y)||wormGrounded(t,w.x,w.y+1)))return null;
  const goal=target??nearest(foes,w.x,w.y);if(!goal)return null;
  const ctx={water,mines:mineList(state),hp:w.hp},toward=Math.sign(goal.x-w.x)||1;
  const landings=[];
  for(const aim of ROPE_ANGLES)for(const [swing,reel] of [[toward,false],[toward,true],[-toward,true]])landings.push(...ropeRun(t,w,aim*toward,swing,reel,ctx));
  if(!landings.length)return null;
  const d0=Math.hypot(goal.x-w.x,goal.y-w.y);
  for(const l of landings){
    const moved=Math.hypot(l.landing.x-w.x,l.landing.y-w.y),closer=d0-Math.hypot(goal.x-l.landing.x,goal.y-l.landing.y);
    // Closeness counts from 150 px, and only where walking would not get there; height and fall damage break ties.
    l.walkable=moved<40||crawlReaches(t,w,l.landing,water);l.gain=l.walkable?0:(closer>=150?closer/10:0);l.pre=closer*.05+(w.y-l.landing.y)*.08-l.hurt;
  }
  // Pit escape: only when the start has no shot, re-aim from the few highest-ranked distinct landings.
  if(foes.length){
    const friends=alliesOf(state,w);
    const startShot=selectShot(t,w,foes,friends.concat(w),state.wind||0,state.difficulty??1,water)?.score??-999;
    if(startShot<MIN_SHOT){
      const top=[];for(const l of [...landings].sort((a,b)=>b.pre-a.pre||a.releaseAt-b.releaseAt)){if(l.walkable)continue;if(top.every(o=>Math.hypot(o.landing.x-l.landing.x,o.landing.y-l.landing.y)>=30))top.push(l);if(top.length===3)break}
      for(const l of top){
        const from={x:l.landing.x,y:l.landing.y},shot=selectShot(t,from,foes,friends.concat(from),state.wind||0,state.difficulty??1,water);
        if(shot&&shot.score>=20)l.gain=Math.max(l.gain,shot.score-Math.max(0,startShot));
      }
    }
  }
  let best=null;for(const l of landings)if(l.gain>0&&(!best||l.gain>best.gain||l.gain===best.gain&&l.pre>best.pre))best=l;
  if(!best)return null;
  const {dirX,dirY,swing,reel,releaseAt,landing,gain}=best;
  return {dirX,dirY,swing,reel,releaseAt,landing,gain};
}
