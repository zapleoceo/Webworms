import test from 'node:test';
import assert from 'node:assert/strict';
import {W,H,R,WATER,createTerrain,spawnSpots,solid,carve,groundY,blastDamage,trajectory,selectShot,stepBody,underwater,crawl,wormFits,BODIES,BODY_STEP} from './engine.js';

// A flat island with an optional profile: top(x) gives the surface height of each column.
function shaped(top){const t=createTerrain(0,1);for(let x=0;x<W;x++){t.top[x]=Math.floor(top(x));for(let y=0;y<H;y++)t.mask[y*W+x]=y>=t.top[x]?1:0}return t}

test('all maps form solid, varying islands above water',()=>{
 for(let map=0;map<3;map++){
  const t=createTerrain(map,42);
  assert.equal(t.mask.length,W*H);
  // Spawns are no longer fixed columns: check the six spots newGame() actually uses.
  const spots=spawnSpots(t,42);assert.equal(spots.length,6,`map ${map} spots`);
  for(const {x} of spots){
   assert.ok(groundY(t,x)<WATER-20,`map ${map}, spawn ${x}`);
   assert.equal(solid(t,x,groundY(t,x)+2),true);
   assert.equal(solid(t,x,groundY(t,x)-2),false);
  }
 }
});
test('blast removes solid pixels and leaves other terrain intact',()=>{
 const t=createTerrain(0,42),x=550,y=groundY(t,550)+20;
 assert.ok(solid(t,x,y));const other=solid(t,1000,700);
 carve(t,x,y,50);assert.equal(solid(t,x,y),false);assert.equal(solid(t,1000,700),other);
});
test('damage decreases with distance and stops at blast edge',()=>{
 assert.equal(blastDamage(0,80,60),60);
 assert.ok(blastDamage(40,80,60)>0);
 assert.equal(blastDamage(80,80,60),0);
});
test('ballistic shot hits terrain and AI can find shots on every map',()=>{
 for(let map=0;map<3;map++){
  const t=createTerrain(map,42),from={x:1270,y:groundY(t,1270)-17},targets=[170,340,570].map(x=>({x,y:groundY(t,x)-17}));
  const shot=selectShot(t,from,targets,[from],10,1);
  assert.ok(shot?.score>20,`map ${map} AI score`);
  const speed=370+390*shot.power,rad=shot.angle*Math.PI/180;
  const end=trajectory(t,from.x+shot.dir*Math.cos(rad)*24,from.y-9+Math.sin(rad)*22,shot.dir*Math.cos(rad)*speed,Math.sin(rad)*speed,10);
  assert.ok(end.hit);assert.ok(Math.abs(end.x-shot.end.x)<2);
 }
});


test('worms crawl up a 1:2 ramp with feet on the ground, but not up a wall',()=>{
 const ramp=shaped(x=>x<700?600:x<900?600-(x-700)*.5:500),w={x:650,y:600-R-1};
 for(let i=0;i<200;i++)crawl(ramp,w,1,95/40);
 assert.ok(w.x>1100,`reached ${w.x}`);assert.ok(Math.abs(w.y+R-groundY(ramp,w.x))<=1);
 const wall=shaped(x=>x>=900&&x<960?300:600),v={x:850,y:600-R-1};
 for(let i=0;i<200;i++)crawl(wall,v,1,95/40);
 assert.ok(v.x<900-8,`passed into the wall at ${v.x}`);assert.ok(wormFits(wall,v.x,v.y));
});

test('a grenade thrown into a wall bounces back and settles instead of tunnelling up',()=>{
 const t=shaped(x=>x>=900&&x<960?300:600),g={x:820,y:560,vx:520,vy:-80,r:8};let minY=g.y,maxX=g.x;
 for(let i=0;i<60*6;i++){stepBody(t,g,1/60,{body:BODIES.grenadeHigh});minY=Math.min(minY,g.y);maxX=Math.max(maxX,g.x)}
 assert.ok(maxX<900,`entered the wall at x=${maxX}`);assert.ok(minY>450,`climbed to y=${minY}`);
 assert.equal(g.resting,true);assert.ok(Math.abs(g.y+g.r-600)<=2);
});

test('the AI grenade forecast matches live flight at any frame rate',()=>{
 const t=createTerrain(0,4242);
 for(const a of [-60,-25,15])for(const p of [.4,1]){
  const th=a*Math.PI/180,s=300+280*p,x=500,y=groundY(t,500)-30,f=trajectory(t,x,y,Math.cos(th)*s,Math.sin(th)*s,0,{fuse:3,bounce:true});
  // Same throw with the sea switched off: the whole 3 s flight path (bounces included) must agree.
  const full=trajectory(t,x,y,Math.cos(th)*s,Math.sin(th)*s,0,{fuse:3,bounce:true,water:Infinity});
  for(const dt of [1/144,1/60,.04]){const b={x,y,vx:Math.cos(th)*s,vy:Math.sin(th)*s,r:8},c={...b};let time=0;
   // The game passes the water level to stepBody exactly like the forecast does, so a throw that ends
   // in a sea channel sinks at the same body step in both: same splash point at any frame rate.
   while(time<3-1e-9&&!b.sunk){stepBody(t,b,dt,{water:WATER});time+=dt}
   assert.equal(Boolean(b.sunk),underwater(f.y,8,WATER),`drowns in both or neither: angle ${a}, power ${p}, dt ${dt}`);
   assert.ok(Math.hypot(b.x-f.x,b.y-f.y)<6,`angle ${a}, power ${p}, dt ${dt}: live (${b.x.toFixed(1)},${b.y.toFixed(1)}) forecast (${f.x.toFixed(1)},${f.y.toFixed(1)})`);
   let ct=0;while(ct<3-1e-9){stepBody(t,c,dt);ct+=dt}
   assert.ok(Math.hypot(c.x-full.x,c.y-full.y)<6,`no-water path: angle ${a}, power ${p}, dt ${dt}`)}
 }
});
