// ---- Grappling rope: a flying hook, then a pendulum that wraps around terrain corners. ----
// The worm is a point body {x,y,vx,vy} colliding through wormFits; the rope keeps a total length budget
// shared by the fixed segments anchor -> pivots and the free segment from the last pivot to the worm.
import {W,H,R,GRAVITY,solid,wormFits,clamp} from './engine.js';

export const ROPE={swing:650,reel:180,minLen:24,maxPivots:12,step:3,maxSpeed:1100,releaseCap:700};
// Line checks skip a few px at both ends: pivots hug rock by design, the worm end sits inside its body.
const SAMPLE=1.5,END_SKIP=3;

export function fireRope(t,w,dirX,dirY,{maxLen=520,speed=1400}={}){
  const l=Math.hypot(dirX,dirY)||1,dx=dirX/l,dy=dirY/l;
  // fx,fy trails the hook as the last free point: it becomes the anchor on a hit.
  return {state:'flying',dx,dy,maxLen,speed,hx:w.x+dx*18,hy:w.y-6+dy*18,fx:w.x,fy:w.y-6,travel:0,anchor:null,pivots:[],len:0,fixed:0};
}

export function stepRope(t,w,rope,dt,input={}){
  if(rope.state==='flying')fly(t,w,rope,dt);
  else if(rope.state==='attached')swing(t,w,rope,dt,input);
  return rope.state;
}

export function releaseRope(w,rope){
  const s=Math.hypot(w.vx,w.vy);if(s>ROPE.releaseCap){w.vx*=ROPE.releaseCap/s;w.vy*=ROPE.releaseCap/s}
  rope.state='released';rope.pivots=[];rope.fixed=0;return rope;
}

export function ropePoints(w,rope){
  const pts=[{x:w.x,y:w.y}];
  if(rope.state==='flying')pts.push({x:rope.hx,y:rope.hy});
  else if(rope.state==='attached'){for(let i=rope.pivots.length-1;i>=0;i--)pts.push({x:rope.pivots[i].x,y:rope.pivots[i].y});pts.push({...rope.anchor})}
  return pts;
}

// Rope path length worm -> anchor, i.e. what must stay within rope.len.
export function ropePathLength(w,rope){const p=pivotOf(rope);return rope.fixed+Math.hypot(w.x-p.x,w.y-p.y)}

function pivotOf(rope){return rope.pivots.length?rope.pivots[rope.pivots.length-1]:rope.anchor}

function fly(t,w,rope,dt){
  let left=rope.speed*dt;
  for(;;){
    if(rope.hx<0||rope.hx>=W||rope.hy<0||rope.hy>=H){rope.state='missed';return}
    if(solid(t,rope.hx,rope.hy)){attach(t,w,rope);return}
    if(rope.travel>=rope.maxLen){rope.state='missed';return}
    if(left<=0)return;
    const s=Math.min(ROPE.step,left,rope.maxLen-rope.travel+1e-6);
    rope.fx=rope.hx;rope.fy=rope.hy;rope.hx+=rope.dx*s;rope.hy+=rope.dy*s;rope.travel+=s;left-=s;
  }
}
function attach(t,w,rope){
  rope.state='attached';rope.anchor={x:rope.fx,y:rope.fy};rope.pivots=[];rope.fixed=0;
  rope.len=clamp(Math.hypot(w.x-rope.fx,w.y-rope.fy),ROPE.minLen,rope.maxLen);
  // The hook flew from the worm's shoulder, so the line to its centre may still clip rock.
  wrap(t,w,rope,w.x,w.y);settle(t,w,rope);
}

// Distance from a to the first solid sample towards b, or -1 if clear.
function firstHit(t,ax,ay,bx,by){
  const d=Math.hypot(bx-ax,by-ay);if(d<1e-9)return -1;
  const ex=(bx-ax)/d,ey=(by-ay)/d;
  for(let s=END_SKIP*SAMPLE;s<d-END_SKIP;s+=SAMPLE)if(solid(t,ax+ex*s,ay+ey*s))return s;
  return -1;
}

