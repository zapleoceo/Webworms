import test from 'node:test';
import assert from 'node:assert/strict';
import {W,H,R,WATER,createTerrain,spawnSpots,groundY,wormFits,wormGrounded,selectShot} from './engine.js';
import {fireRope,stepRope,releaseRope} from './rope.js';
import {planTeleport,planCrate,planRope,executeRopeInputs,simulateFall,ROPE_DT} from './ai-utility.js';

// A flat island with an optional profile, like engine.test.js: top(x) gives the surface of each column.
function shaped(top){const t=createTerrain(0,1);for(let x=0;x<W;x++){t.top[x]=Math.floor(top(x));for(let y=0;y<H;y++)t.mask[y*W+x]=y>=t.top[x]?1:0}return t}
function addRect(t,x0,y0,x1,y1){for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)t.mask[y*W+x]=1;for(let x=x0;x<x1;x++){let y=0;while(y<H&&!t.mask[y*W+x])y++;t.top[x]=y}}
const worm=(t,id,team,x,hp=100)=>({id,team,name:'w'+id,x,y:groundY(t,x)-R-1,hp,alive:true,grounded:true});
function makeState(t,worms,{active=0,teleports=2,props=[],difficulty=1,wind=0}={}){
  return {terrain:t,worms,active:worms[active],wind,difficulty,waterLevel:WATER,props,ammo:[{teleport:teleports},{teleport:teleports}]};
}
function timed(fn){const a=performance.now(),r=fn();return [r,performance.now()-a]}

// AI (team 1) at x=1000 boxed in by two walls that reach almost to the sky; enemies stand in the open.
const walled=()=>shaped(x=>(x>=900&&x<940)||(x>=1060&&x<1100)?30:700);

test('planTeleport leaves a walled-in position for a spot with a real shot',()=>{
  const t=walled(),worms=[worm(t,0,0,1700),worm(t,1,0,2300),worm(t,2,1,1000)],state=makeState(t,worms,{active:2});
  const here=selectShot(t,worms[2],worms.slice(0,2),[worms[2]],0,1,WATER);
  const plan=planTeleport(state,{baseScore:here?.score??0});
  assert.ok(plan,'expected a teleport plan');
  assert.ok(plan.score>=30&&plan.score>=(here?.score??0)+20,`score ${plan.score} vs ${here?.score}`);
  assert.ok(plan.x>1100,`spot outside the walls: ${plan.x}`);
  assert.equal(plan.y,groundY(t,plan.x)-R-1);assert.ok(wormFits(t,plan.x,plan.y));
  assert.ok(['bazooka','grenade'].includes(plan.weapon));assert.ok(plan.shot);
  assert.ok(Math.min(...worms.slice(0,2).map(e=>Math.hypot(e.x-plan.x,e.y-plan.y)))>=200);
  assert.ok(plan.y+R<WATER-90);
  // No charges, no plan.
  assert.equal(planTeleport(makeState(t,worms,{active:2,teleports:0})),null);
});

test('planTeleport keeps away from mines and allies',()=>{
  const t=walled(),worms=[worm(t,0,0,1700),worm(t,1,1,1000),worm(t,2,1,1400)];
  const props=[1300,1350,1450,1500,1950,2000,2050,2100].map(x=>({kind:'mine',x,y:groundY(t,x)-8}));
  const plan=planTeleport(makeState(t,worms,{active:1,props}));
  assert.ok(plan);
  for(const m of props)assert.ok(Math.hypot(m.x-plan.x,m.y-plan.y)>=70,`mine at ${m.x}, spot ${plan.x}`);
  assert.ok(Math.abs(plan.x-1400)>=35);
});

test('planCrate walks to a near crate, teleports to a far one, ignores crates when healthy',()=>{
  const t=shaped(()=>700),crate=x=>({kind:'crate',x,y:700-12,r:11});
  const near=[worm(t,0,0,2600),worm(t,1,1,1000,50)];
  assert.deepEqual(planCrate(makeState(t,near,{active:1,props:[crate(1300)]})),{how:'walk',x:1300,crate:makeState(t,near,{props:[crate(1300)]}).props[0]});
  // Still parachuting: not yet a target.
  assert.equal(planCrate(makeState(t,near,{active:1,props:[{...crate(1300),parachute:true}]})),null);
  const far=[worm(t,0,0,2600),worm(t,1,1,400,30)],fs=makeState(t,far,{active:1,props:[crate(1500)]}),plan=planCrate(fs);
  assert.equal(plan?.how,'teleport');assert.equal(plan.crate,fs.props[0]);
  assert.ok(Math.abs(plan.x-1500)<=16);assert.equal(plan.y,groundY(t,plan.x)-R-1);assert.ok(wormFits(t,plan.x,plan.y));
  // Hurt but not badly enough to spend a teleport on a far crate; no charges; healthy.
  assert.equal(planCrate(makeState(t,[far[0],{...far[1],hp:55}],{active:1,props:[crate(1500)]})),null);
  assert.equal(planCrate(makeState(t,far,{active:1,teleports:0,props:[crate(1500)]})),null);
  assert.equal(planCrate(makeState(t,[near[0],{...near[1],hp:90}],{active:1,props:[crate(1300)]})),null);
  // A crate across a cliff is not walkable even when close.
  const cliff=shaped(x=>x>1150?500:700),cw=[worm(cliff,0,0,2600),worm(cliff,1,1,1000,35)];
  assert.equal(planCrate(makeState(cliff,cw,{active:1,props:[crate(1300)]}))?.how,'teleport');
});

