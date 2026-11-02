import test from 'node:test';
import assert from 'node:assert/strict';
import {W,H,WATER,createTerrain,solid,carve,groundY,blastDamage,trajectory,selectShot} from './engine.js';

test('all maps form solid, varying islands above water',()=>{
 for(let map=0;map<3;map++){
  const t=createTerrain(map,42);
  assert.equal(t.mask.length,W*H);
  for(const x of [170,340,730,780,1270,1450]){
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