function swing(t,w,rope,dt,input){
  const dir=(input.right?1:0)-(input.left?1:0),reel=(input.down?1:0)-(input.up?1:0);
  const n=Math.max(1,Math.ceil((Math.hypot(w.vx,w.vy)+(GRAVITY+ROPE.swing)*dt+ROPE.reel)*dt/ROPE.step)),h=dt/n;
  for(let i=0;i<n;i++){
    const p=pivotOf(rope);let ux=w.x-p.x,uy=w.y-p.y;const r=Math.hypot(ux,uy);
    if(r>1e-6){ux/=r;uy/=r}else{ux=0;uy=1}
    // Tangent oriented so 'right' pushes towards +x.
    let tx=-uy,ty=ux;if(tx<0||(tx===0&&ty<0)){tx=-tx;ty=-ty}
    w.vy+=GRAVITY*h;if(dir){w.vx+=tx*dir*ROPE.swing*h;w.vy+=ty*dir*ROPE.swing*h}
    if(reel>0&&rope.len<rope.maxLen)rope.len=Math.min(rope.maxLen,rope.len+ROPE.reel*h);
    if(reel<0)rope.len=Math.max(Math.min(rope.len,rope.fixed+ROPE.minLen),rope.len-ROPE.reel*h);
    const s=Math.hypot(w.vx,w.vy);if(s>ROPE.maxSpeed){w.vx*=ROPE.maxSpeed/s;w.vy*=ROPE.maxSpeed/s}
    const ox=w.x,oy=w.y;
    move(t,w,rope,h);
    unwrap(t,w,rope);
    wrap(t,w,rope,ox,oy);
    settle(t,w,rope);
    if(!Number.isFinite(w.x+w.y+w.vx+w.vy)){w.x=ox;w.y=oy;w.vx=0;w.vy=0}
  }
}

// A blocked reel-in or a fresh pivot may leave the worm beyond the budget: pull it in if it fits, else give slack.
function settle(t,w,rope){
  const q=pivotOf(rope),d=Math.hypot(w.x-q.x,w.y-q.y);
  if(d>rope.len-rope.fixed){const c=project(rope,w.x,w.y);if(wormFits(t,c.x,c.y)){w.x=c.x;w.y=c.y}else rope.len=rope.fixed+d}
}
function project(rope,x,y){
  const p=pivotOf(rope),free=Math.max(0,rope.len-rope.fixed),dx=x-p.x,dy=y-p.y,d=Math.hypot(dx,dy);
  return d>free&&d>1e-9?{x:p.x+dx/d*free,y:p.y+dy/d*free}:{x,y};
}
// Taut rope: drop the outward radial velocity, keep the tangential part.
function dropRadial(w,rope){
  const p=pivotOf(rope),dx=w.x-p.x,dy=w.y-p.y,d=Math.hypot(dx,dy);
  if(d<1e-9||d<rope.len-rope.fixed-.5)return;
  const vr=(w.vx*dx+w.vy*dy)/d;if(vr>0){w.vx-=dx/d*vr;w.vy-=dy/d*vr}
}
// Outward normal of whatever blocks the worm, from probes a few px around it.
function wormNormal(t,w){
  let nx=0,ny=0;
  for(let i=0;i<8;i++){const a=i*Math.PI/4,cx=Math.cos(a),cy=Math.sin(a);if(!wormFits(t,w.x+cx*3,w.y+cy*3)){nx-=cx;ny-=cy}}
  const l=Math.hypot(nx,ny);if(l>1e-6)return {x:nx/l,y:ny/l};
  const s=Math.hypot(w.vx,w.vy)||1;return {x:-w.vx/s,y:-w.vy/s};
}
function move(t,w,rope,h){
  dropRadial(w,rope);
  // A worm already stuck (terrain changed under it) may move anywhere to get out.
  const stuck=!wormFits(t,w.x,w.y);
  const at=(x,y)=>{const q=project(rope,clamp(x,R,W-R),y);return stuck||wormFits(t,q.x,q.y)?q:null};
  let q=at(w.x+w.vx*h,w.y+w.vy*h);
  if(!q){
    // Slide: cancel the velocity component into the surface.
    const nrm=wormNormal(t,w),vn=w.vx*nrm.x+w.vy*nrm.y;if(vn<0){w.vx-=nrm.x*vn;w.vy-=nrm.y*vn}
    q=at(w.x+w.vx*h,w.y+w.vy*h);
    if(!q&&(q=at(w.x+w.vx*h,w.y)))w.vy=0;
    if(!q&&(q=at(w.x,w.y+w.vy*h)))w.vx=0;
    if(!q){w.vx=0;w.vy=0;q=at(w.x,w.y)||{x:w.x,y:w.y}}
  }
  w.x=q.x;w.y=q.y;dropRadial(w,rope);
}

