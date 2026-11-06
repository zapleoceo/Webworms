export const W=1600,H=800,WATER=755,R=15,GRAVITY=620,WEAPONS=['bazooka','grenade','shotgun','dynamite','airstrike','punch','jetpack'];
export const AIM_MIN=-Math.PI/2+0.025,AIM_MAX=Math.PI/2-0.025;
export const AI_PROFILES=[
  {name:'EASY',angleStep:9,powerStep:.15,aimError:.18,airError:150,friendWeight:1.3,reposition:false,shotgunRange:115,grenadeThreshold:32},
  {name:'NORMAL',angleStep:5,powerStep:.10,aimError:.045,airError:48,friendWeight:1.7,reposition:true,shotgunRange:210,grenadeThreshold:22},
  {name:'HARD',angleStep:3,powerStep:.07,aimError:.008,airError:12,friendWeight:2.2,reposition:true,shotgunRange:260,grenadeThreshold:15}
];
export function aimAngle(dx,dy){return clamp(Math.atan2(dy,Math.abs(dx)),AIM_MIN,AIM_MAX)}
export const data={bazooka:{name:'BAZOOKA',short:'Wind-bent rocket',icon:'🚀',radius:77,damage:58},grenade:{name:'GRENADE',short:'Bounce + 3 s fuse',icon:'💣',radius:84,damage:66},shotgun:{name:'SHOTGUN',short:'Close-range spread',icon:'▰',radius:0,damage:10},dynamite:{name:'DYNAMITE',short:'Drop + 3 s fuse',icon:'🧨',radius:102,damage:82},airstrike:{name:'AIRSTRIKE',short:'Five wind-proof missiles',icon:'✈',radius:56,damage:40},punch:{name:'PUNCH',short:'Melee knockback',icon:'✊',radius:0,damage:30},jetpack:{name:'JETPACK',short:'Fly for 4 seconds',icon:'♨',radius:0,damage:0}};
export function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
export function seeded(seed){let x=seed>>>0;return()=>{x=(1664525*x+1013904223)>>>0;return x/4294967296}}
export function createTerrain(map=0,seed=1){
  const rand=seeded(seed),mask=new Uint8Array(W*H),top=new Int16Array(W);
  for(let x=0;x<W;x++){
    let y;
    if(map===0) y=510+58*Math.sin(x/143)+31*Math.sin(x/49)+17*Math.sin(x/23);
    else if(map===1) y=490+85*Math.sin(x/108)+29*Math.sin(x/33)+48*Math.sin(x/275);
    else y=515+42*Math.sin(x/211)+55*Math.sin(x/68)+18*Math.sin(x/21);
    // Fine, deterministic chips break up the sine-wave silhouette while
    // keeping the ground height stable enough for walking and aiming.
    y+=2*Math.sin(x*.45)+1.4*Math.sin(x*1.27)+(rand()-.5)*3;
    if(map===2 && ((x>365&&x<480)||(x>1030&&x<1165))) y=720;
    top[x]=Math.floor(clamp(y,330,735));
    for(let iy=top[x];iy<H;iy++)mask[iy*W+x]=1;
  }
  return {mask,top,map,seed};
}
export function solid(t,x,y){const ix=Math.floor(x),iy=Math.floor(y);return ix>=0&&ix<W&&iy>=0&&iy<H&&t.mask[iy*W+ix]===1}
export function carve(t,cx,cy,r){
  const x0=Math.max(0,Math.floor(cx-r)),x1=Math.min(W-1,Math.ceil(cx+r));
  const y0=Math.max(0,Math.floor(cy-r)),y1=Math.min(H-1,Math.ceil(cy+r));
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)if((x-cx)**2+(y-cy)**2<r*r)t.mask[y*W+x]=0;
  for(let x=x0;x<=x1;x++){let y=0;while(y<H&&!t.mask[y*W+x])y++;t.top[x]=y;}
}
export function groundY(t,x){return t.top[clamp(Math.floor(x),0,W-1)]}
export function blastDamage(distance,radius,max){return distance>=radius?0:Math.round(max*(1-distance/radius)**1.28)}
export function trajectory(t,x,y,vx,vy,wind,{fuse=8,bounce=false,exact=true,dt=1/40,water=WATER,body=BODIES.grenadeHigh,r=8}={}){
  // Bouncing ordnance runs the live body step, so the AI forecast and the real throw agree.
  if(bounce&&exact){const b={x,y,vx,vy,r};let time=0;while(time<fuse-1e-9&&b.y<=water){stepBody(t,b,BODY_STEP,{body});time+=BODY_STEP}return {x:b.x,y:b.y,time,hit:false}}
  let time=0, px=x,py=y,ax=vx,ay=vy,hit=false;
  while(time<fuse&&py<900){
    const nx=px+ax*dt,ny=py+ay*dt;
    ay+=GRAVITY*dt;ax+=wind*dt*0.7;time+=dt;
    if(nx<2||nx>W-2){if(!bounce)break;ax*=-.55;px=clamp(nx,2,W-2);py=ny;continue}
    if(solid(t,nx,ny)){
      if(!bounce){hit=true;break}
      ay=-Math.abs(ay)*.55;ax*=.72;py=ny-5;px=nx;continue;
    }
    px=nx;py=ny;
  }
  return {x:px,y:py,time,hit};
}
export function selectShot(t,from,targets,friends,wind,difficulty=1,water=WATER){
  const profile=AI_PROFILES[difficulty]??AI_PROFILES[1];let best=null;const angles=[];for(let a=-88;a<=88;a+=profile.angleStep)angles.push(a);
  for(const dir of [-1,1])for(const a of angles)for(let p=0.35;p<=1.001;p+=profile.powerStep){
    const theta=a*Math.PI/180;const speed=370+390*p;
    const vx=dir*Math.cos(theta)*speed,vy=Math.sin(theta)*speed;
    const end=trajectory(t,from.x+dir*Math.cos(theta)*24,from.y-9+Math.sin(theta)*22,vx,vy,wind);
    if(!end.hit||end.y>=water)continue;
    let score=-999;
    for(const target of targets){const d=Math.hypot(target.x-end.x,target.y-10-end.y),hurt=blastDamage(d,77,58);score=Math.max(score,hurt+(difficulty===2&&hurt>=target.hp?22:0));}
    for(const f of friends){const d=Math.hypot(f.x-end.x,f.y-10-end.y);score-=blastDamage(d,77,58)*profile.friendWeight;}
    score-=Math.abs(end.x-from.x)*.0001;
    if(!best||score>best.score)best={dir,angle:a,power:p,score,end};
  }
  return best;
}
export function selectLob(t,from,targets,friends,wind,difficulty=1,water=WATER){
  const profile=AI_PROFILES[difficulty]??AI_PROFILES[1],rough=[];let best=null;
  const lobScore=end=>{let score=-999;for(const target of targets){const hurt=blastDamage(Math.hypot(target.x-end.x,target.y-end.y),84,66);score=Math.max(score,hurt+(difficulty===2&&hurt>=target.hp?22:0))}for(const friend of friends)score-=blastDamage(Math.hypot(friend.x-end.x,friend.y-end.y),84,66)*profile.friendWeight;return score};
  for(const dir of [-1,1])for(let a=-88;a<=88;a+=profile.angleStep+1)for(let p=.35;p<=1.001;p+=profile.powerStep+.02){
    const theta=a*Math.PI/180,speed=300+280*p;
    const end=trajectory(t,from.x+dir*Math.cos(theta)*24,from.y-9+Math.sin(theta)*22,dir*Math.cos(theta)*speed,Math.sin(theta)*speed,0,{fuse:3,bounce:true,exact:false,water});
    if(end.y<water)rough.push({dir,angle:a,power:p,score:lobScore(end)});
  }
  // Bounces are chaotic, so the cheap sweep only shortlists; the live physics settles the pick.
  rough.sort((m,n)=>n.score-m.score);
  for(const c of rough.slice(0,12)){
    const theta=c.angle*Math.PI/180,speed=300+280*c.power;
    const end=trajectory(t,from.x+c.dir*Math.cos(theta)*24,from.y-9+Math.sin(theta)*22,c.dir*Math.cos(theta)*speed,Math.sin(theta)*speed,0,{fuse:3,bounce:true,water});
    if(end.y>=water)continue;
    const score=lobScore(end);if(!best||score>best.score)best={...c,score,end};
  }
  return best;
}


