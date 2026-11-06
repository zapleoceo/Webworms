// Seed sweep over every map: how much of the width is open sea, how steep the walkable surface is,
// where a worm walking the whole map gets stuck, and how safe the spawn points are.
// CLI: node map-stats.mjs [seeds]   (map-quality.test.js runs the same numbers)
import {pathToFileURL} from 'node:url';
import * as E from './engine.js';
const {createTerrain,spawnSpots,groundY,solid,crawl,wormFits,wormGrounded,wormDrowned,R}=E;
export const sweepSeed=s=>1000+s*7919;
// Sea column: nothing solid just under the waterline, so open water shows there (a worm walking in soon goes under).
export const wetColumns=t=>{const wet=new Uint8Array(E.W);for(let x=0;x<E.W;x++)wet[x]=solid(t,x,E.WATER-12)?0:1;return wet};
// Walk a worm from the left shore to the right one with crawl(): count walls that need a jump and
// drops into the sea (bridges and arches count as ground, so a channel with a bridge costs nothing).
export function walkAcross(t,wet){
 let x=0;while(x<E.W&&wet[x])x++;const w={x:x+20,y:groundY(t,x+20)-R-1};let walls=0,swims=0,guard=0;
 const settle=()=>{for(let k=0;k<E.H&&wormFits(t,w.x,w.y+1)&&!wormGrounded(t,w.x,w.y);k++)w.y++};
 while(w.x<E.W-40&&guard++<E.W*2){
  const st=crawl(t,w,1,8);w.climbDebt=0;
  if(st==='fell')settle();
  // Same rule as the game: a worm drowns once the water closes over it.
  if(wormDrowned(w,E.WATER)){swims++;let nx=w.x;while(nx<E.W&&wet[nx])nx++;if(nx>=E.W-40)break;w.x=nx+10;w.y=groundY(t,w.x)-R-1;continue}
  if(st==='blocked'){walls++;w.x+=12;w.y=groundY(t,w.x)-R-1;settle()}
 }
 return {walls,swims};
}
export function mapStats(map,seeds=40){
 let water=0,cols=0,steep=0,land=0,minDist=Infinity,maxSpawnSlope=0,sumDist=0,ns=0,missing=0,seas=0,unstable=0,walls=0,swims=0;const slopes=[];
 for(let s=0;s<seeds;s++){
  const seed=sweepSeed(s),t=createTerrain(map,seed),W=E.W,wet=wetColumns(t);
  let dry=0;for(let x=0;x<W;x++){cols++;if(wet[x]){water++;if(x>0&&dry>=30&&x<W-1)seas++;dry=0}else dry++}
  // Surface grade over 16 px on dry columns; overhangs (floating rock, bridges) are skipped by requiring solid ground 60 px down,
  // and the deliberate cliffs (tunnel mesas, canyon walls under their bridges) are left out.
  const feature=x=>t.features?.some(f=>(f.kind==='tunnel'||f.kind==='bridge')&&x>=f.x0-24&&x<=f.x1+24);
  for(let x=0;x+16<W;x+=4){if(wet[x]||wet[x+16]||feature(x)||feature(x+16))continue;const a=groundY(t,x),b=groundY(t,x+16);if(!solid(t,x,a+60)||!solid(t,x+16,b+60))continue;land++;const sl=Math.abs(b-a)/16;slopes.push(sl);if(sl>1)steep++}
  const walk=walkAcross(t,wet);walls+=walk.walls;swims+=walk.swims;
  const spots=spawnSpots(t,seed);missing+=Math.max(0,6-spots.length);
  for(const sp of spots){let d=W;for(let x=0;x<W;x++)if(wet[x])d=Math.min(d,Math.abs(x-sp.x));minDist=Math.min(minDist,d);sumDist+=d;ns++;
   maxSpawnSlope=Math.max(maxSpawnSlope,Math.abs(groundY(t,sp.x+20)-groundY(t,sp.x-20))/40);
   if(!wormFits(t,sp.x,sp.y)||!wormGrounded(t,sp.x,sp.y+1))unstable++}
 }
 slopes.sort((a,b)=>a-b);
 return {map,waterPct:+(100*water/cols).toFixed(1),seas:+(seas/seeds).toFixed(2),steepPct:+(100*steep/Math.max(1,land)).toFixed(2),p99Slope:+slopes[Math.floor(slopes.length*.99)].toFixed(2),wallsPerWalk:+(walls/seeds).toFixed(2),swimsPerWalk:+(swims/seeds).toFixed(2),minSpawnDist:minDist,avgSpawnDist:Math.round(sumDist/Math.max(1,ns)),maxSpawnSlope:+maxSpawnSlope.toFixed(2),missing,unstable};
}
if(import.meta.url===pathToFileURL(process.argv[1]).href){const n=Number(process.argv[2]||40);console.table([0,1,2,3].map(m=>mapStats(m,n)))}
