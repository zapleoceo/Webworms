// World size depends on the map (live bindings: setWorld() updates every importer); the canvas is a VIEW_W x VIEW_H window onto it.
export let W=3600,H=1400,WATER=1355;
export const WORLD_SIZES=[[3600,1400],[3600,1400],[3600,1400],[6400,1800]];
export function setWorld(map){[W,H]=WORLD_SIZES[map]??WORLD_SIZES[0];WATER=H-45}
export const VIEW_W=1600,VIEW_H=800,R=15,GRAVITY=620,WEAPONS=['bazooka','grenade','shotgun','dynamite','airstrike','punch','jetpack','rope','teleport'];
export const AIM_MIN=-Math.PI/2+0.025,AIM_MAX=Math.PI/2-0.025;
export const AI_PROFILES=[
  {name:'EASY',angleStep:9,powerStep:.15,aimError:.18,airError:150,friendWeight:1.3,reposition:false,shotgunRange:115,grenadeThreshold:32},
  {name:'NORMAL',angleStep:5,powerStep:.10,aimError:.045,airError:48,friendWeight:1.7,reposition:true,shotgunRange:210,grenadeThreshold:22},
  {name:'HARD',angleStep:3,powerStep:.07,aimError:.008,airError:12,friendWeight:2.2,reposition:true,shotgunRange:260,grenadeThreshold:15}
];
export function aimAngle(dx,dy){return clamp(Math.atan2(dy,Math.abs(dx)),AIM_MIN,AIM_MAX)}
export const data={bazooka:{name:'BAZOOKA',short:'Wind-bent rocket',icon:'🚀',radius:77,damage:58},grenade:{name:'GRENADE',short:'Bounce + 3 s fuse',icon:'💣',radius:84,damage:66},shotgun:{name:'SHOTGUN',short:'Close-range spread',icon:'▰',radius:0,damage:10},dynamite:{name:'DYNAMITE',short:'Drop + 3 s fuse',icon:'🧨',radius:102,damage:82},airstrike:{name:'AIRSTRIKE',short:'Five wind-proof missiles',icon:'✈',radius:56,damage:40},punch:{name:'PUNCH',short:'Melee knockback',icon:'✊',radius:0,damage:30},jetpack:{name:'JETPACK',short:'Fly for 4 seconds',icon:'♨',radius:0,damage:0},rope:{name:'NINJA ROPE',short:'Swing across the map; keeps your turn',icon:'➰',radius:0,damage:0},teleport:{name:'TELEPORT',short:'Click a free spot · 2 per match',icon:'✦',radius:0,damage:0}};
export function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
export function seeded(seed){let x=seed>>>0;return()=>{x=(1664525*x+1013904223)>>>0;return x/4294967296}}
// Maps are about 120 worm heights wide, like the classic landscapes; the camera shows a 1600x800 window.
// 0 Sunset Cove: archipelago split by sea channels, tunnels and floating rocks over the water.
// 1 Rust Ridge: one tall massif riddled with caverns and tunnels.
// 2 Crystal Atoll: two islands and a scatter of floating crystal chunks.
const TAU=Math.PI*2;
// Grand Expedition (map 3): one wide world crossing four zones, each with its own features.
// 0-25% tropical islands split by channels, 25-50% jungle hills with caverns and tunnels,
// 50-75% an industrial ridge with chasms, girder bridges and rock towers, 75-100% an atoll of floating islands.
function createExpedition(seed){
  const rand=seeded(seed^0x5eed),mask=new Uint8Array(W*H),top=new Int16Array(W),ph=[0,1,2,3].map(()=>rand()*TAU);
  const zone=x=>x/W*4,base=H-560;
  const heightAt=x=>{
    const z=zone(x),b=[
      base+40+90*Math.sin(x/260+ph[0])+30*Math.sin(x/71+ph[1]),
      base-140+190*Math.sin(x/330+ph[1])+70*Math.sin(x/97+ph[2]),
      base-260+60*Math.sin(x/410+ph[2])+20*Math.sin(x/53+ph[3]),
      base+90+70*Math.sin(x/220+ph[3])+25*Math.sin(x/61+ph[0])];
    // Blend neighbouring zones across a 300 px seam so the landscape changes smoothly.
    const i=Math.min(3,Math.floor(z)),f=z-i,seam=300/(W/4);
    if(f>1-seam&&i<3){const k=(f-(1-seam))/seam,s=k*k*(3-2*k);return b[i]*(1-s)+b[i+1]*s}
    return b[i];
  };
  const gaps=[[W*.09,190],[W*.18,230],[W*.56,170],[W*.66,200],[W*.83,260],[W*.93,220]].map(([x,w])=>[x+(rand()-.5)*120,w]);
  for(let x=0;x<W;x++){
    let y=heightAt(x)+2*Math.sin(x*.45)+1.4*Math.sin(x*1.27)+(rand()-.5)*3;
    let shore=Math.min(x-120,W-120-x);for(const [gx,gw] of gaps)shore=Math.min(shore,Math.abs(x-gx)-gw/2);
    if(shore<0)y=H;else if(shore<300){const k=1-shore/300;y+=k*k*(WATER+40-y)}
    top[x]=Math.floor(clamp(y,360,H));
    for(let iy=top[x];iy<H;iy++)mask[iy*W+x]=1;
  }
  const t={mask,top,map:3,seed},fill=(x0,y0,x1,y1)=>{for(let y=Math.max(0,Math.floor(y0));y<Math.min(H,y1);y++)for(let x=Math.max(0,Math.floor(x0));x<Math.min(W,x1);x++)mask[y*W+x]=1;for(let x=Math.max(0,Math.floor(x0));x<Math.min(W,x1);x++){let y=0;while(y<H&&!mask[y*W+x])y++;top[x]=y}};
  const blob=(cx,cy,rx,ry,flat)=>{for(let y=Math.max(0,Math.floor(cy-ry));y<=Math.min(H-1,cy+ry);y++)for(let x=Math.max(0,Math.floor(cx-rx));x<=Math.min(W-1,cx+rx);x++)if(((x-cx)/rx)**2+((y-cy)/ry)**2<1&&y>=cy-ry*flat)mask[y*W+x]=1;for(let x=Math.max(0,Math.floor(cx-rx));x<=Math.min(W-1,cx+rx);x++){let y=0;while(y<H&&!mask[y*W+x])y++;top[x]=y}};
  // Jungle: caverns and crawlable tunnels.
  for(let k=0;k<6;k++){const x=W*.27+rand()*W*.21,g=groundY(t,x);if(g<WATER-300)carve(t,x,g+170+rand()*80,50+rand()*40)}
  for(let k=0;k<3;k++){let x=W*.26+rand()*W*.18,y=groundY(t,x)+80;const dir=rand()<.5?-1:1;for(let s=0;s<420;s+=10){x+=dir*10;y+=Math.sin(s/80+k)*3;if(y<WATER-60&&groundY(t,x)<y-40)carve(t,x,y,30)}}
  // Industrial ridge: girder bridges over the chasms and flat-topped rock towers.
  for(const [gx,gw] of gaps.filter(([x])=>x>W*.5&&x<W*.75)){const left=groundY(t,gx-gw/2-40),right=groundY(t,gx+gw/2+40),y=Math.min(left,right)-2;fill(gx-gw/2-60,y,gx+gw/2+60,y+12)}
  for(let k=0;k<5;k++){const x=W*.52+rand()*W*.22,w=40+rand()*30,g=groundY(t,x);if(g<WATER-200)fill(x-w/2,g-180-rand()*140,x+w/2,g+4)}
  // Floating islands over the channels and across the atoll.
  for(const [gx] of gaps.filter(([x])=>x<W*.25||x>W*.75))blob(gx,Math.min(groundY(t,gx-260),groundY(t,gx+260))-100-rand()*80,110+rand()*50,26,.35);
  for(let k=0;k<7;k++){const x=W*.76+rand()*W*.22;blob(x,groundY(t,x)-180-rand()*200,50+rand()*45,20,.25)}
  return t;
}
export function createTerrain(map=0,seed=1){
  setWorld(map);if(map===3)return createExpedition(seed);
  const rand=seeded(seed),mask=new Uint8Array(W*H),top=new Int16Array(W),ph=[0,1,2].map(()=>rand()*TAU);
  const gaps=[],n=[3,1,2][map]??2;
  for(let i=0;i<n;i++)gaps.push([W*(i+1)/(n+1)+(rand()-.5)*300,(map===2?200:150)+rand()*80]);
  for(let x=0;x<W;x++){
    let y;
    if(map===0) y=1000+150*Math.sin(x/420+ph[0])+70*Math.sin(x/143+ph[1])+30*Math.sin(x/49+ph[2])+12*Math.sin(x/23);
    else if(map===1) y=890+230*Math.sin(x/510+ph[0])+90*Math.sin(x/170+ph[1])+40*Math.sin(x/61+ph[2]);
    else y=1050+110*Math.sin(x/360+ph[0])+80*Math.sin(x/120+ph[1])+22*Math.sin(x/37+ph[2]);
    // Fine, deterministic chips break up the sine-wave silhouette while
    // keeping the ground height stable enough for walking and aiming.
    y+=2*Math.sin(x*.45)+1.4*Math.sin(x*1.27)+(rand()-.5)*3;
    // Beaches slope into the sea at the map ends and into every channel.
    let shore=Math.min(x-120,W-120-x);for(const [gx,gw] of gaps)shore=Math.min(shore,Math.abs(x-gx)-gw/2);
    if(shore<0)y=H;else if(shore<320){const k=1-shore/320;y+=k*k*(WATER+40-y)}
    top[x]=Math.floor(clamp(y,380,H));
    for(let iy=top[x];iy<H;iy++)mask[iy*W+x]=1;
  }
  const t={mask,top,map,seed},fill=(cx,cy,rx,ry,flat)=>{
    for(let y=Math.max(0,Math.floor(cy-ry));y<=Math.min(H-1,cy+ry);y++)for(let x=Math.max(0,Math.floor(cx-rx));x<=Math.min(W-1,cx+rx);x++)
      if(((x-cx)/rx)**2+((y-cy)/ry)**2<1&&y>=cy-ry*flat)mask[y*W+x]=1;
    for(let x=Math.max(0,Math.floor(cx-rx));x<=Math.min(W-1,cx+rx);x++){let y=0;while(y<H&&!mask[y*W+x])y++;top[x]=y}
  };
  // Tunnels wide enough to crawl through, snaking under the hills.
  for(let k=0;k<(map===1?4:map===0?2:1);k++){
    let x=300+rand()*(W-900),y=groundY(t,x)+70+rand()*60;const len=320+rand()*360,dir=rand()<.5?-1:1;
    for(let s=0;s<len;s+=10){x+=dir*10;y+=Math.sin(s/90+k)*3;if(y<WATER-60&&groundY(t,x)<y-40)carve(t,x,y,30)}
  }
  // Caverns inside the Rust Ridge massif.
  if(map===1)for(let k=0;k<6;k++){const x=250+rand()*(W-500),g=groundY(t,x);if(g<WATER-280)carve(t,x,g+150+rand()*90,55+rand()*45)}
  // Floating rocks over the sea channels; crystal chunks scattered over the atoll.
  if(map!==1)for(const [gx] of gaps){const g=Math.min(groundY(t,gx-260),groundY(t,gx+260));fill(gx,g-90-rand()*70,110+rand()*40,26,.35)}
  if(map===2)for(let k=0;k<5;k++){const x=300+rand()*(W-600);fill(x,groundY(t,x)-170-rand()*120,40+rand()*35,20,.2)}
  return t;
}
// Six spawn points on level dry ground, sorted left to right; teams take alternate spots so rivals start close.
export function spawnSpots(t,seed,count=6){
  const rand=seeded((seed^0x51ed270b)>>>0),cand=[];
  // Level ground, headroom to jump, and no sheer drop within a few steps either way.
  for(let x=140;x<W-140;x+=20){const g=groundY(t,x);if(g>WATER-90||Math.abs(groundY(t,x-14)-groundY(t,x+14))>14||!wormFits(t,x,g-R-1)||solid(t,x,g-R*2-30))continue;
    if([-70,-40,40,70].some(d=>groundY(t,x+d)-g>45))continue;cand.push(x)}
  for(let i=cand.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[cand[i],cand[j]]=[cand[j],cand[i]]}
  let picked=[];
  for(const gap of [420,300,200,120,40]){picked=[];for(const x of cand)if(picked.every(p=>Math.abs(p-x)>=gap)){picked.push(x);if(picked.length===count)break}if(picked.length===count)break}
  return picked.sort((a,b)=>a-b).map(x=>({x,y:groundY(t,x)-R-1}));
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
  if(bounce&&exact){const b={x,y,vx,vy,r};let time=0;while(time<fuse-1e-9&&!b.sunk){stepBody(t,b,BODY_STEP,{body,water});time+=BODY_STEP}return {x:b.x,y:b.y,time,hit:false}}
  let time=0, px=x,py=y,ax=vx,ay=vy,hit=false;
  while(time<fuse&&py<H+100){
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
  // The water check runs every step, so a body dipping under and bouncing back out is caught in game and forecast alike.
  const water=opts.water??Infinity;
  while(!b.sunk&&b.acc>=BODY_STEP-1e-9){b.acc-=BODY_STEP;events.impact=Math.max(events.impact,fixedStep(t,b,BODY_STEP,opts));if(b.y>water)b.sunk=true;if(b.resting)b.acc=0}
  return events;
}
function fixedStep(t,b,dt,{wind=0,body=BODIES.grenadeHigh}={}){
  const events={impact:0};
  if(b.resting){if(overlaps(t,b.x,b.y+2,b.r))return 0;b.resting=false;b.restTime=0}
  b.contact=false;
  // Forces apply per substep, so a 60 fps frame, a 25 fps frame and the AI forecast agree.
  const n=Math.max(1,Math.ceil((Math.hypot(b.vx,b.vy)+GRAVITY*dt)*dt/1.5)),h=dt/n;
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
    // Props may come to rest on a slope (body.restOnSlope); ordnance keeps rolling until the ground is flat.
    // Static friction for props (body.restOnSlope): a slow one sticks on slopes up to ~37 degrees.
    // Ordnance keeps rolling until the ground is flat.
    const ny=b.normal?.y??-1,still=body.restOnSlope?ny<-.8&&Math.hypot(b.vx,b.vy)<40:ny<-.93&&Math.hypot(b.vx,b.vy)<14;
    if(still){b.restTime=(b.restTime||0)+dt;if(b.restTime>.2){b.resting=true;b.vx=0;b.vy=0}}else b.restTime=0;
  }else b.restTime=0;
  return events.impact;
}

