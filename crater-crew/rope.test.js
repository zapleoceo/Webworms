import test from 'node:test';
import assert from 'node:assert/strict';
import {W,H,R,WATER,createTerrain,spawnSpots,solid,wormFits,groundY,seeded} from './engine.js';
import {fireRope,stepRope,releaseRope,ropePoints,ropePathLength,ROPE} from './rope.js';

const DT=1/60;
// Empty world with solid rectangles [x0,y0,x1,y1].
function boxes(rects){
  const t=createTerrain(0,1);t.mask.fill(0);
  for(const [x0,y0,x1,y1] of rects)for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)t.mask[y*W+x]=1;
  for(let x=0;x<W;x++){let y=0;while(y<H&&!t.mask[y*W+x])y++;t.top[x]=y}
  return t;
}
const CEILING=[600,500,1800,540],FLOOR=[0,1300,W,H];
function attachTo(t,w,dx,dy,opts){const rope=fireRope(t,w,dx,dy,opts);for(let i=0;i<200&&rope.state==='flying';i++)stepRope(t,w,rope,DT,{});return rope}
function finite(w){return [w.x,w.y,w.vx,w.vy].every(Number.isFinite)}
// The drawn rope must not run through rock: a grazing pixel is tolerated, 4+ px of solid in a row is a cut.
function ropeClear(t,w,rope){
  const p=ropePoints(w,rope);
  for(let i=0;i+1<p.length;i++){const d=Math.hypot(p[i+1].x-p[i].x,p[i+1].y-p[i].y);let run=0;
    for(let s=4;s<d-4;s++)if(!solid(t,p[i].x+(p[i+1].x-p[i].x)*s/d,p[i].y+(p[i+1].y-p[i].y)*s/d))run=0;else if(++run>=4)return false}
  return true;
}

test('hook attaches under an overhang and misses into open sky',()=>{
  const t=boxes([CEILING,FLOOR]),w={x:1200,y:800,vx:0,vy:0};
  const rope=attachTo(t,w,0,-1);
  assert.equal(rope.state,'attached');
  assert.ok(rope.anchor.y>=537&&rope.anchor.y<544,`anchor ${rope.anchor.y}`);
  assert.equal(solid(t,rope.anchor.x,rope.anchor.y),false);
  assert.ok(Math.abs(rope.len-(800-rope.anchor.y))<1);
  const sky={x:300,y:800,vx:0,vy:0},miss=attachTo(t,sky,1,-1);
  assert.equal(miss.state,'missed');
  assert.ok(Math.hypot(miss.hx-(300+18/Math.SQRT2),miss.hy-(794-18/Math.SQRT2))<=ROPE.step+520);
  // Leaving the world counts as a miss too.
  assert.equal(attachTo(t,{x:30,y:800,vx:0,vy:0},-1,0,{maxLen:2000}).state,'missed');
});

test('attached worm swings through the anchor and stays within the rope',()=>{
  const t=boxes([CEILING,FLOOR]),w={x:1050,y:800,vx:0,vy:0};
  const rope=attachTo(t,w,150,-260);assert.equal(rope.state,'attached');
  let lo=0,hi=0;
  for(let i=0;i<240;i++){
    stepRope(t,w,rope,DT,{});const dx=w.x-rope.anchor.x;lo=Math.min(lo,dx);hi=Math.max(hi,dx);
    assert.ok(finite(w));assert.ok(ropePathLength(w,rope)<=rope.len+1);assert.ok(wormFits(t,w.x,w.y));
  }
  assert.ok(lo<-100&&hi>100,`swing ${lo}..${hi}`);
});

test('up reels in to the minimum, down pays out to maxLen',()=>{
  const t=boxes([CEILING,FLOOR]),w={x:1200,y:800,vx:0,vy:0},rope=attachTo(t,w,0,-1),l0=rope.len;
  for(let i=0;i<60;i++)stepRope(t,w,rope,DT,{up:true});
  assert.ok(l0-rope.len>170&&l0-rope.len<=181,`reel 1 s: ${l0-rope.len}`);
  for(let i=0;i<180;i++){stepRope(t,w,rope,DT,{up:true});assert.ok(wormFits(t,w.x,w.y))}
  assert.equal(rope.len,ROPE.minLen);assert.ok(ropePathLength(w,rope)<=rope.len+1);
  for(let i=0;i<240;i++)stepRope(t,w,rope,DT,{down:true});
  assert.equal(rope.len,rope.maxLen);
  for(let i=0;i<120;i++)stepRope(t,w,rope,DT,{});
  assert.ok(Math.abs(w.y-rope.anchor.y-rope.maxLen)<2,`hangs at ${w.y-rope.anchor.y}`);
});

test('release keeps the swing velocity, capped',()=>{
  const t=boxes([CEILING,FLOOR]),w={x:1200,y:800,vx:0,vy:0},rope=attachTo(t,w,0,-1);
  w.vx=300;w.vy=-200;releaseRope(w,rope);
  assert.equal(rope.state,'released');assert.equal(w.vx,300);assert.equal(w.vy,-200);
  const fast={x:0,y:0,vx:1000,vy:-1000};releaseRope(fast,{state:'attached',pivots:[]});
  assert.ok(Math.abs(Math.hypot(fast.vx,fast.vy)-ROPE.releaseCap)<1e-9);assert.ok(Math.abs(fast.vx+fast.vy)<1e-9);
});

