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
export function trajectory(t,x,y,vx,vy,wind,{fuse=8,bounce=false,dt=1/40}={}){
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
export function selectShot(t,from,targets,friends,wind,difficulty=1){
  const profile=AI_PROFILES[difficulty]??AI_PROFILES[1];let best=null;const angles=[];for(let a=-88;a<=88;a+=profile.angleStep)angles.push(a);
  for(const dir of [-1,1])for(const a of angles)for(let p=0.35;p<=1.001;p+=profile.powerStep){
    const theta=a*Math.PI/180;const speed=370+390*p;
    const vx=dir*Math.cos(theta)*speed,vy=Math.sin(theta)*speed;
    const end=trajectory(t,from.x+dir*Math.cos(theta)*24,from.y-9+Math.sin(theta)*22,vx,vy,wind);
    if(!end.hit||end.y>=WATER)continue;
    let score=-999;
    for(const target of targets){const d=Math.hypot(target.x-end.x,target.y-10-end.y),hurt=blastDamage(d,77,58);score=Math.max(score,hurt+(difficulty===2&&hurt>=target.hp?22:0));}
    for(const f of friends){const d=Math.hypot(f.x-end.x,f.y-10-end.y);score-=blastDamage(d,77,58)*profile.friendWeight;}
    score-=Math.abs(end.x-from.x)*.0001;
    if(!best||score>best.score)best={dir,angle:a,power:p,score,end};
  }
  return best;
}
export function selectLob(t,from,targets,friends,wind,difficulty=1){
  const profile=AI_PROFILES[difficulty]??AI_PROFILES[1];let best=null;
  for(const dir of [-1,1])for(let a=-88;a<=88;a+=profile.angleStep+1)for(let p=.35;p<=1.001;p+=profile.powerStep+.02){
    const theta=a*Math.PI/180,speed=300+280*p;
    const end=trajectory(t,from.x+dir*Math.cos(theta)*24,from.y-9+Math.sin(theta)*22,dir*Math.cos(theta)*speed,Math.sin(theta)*speed,wind,{fuse:3,bounce:true});
    if(end.y>=WATER)continue;
    let score=-999;
    for(const target of targets){const hurt=blastDamage(Math.hypot(target.x-end.x,target.y-end.y),84,66);score=Math.max(score,hurt+(difficulty===2&&hurt>=target.hp?22:0))}
    for(const friend of friends)score-=blastDamage(Math.hypot(friend.x-end.x,friend.y-end.y),84,66)*profile.friendWeight;
    if(!best||score>best.score)best={dir,angle:a,power:p,score,end};
  }
  return best;
}

