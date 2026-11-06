// Playability guarantees for every map over many seeds: little open sea, walkable slopes,
// every channel crossable on foot, and spawns on level ground far from the water.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from './engine.js';
import {sweepSeed,wetColumns,walkAcross,mapStats} from './map-stats.mjs';
const {createTerrain,spawnSpots,groundY,solid,wormFits,wormGrounded,R,MAX_GRADE,CLIMB_RATE}=E;
const SEEDS=24;
// Wet runs closer than 30 px are one body of water (beach ripples flicker at the waterline).
function seas(wet){const runs=[];for(let x=0;x<wet.length;x++)if(wet[x]){const last=runs.at(-1);if(last&&x-last[1]<30)last[1]=x;else runs.push([x,x])}return runs}

test('maps keep the sea narrow: at most two channels plus the shores at the map ends',()=>{
 for(let map=0;map<4;map++)for(let s=0;s<SEEDS;s++){
  const seed=sweepSeed(s),t=createTerrain(map,seed),wet=wetColumns(t),runs=seas(wet),W=E.W;
  const pct=wet.reduce((a,b)=>a+b,0)/W*100;assert.ok(pct<=14,`map ${map} seed ${seed}: ${pct.toFixed(1)}% open sea`);
  const inland=runs.filter(([a,b])=>a>0&&b<W-1);assert.ok(inland.length<=2,`map ${map} seed ${seed}: ${inland.length} channels`);
  for(const [a,b] of inland)assert.ok(b-a<=260,`map ${map} seed ${seed}: channel ${a}..${b} too wide`);
 }
});

test('the generated surface stays within the crawl budget and every channel has a bridge',()=>{
 assert.ok(MAX_GRADE<CLIMB_RATE/3,'ramps are far gentler than the steepest crawl');
 for(let map=0;map<4;map++){
  for(let s=0;s<SEEDS;s++){
   const seed=sweepSeed(s),t=createTerrain(map,seed),wet=wetColumns(t),walk=walkAcross(t,wet);
   // A worm walking the whole map only meets deliberate features (mesa cliffs, canyon lips) and only reaches the sea at the far end.
   assert.ok(walk.walls<=3,`map ${map} seed ${seed}: ${walk.walls} walls on the walk`);
   assert.equal(walk.swims,1,`map ${map} seed ${seed}: a channel without a bridge`);
  }
  const st=mapStats(map,SEEDS);
  assert.ok(st.steepPct<=3,`map ${map}: ${st.steepPct}% of the land steeper than 45 degrees`);
  assert.ok(st.p99Slope<=1.5,`map ${map}: p99 grade ${st.p99Slope}`);
 }
});

test('spawns sit on level, solid ground well above the sea and far from any water',()=>{
 for(let map=0;map<4;map++)for(let s=0;s<SEEDS;s++){
  const seed=sweepSeed(s),t=createTerrain(map,seed),wet=wetColumns(t),spots=spawnSpots(t,seed);
  assert.equal(spots.length,6,`map ${map} seed ${seed}`);
  for(const {x,y} of spots){
   let d=Infinity;for(let i=0;i<wet.length;i++)if(wet[i])d=Math.min(d,Math.abs(i-x));
   assert.ok(d>=150,`map ${map} seed ${seed}: spawn ${x} is ${d}px from water`);
   assert.ok(groundY(t,x)<E.WATER-90,`map ${map} seed ${seed}: spawn ${x} too low`);
   assert.ok(Math.abs(groundY(t,x+20)-groundY(t,x-20))<=14,`map ${map} seed ${seed}: spawn ${x} on a slope`);
   assert.ok(wormFits(t,x,y)&&wormGrounded(t,x,y+1)&&solid(t,x,groundY(t,x)+30),`map ${map} seed ${seed}: spawn ${x} not on solid ground`);
  }
  for(let i=1;i<spots.length;i++)assert.ok(spots[i].x-spots[i-1].x>=40,`map ${map} seed ${seed}: spawns overlap`);
 }
});

test('generation is deterministic per seed and lists its set pieces',()=>{
 for(let map=0;map<4;map++){
  const a=createTerrain(map,777),b=createTerrain(map,777);
  assert.deepEqual(a.top,b.top);assert.deepEqual(a.features,b.features);
  assert.ok(a.features.some(f=>f.kind==='landmark'),`map ${map} has a landmark`);
  assert.ok(a.features.some(f=>f.kind==='bridge'),`map ${map} has a bridge or arch`);
  assert.ok(createTerrain(map,778).top.some((v,i)=>v!==a.top[i]),'seeds differ');
 }
});