test('rope wraps around a block and unwinds when swinging back',()=>{
  const t=boxes([CEILING,FLOOR,[1250,700,1290,760]]),a=Math.PI*40/180;
  const w={x:1200-300*Math.sin(a),y:541+300*Math.cos(a),vx:0,vy:0};
  const rope=attachTo(t,w,1200-w.x,541-w.y),len0=rope.len;assert.equal(rope.state,'attached');
  let wrapped=null,unwound=false,maxPiv=0;
  for(let i=0;i<480;i++){
    stepRope(t,w,rope,DT,{});maxPiv=Math.max(maxPiv,rope.pivots.length);
    if(rope.pivots.length&&!wrapped)wrapped={...rope.pivots[0]};
    if(wrapped&&!rope.pivots.length)unwound=true;
    assert.ok(finite(w));assert.ok(wormFits(t,w.x,w.y));
    assert.ok(ropePathLength(w,rope)<=rope.len+1);assert.ok(ropeClear(t,w,rope),`rope cuts rock at frame ${i}`);
  }
  assert.ok(wrapped,'never wrapped');
  // The rope rotates about the anchor above, so it first touches the block's lower-left corner.
  assert.ok(Math.hypot(wrapped.x-1248,wrapped.y-761)<5,`pivot at ${wrapped.x},${wrapped.y}`);
  assert.ok(unwound,'never unwound');assert.equal(maxPiv,1);
  assert.ok(Math.abs(rope.len-len0)<1,`length kept: ${len0} -> ${rope.len}`);
});

test('no input for 30 s: speed stays bounded by the drop height',()=>{
  const t=boxes([CEILING,FLOOR]),a=Math.PI*80/180;
  const w={x:1200-300*Math.sin(a),y:541+300*Math.cos(a),vx:0,vy:0};
  const rope=attachTo(t,w,1200-w.x,541-w.y);assert.equal(rope.state,'attached');
  const vmax=Math.sqrt(2*620*(rope.anchor.y+rope.len-w.y));let top=0,late=0;
  for(let i=0;i<1800;i++){stepRope(t,w,rope,DT,{});assert.ok(finite(w));const s=Math.hypot(w.vx,w.vy);top=Math.max(top,s);if(i>1500)late=Math.max(late,s)}
  assert.ok(top<=vmax*1.03+5,`top ${top} vs ${vmax}`);assert.ok(late<=top);
});

test('fuzz: random swinging on real maps never leaves the worm inside terrain',()=>{
  const stats={frames:0,drowned:0,attached:0,moving:0,topSpeed:0,cuts:0,fires:0,misses:0,maxPivots:0,wraps:0};
  for(let map=0;map<3;map++)for(const seed of [7,42]){
    const t=createTerrain(map,seed),spots=spawnSpots(t,seed),rand=seeded(seed*31+map);
    let k=0,w=null,rope=null,input={},life=0;
    // Alternate spawn spots with random free points up to 250 px above the ground (caves, overhangs).
    const respawn=()=>{rope=null;if(k++%2===0){const s=spots[k%spots.length];w={x:s.x,y:s.y,vx:0,vy:0};return}
      for(;;){const x=R+20+rand()*(W-2*R-40),y=groundY(t,x)-R-1-rand()*250;if(y>R&&wormFits(t,x,y)){w={x,y,vx:0,vy:0};return}}};
    respawn();
    for(let f=0;f<6000;f++){
      stats.frames++;
      if(!rope){const a=rand()<.75?-Math.PI*rand():rand()*Math.PI*2;rope=fireRope(t,w,Math.cos(a),Math.sin(a));stats.fires++;life=120+Math.floor(rand()*360)}
      if(f%15===0)input={left:rand()<.35,right:rand()<.35,up:rand()<.4,down:rand()<.15};
      const before=rope.pivots.length,state=stepRope(t,w,rope,DT,input);
      if(state==='missed'){stats.misses++;if(stats.misses%3===0)respawn();else rope=null;continue}
      if(state!=='attached')continue;
      if(w.y>WATER){stats.drowned++;respawn();continue}
      stats.attached++;const sp=Math.hypot(w.vx,w.vy);if(sp>60)stats.moving++;stats.topSpeed=Math.max(stats.topSpeed,Math.round(sp));if(!ropeClear(t,w,rope))stats.cuts++;if(rope.pivots.length>before)stats.wraps++;stats.maxPivots=Math.max(stats.maxPivots,rope.pivots.length);
      assert.ok(finite(w),`map ${map} seed ${seed} frame ${f} NaN`);
      assert.ok(wormFits(t,w.x,w.y),`map ${map} seed ${seed} frame ${f} inside terrain at ${w.x},${w.y}`);
      assert.ok(ropePathLength(w,rope)<=rope.len+1,`map ${map} frame ${f} overstretched`);
      assert.ok(rope.len<=rope.maxLen+1&&rope.pivots.length<=ROPE.maxPivots);
      if(--life<=0){releaseRope(w,rope);assert.ok(Math.hypot(w.vx,w.vy)<=ROPE.releaseCap+1e-9);respawn()}
    }
  }
  console.log('rope fuzz',JSON.stringify(stats));
  assert.ok(stats.attached>stats.frames/3,'too few attached frames');assert.ok(stats.moving>stats.attached/10,'too little swinging');
  assert.ok(stats.wraps>20,'too few wraps');assert.equal(stats.cuts,0,'rope cut through rock');
});