// ---- Body physics shared by live ordnance and AI prediction, so forecasts match real flight. ----
// Bodies are circles against the terrain mask: an impact reflects the normal velocity with
// restitution, a gentle contact keeps rolling along the surface, and a slow body on flat
// ground comes to rest until the soil under it is blown away.
export const BODIES={
  grenadeHigh:{restitution:.55,impactFriction:.82,rollDrag:.55},
  grenadeLow:{restitution:.32,impactFriction:.72,rollDrag:.9},
  dynamite:{restitution:.22,impactFriction:.45,rollDrag:5.5},
};
const RIM=Array.from({length:16},(_,i)=>[Math.cos(i*Math.PI/8),Math.sin(i*Math.PI/8)]);
export function overlaps(t,x,y,r){
  // Fast path: a circle wholly above the surface line of the columns it spans touches nothing.
  let top=H;for(let cx=Math.floor(x-r);cx<=x+r;cx+=4)top=Math.min(top,t.top[clamp(cx,0,W-1)]);top=Math.min(top,t.top[clamp(Math.floor(x+r),0,W-1)]);
  if(y+r<top)return false;
  if(solid(t,x,y))return true;for(let i=0;i<16;i+=2)if(solid(t,x+RIM[i][0]*r,y+RIM[i][1]*r))return true;return false}