// ---- Worm locomotion: pixel crawl like the original, climbing small steps and hugging slopes. ----
// Single bumps up to CLIMB px are stepped over, but sustained climbing steeper than CLIMB_RATE px
// per pixel walked (about 68 degrees) drains CLIMB_BUDGET and stops the worm: cliffs need a jump.
export const CLIMB=9,CLIMB_RATE=2.5,CLIMB_BUDGET=12,WALK_SPEED=95;
export function wormFits(t,x,y){return !solid(t,x,y+R-1)&&!solid(t,x-7,y+R-4)&&!solid(t,x+7,y+R-4)&&!solid(t,x,y-R)&&!solid(t,x-9,y-2)&&!solid(t,x+9,y-2)}
// Support is the rounded underside of wormFits pushed one pixel down, so 'cannot sink' means 'grounded'.
export function wormGrounded(t,x,y){return solid(t,x,y+R)||solid(t,x-7,y+R-3)||solid(t,x+7,y+R-3)}
// Moves a grounded worm up to `distance` pixels; returns 'walked', 'blocked' or 'fell'.
export function crawl(t,w,dir,distance){
  let left=distance,status='walked';
  while(left>0){
    const step=Math.min(1,left),x=clamp(w.x+dir*step,R,W-R);if(x===w.x){status='blocked';break}
    let y=null;
    let up=0;while(up<=CLIMB&&!wormFits(t,x,w.y-up))up++;
    if(up>CLIMB||(w.climbDebt||0)+up>CLIMB_BUDGET){status='blocked';break}
    y=w.y-up;w.climbDebt=Math.max(0,(w.climbDebt||0)+up-CLIMB_RATE*step);
    let drop=0;while(drop<CLIMB&&!wormGrounded(t,x,y)&&wormFits(t,x,y+1)){y++;drop++}
    w.x=x;w.y=y;left-=step;w.crawl=(w.crawl||0)+step;
    if(!wormGrounded(t,x,y)){status='fell';break}
  }
  return status;
}