// The bend unwinds once the worm crosses back over the previous segment's line.
function unwrap(t,w,rope){
  while(rope.pivots.length){
    const p=rope.pivots[rope.pivots.length-1],a=rope.pivots.length>1?rope.pivots[rope.pivots.length-2]:rope.anchor;
    const c=(p.x-a.x)*(w.y-p.y)-(p.y-a.y)*(w.x-p.x);
    if(c*p.s>0||firstHit(t,a.x,a.y,w.x,w.y)>=0)break;
    rope.pivots.pop();rope.fixed-=Math.hypot(p.x-a.x,p.y-a.y);
  }
  if(!rope.pivots.length)rope.fixed=0;
}

// The free segment got blocked during the move from (sx,sy): bisect the sweep for the last clear line
// and bend the rope at the obstruction's corner, nudged off the rock towards the clear side.
function wrap(t,w,rope,sx,sy){
  while(rope.pivots.length<ROPE.maxPivots){
    const p=pivotOf(rope),hit=firstHit(t,p.x,p.y,w.x,w.y);if(hit<0)return;
    let np=null;
    if(firstHit(t,p.x,p.y,sx,sy)<0){
      let lo=0,hi=1;
      for(let k=0;k<14;k++){const m=(lo+hi)/2;if(firstHit(t,p.x,p.y,sx+(w.x-sx)*m,sy+(w.y-sy)*m)<0)lo=m;else hi=m}
      const lx=sx+(w.x-sx)*lo,ly=sy+(w.y-sy)*lo,bx=sx+(w.x-sx)*hi,by=sy+(w.y-sy)*hi;
      const dh=firstHit(t,p.x,p.y,bx,by),ll=Math.hypot(lx-p.x,ly-p.y);
      if(dh>=0&&ll>1e-6){
        const ex=(lx-p.x)/ll,ey=(ly-p.y)/ll,cx=p.x+ex*dh,cy=p.y+ey*dh;
        let nx=-ey,ny=ex;if(nx*(bx-lx)+ny*(by-ly)>0){nx=-nx;ny=-ny}
        // Prefer pushing straight off the corner (away from nearby rock), so the rope clears both faces.
        let ax=0,ay=0;for(let oy=-3;oy<=3;oy++)for(let ox=-3;ox<=3;ox++)if(solid(t,cx+ox,cy+oy)){ax-=ox;ay-=oy}
        const al=Math.hypot(ax,ay),dirs=al>1e-6?[[ax/al,ay/al],[nx,ny]]:[[nx,ny]];
        for(const [ux,uy] of dirs){for(const k of [2,1.5,1,0]){const qx=cx+ux*k,qy=cy+uy*k;if(!solid(t,qx,qy)&&firstHit(t,p.x,p.y,qx,qy)<0){np={x:qx,y:qy};break}}if(np)break}
      }
      sx=lx;sy=ly;
    }
    if(!np){const d=Math.hypot(w.x-p.x,w.y-p.y),k=(hit-SAMPLE)/d;np={x:p.x+(w.x-p.x)*k,y:p.y+(w.y-p.y)*k}}
    const seg=Math.hypot(np.x-p.x,np.y-p.y);if(seg<3)return;
    const c=(np.x-p.x)*(w.y-np.y)-(np.y-p.y)*(w.x-np.x);
    rope.pivots.push({x:np.x,y:np.y,s:c>=0?1:-1});rope.fixed+=seg;
  }
}