export function contactNormal(t,x,y,r){
  let nx=0,ny=0,hits=0;
  for(const [cx,cy] of RIM)if(solid(t,x+cx*(r+1.5),y+cy*(r+1.5))){nx-=cx;ny-=cy;hits++}
  const len=Math.hypot(nx,ny);return hits&&len>1e-6?{x:nx/len,y:ny/len}:{x:0,y:-1};
}
// Fixed-step integration: the same sequence of steps runs at any frame rate and in the forecast.
export const BODY_STEP=1/120;
export function stepBody(t,b,dt,opts={}){
  const events={impact:0};b.acc=(b.acc||0)+dt;
  while(b.acc>=BODY_STEP-1e-9){b.acc-=BODY_STEP;events.impact=Math.max(events.impact,fixedStep(t,b,BODY_STEP,opts));if(b.resting)b.acc=0}
  return events;
}
function fixedStep(t,b,dt,{wind=0,body=BODIES.grenadeHigh}={}){
  const events={impact:0};
  if(b.resting){if(overlaps(t,b.x,b.y+2,b.r))return 0;b.resting=false;b.restTime=0}
  b.contact=false;
  // Forces apply per substep, so a 60 fps frame, a 25 fps frame and the AI forecast agree.
  const n=Math.max(1,Math.ceil((Math.hypot(b.vx,b.vy)+GRAVITY*dt)*dt/3)),h=dt/n;
  for(let i=0;i<n;i++){
    b.vx+=wind*h;b.vy+=GRAVITY*h;
    let nx=b.x+b.vx*h,ny=b.y+b.vy*h;
    if(!overlaps(t,nx,ny,b.r)){b.x=nx;b.y=ny;continue}
    const nrm=contactNormal(t,nx,ny,b.r),vn=b.vx*nrm.x+b.vy*nrm.y;b.contact=true;b.normal=nrm;
    if(vn<0){
      const tx=-nrm.y,ty=nrm.x,vt=b.vx*tx+b.vy*ty,hard=-vn>45;
      // A hard hit bounces; a soft one just removes the inward part and keeps the slide.
      const outN=hard?-vn*body.restitution:0,outT=hard?vt*body.impactFriction:vt;
      if(hard)events.impact=Math.max(events.impact,-vn);
      b.vx=nrm.x*outN+tx*outT;b.vy=nrm.y*outN+ty*outT;
    }
    nx=b.x+b.vx*h;ny=b.y+b.vy*h;let moved=false;
    for(let lift=0;lift<=3&&!moved;lift++)if(!overlaps(t,nx+nrm.x*lift,ny+nrm.y*lift,b.r)){b.x=nx+nrm.x*lift;b.y=ny+nrm.y*lift;moved=true}
    if(!moved){for(let k=0;k<b.r+4&&overlaps(t,b.x,b.y,b.r);k++){b.x+=nrm.x;b.y+=nrm.y}break}
  }
  if(b.x<4||b.x>W-4){b.vx*=-.55;b.x=clamp(b.x,4,W-4)}
  if(b.contact){
    const drag=Math.max(0,1-body.rollDrag*dt);b.vx*=drag;b.vy*=drag;
    const flat=(b.normal?.y??-1)<-.93;
    if(flat&&Math.hypot(b.vx,b.vy)<14){b.restTime=(b.restTime||0)+dt;if(b.restTime>.2){b.resting=true;b.vx=0;b.vy=0}}else b.restTime=0;
  }else b.restTime=0;
  return events.impact;
}

// ---- Worm locomotion: pixel crawl like the original, climbing small steps and hugging slopes. ----
export const CLIMB=9,WALK_SPEED=95;
export function wormFits(t,x,y){return !solid(t,x,y+R-1)&&!solid(t,x-7,y+R-4)&&!solid(t,x+7,y+R-4)&&!solid(t,x,y-R)&&!solid(t,x-9,y-2)&&!solid(t,x+9,y-2)}
export function wormGrounded(t,x,y){return solid(t,x,y+R)||solid(t,x-6,y+R)||solid(t,x+6,y+R)}
// Moves a grounded worm up to `distance` pixels; returns 'walked', 'blocked' or 'fell'.
export function crawl(t,w,dir,distance){
  let left=distance,status='walked';
  while(left>0){
    const step=Math.min(1,left),x=clamp(w.x+dir*step,R,W-R);if(x===w.x){status='blocked';break}
    let y=null;
    for(let up=0;up<=CLIMB;up++)if(wormFits(t,x,w.y-up)){y=w.y-up;break}
    if(y===null){status='blocked';break}
    let drop=0;while(drop<CLIMB&&!wormGrounded(t,x,y)&&wormFits(t,x,y+1)){y++;drop++}
    w.x=x;w.y=y;left-=step;w.crawl=(w.crawl||0)+step;
    if(!wormGrounded(t,x,y)){status='fell';break}
  }
  return status;
}