// Replays a rope plan the way the game will: fire, fly, then executeRopeInputs per frame, then the fall.
function replay(t,w0,plan){
  const w={x:w0.x,y:w0.y,vx:0,vy:0},rope=fireRope(t,w,plan.dirX,plan.dirY);
  for(let i=0;i<60&&rope.state==='flying';i++)stepRope(t,w,rope,ROPE_DT,{});
  assert.equal(rope.state,'attached');
  for(let time=0;time<5;time+=ROPE_DT){
    const inp=executeRopeInputs(plan,time);
    if(inp.release){releaseRope(w,rope);return simulateFall(t,w,{water:WATER})}
    stepRope(t,w,rope,ROPE_DT,inp);
  }
  assert.fail('never released');
}

// A 250 px deep, 360 px wide pit (a jump clears ~80 px) under a rock ledge to hook; the enemy waits on the plateau.
function pit(){const t=shaped(x=>x>=1000&&x<1360?850:600);addRect(t,1120,440,1240,470);return t}

test('planRope swings a worm out of a deep pit onto the rim, and the replay lands there',()=>{
  const t=pit(),worms=[worm(t,0,0,1800),worm(t,1,1,1100)],state=makeState(t,worms,{active:1});
  assert.ok(worms[1].y>800);
  const [plan,ms]=timed(()=>planRope(state));
  assert.ok(plan,'expected a rope plan');assert.ok(ms<150,`planRope took ${ms.toFixed(0)} ms`);
  assert.ok(plan.gain>0);assert.ok([-1,1].includes(plan.swing));assert.equal(typeof plan.reel,'boolean');
  assert.ok(plan.releaseAt>=.3-1e-9&&plan.releaseAt<=2.4+1e-9);
  assert.ok(plan.landing.y<600&&(plan.landing.x<1000||plan.landing.x>=1360),`landing still in the pit: ${JSON.stringify(plan.landing)}`);
  assert.ok(wormGrounded(t,plan.landing.x,plan.landing.y));
  const end=replay(t,worms[1],plan);
  assert.ok(end.landed&&!end.drowned);
  assert.ok(Math.hypot(end.x-plan.landing.x,end.y-plan.landing.y)<40,`replay ${end.x.toFixed(1)},${end.y.toFixed(1)} vs plan ${plan.landing.x.toFixed(1)},${plan.landing.y.toFixed(1)}`);
});

test('executeRopeInputs holds the swing, reels for 0.5 s, releases on time',()=>{
  const plan={dirX:0,dirY:-1,swing:1,reel:true,releaseAt:1.2};
  assert.deepEqual(executeRopeInputs(plan,0),{left:false,right:true,up:true,down:false,release:false});
  assert.deepEqual(executeRopeInputs(plan,.6),{left:false,right:true,up:false,down:false,release:false});
  assert.equal(executeRopeInputs(plan,1.2).release,true);
  assert.deepEqual(executeRopeInputs({...plan,swing:-1,reel:false},.1),{left:true,right:false,up:false,down:false,release:false});
});

test('planRope returns null when nothing is gained (open flat ground near the enemy)',()=>{
  const t=shaped(()=>700),worms=[worm(t,0,0,1200),worm(t,1,1,1000)];
  assert.equal(planRope(makeState(t,worms,{active:1})),null);
});

test('real maps: every plan stays dry and fast',()=>{
  for(let map=0;map<3;map++){
    const t=createTerrain(map,42),spots=spawnSpots(t,42);
    const worms=spots.map((s,i)=>({id:i,team:i%2,name:'w'+i,x:s.x,y:s.y,hp:i%2?35:100,alive:true,grounded:true}));
    const crates=[{kind:'crate',x:spots[2].x+300,y:groundY(t,spots[2].x+300)-12},{kind:'crate',x:spots[5].x-150,y:groundY(t,spots[5].x-150)-12}];
    const mines=[{kind:'mine',x:spots[0].x+500,y:groundY(t,spots[0].x+500)-8}];
    for(let diff=0;diff<3;diff++)for(const active of [1,3,5]){
      const state=makeState(t,worms,{active,difficulty:diff,wind:diff*15-15,props:[...crates,...mines]});
      const [tp,t1]=timed(()=>planTeleport(state));
      const [cr,t2]=timed(()=>planCrate(state));
      const [rp,t3]=timed(()=>planRope(state));
      const where=`map ${map}, diff ${diff}, worm ${active}`;
      assert.ok(t1<150,`${where}: planTeleport ${t1.toFixed(0)} ms`);
      assert.ok(t2<150,`${where}: planCrate ${t2.toFixed(0)} ms`);
      assert.ok(t3<150,`${where}: planRope ${t3.toFixed(0)} ms`);
      if(tp){assert.ok(tp.y+R<WATER-90,where);assert.ok(wormFits(t,tp.x,tp.y),where)}
      if(cr?.how==='teleport'){assert.ok(cr.y<WATER-40,where);assert.ok(wormFits(t,cr.x,cr.y),where)}
      if(cr?.how==='walk')assert.ok(groundY(t,cr.x)<WATER-40,where);
      if(rp){assert.ok(rp.landing.y+R<WATER-60,where);const end=replay(t,state.active,rp);assert.ok(end.landed&&!end.drowned,where);assert.ok(Math.hypot(end.x-rp.landing.x,end.y-rp.landing.y)<40,where)}
    }
  }
});
