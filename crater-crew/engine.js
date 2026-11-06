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
// ---- Map generation ----
// Maps are about 120 worm heights wide, like the classic landscapes; the camera shows a 1600x800 window.
// Every map is a walkable landscape: flat ledges joined by ramps no steeper than MAX_GRADE (a worm can
// crawl far steeper, see CLIMB_RATE), gentle beaches into the sea, at most two narrow sea channels, each
// spanned by a bridge or an arch, and set pieces of its own:
// 0 Sunset Cove: dunes and ledges, a lagoon under a rope bridge, sea-cave tunnels, a lighthouse.
// 1 Rust Ridge: terraced mesas, a dry canyon under a steel girder bridge, tunnels, caverns, oil derricks.
// 2 Crystal Atoll: two islands joined by a crystal arch, a tunnelled crystal mesa, floating crystal chunks over land.
// 3 Grand Expedition: one wide world crossing four zones (islands, jungle, industry, atoll).
const TAU=Math.PI*2;
export const MAX_GRADE=.65,BEACH=.42,SHELF=60,STEP=40,RISER=Math.ceil(STEP/MAX_GRADE),TERRACE=RISER+30;
const smooth=k=>{k=clamp(k,0,1);return k*k*(3-2*k)};
// bands: surface height range per zone (px above the sea); seas/canyons: [position, jitter, style] as width fractions.
const SPECS=[
 {bands:[[-340,-180]],shore:[-260,-160],seas:[[.5,.12,'rope']],tunnels:2,caverns:1,floats:[[.08,.92]],landmarks:[['lighthouse',.06,.3]]},
 {bands:[[-640,-330]],shore:[-300,-170],seas:[],canyons:[[.5,.15]],tunnels:2,caverns:6,floats:[],landmarks:[['derrick',.15,.4],['derrick',.6,.85]]},
 {bands:[[-350,-180]],shore:[-260,-160],seas:[[.5,.06,'arch']],tunnels:1,caverns:3,floats:[[.06,.4],[.6,.94],[.06,.94]],landmarks:[['spire',.1,.38],['spire',.62,.9]]},
 {bands:[[-420,-200],[-700,-380],[-620,-400],[-380,-200]],shore:[-260,-160],seas:[[.125,.025,'rope'],[.875,.025,'arch']],canyons:[[.62,.04]],tunnels:[[.27,.48],2],caverns:[[.27,.48],4],floats:[[.18,.24],[.78,.97],[.78,.97],[.78,.97]],landmarks:[['lighthouse',.03,.09],['ruin',.3,.46],['derrick',.52,.58],['spire',.92,.97]]}
];
// The surface: a chain of flat ledges and smoothstep ramps. A ramp of length L rises at most
// MAX_GRADE*L/1.5, so its steepest point (1.5x the mean for smoothstep) stays within MAX_GRADE.
function ridgeline(rand,band){
 const h=new Float32Array(W);let x=0,[lo,hi]=band(0),y=lo+(hi-lo)*(.3+rand()*.4),flat=rand()<.5;
 while(x<W){
  // Ramps are only as long as their climb needs (up to 1.5x), so most of the width stays level.
  [lo,hi]=band(Math.min(W-1,x+200));const ny=flat?y:clamp(lo+rand()*(hi-lo),y-90,y+90);
  const L=Math.round(flat?200+rand()*220:Math.max(50,Math.abs(ny-y)*1.5/MAX_GRADE*(1+rand()*.3))),end=Math.min(W,x+L);
  for(let i=x;i<end;i++)h[i]=y+(ny-y)*smooth((i-x)/L);
  y=ny;x=end;flat=flat?false:rand()<.85;
 }
 return h;
}
// Fills in anything steeper than g (both ways), so forced features blend in with walkable ramps.
function limitGrade(h,g){for(let x=1;x<W;x++)h[x]=Math.min(h[x],h[x-1]+g);for(let x=W-2;x>=0;x--)h[x]=Math.min(h[x],h[x+1]+g)}
// Cuts ramps down into a sunken level window [a,b]: outward from each edge, until the ground already fits grade g.
function cutAround(h,a,b,g){for(let x=b+1;x<W&&h[x]<h[x-1]-g;x++)h[x]=h[x-1]-g;for(let x=a-1;x>=0&&h[x]<h[x+1]-g;x--)h[x]=h[x+1]-g}
function refreshTop(t,x0,x1){for(let x=Math.max(0,Math.floor(x0));x<=Math.min(W-1,Math.ceil(x1));x++){let y=0;while(y<H&&!t.mask[y*W+x])y++;t.top[x]=y}}
// Deck of a bridge or arch at column x (the art layer draws planks/girders on the same curve).
export function deckY(f,x){const u=clamp((x-f.x0)/(f.x1-f.x0),0,1);return f.ya+(f.yb-f.ya)*u+f.sag*Math.sin(Math.PI*u)}
function span(t,f){
 for(let x=Math.floor(f.x0)-8;x<=Math.ceil(f.x1)+8;x++){if(x<0||x>=W)continue;const u=clamp((x-f.x0)/(f.x1-f.x0),0,1),y=Math.round(deckY(f,x)),
  th=f.style==='arch'?22+90*(1-Math.sin(Math.PI*u))**3:f.style==='girder'?10:8;
  for(let yy=Math.max(0,y);yy<Math.min(H,y+th);yy++)t.mask[yy*W+x]=1}
 refreshTop(t,f.x0-8,f.x1+8);t.features.push(f);
}
// A walk-through tunnel: a level bore through a rock mesa, its floor flush with the flat on both sides.
function tunnel(t,k){
 const y=k.base-27,a=Math.floor(k.x-k.half-6),b=Math.ceil(k.x+k.half+6);for(let x=a;x<=b;x+=4)carve(t,x,y,27);
 t.features.push({kind:'tunnel',x0:a,x1:b,y});
}
// Floating rock only over dry land, high enough to walk under.
function floatRock(t,rand,x0,x1){
 for(let tries=0;tries<30;tries++){
  const x=W*(x0+rand()*(x1-x0)),rx=65+rand()*45,g=Math.min(...[-rx-40,0,rx+40].map(d=>t.top[clamp(Math.floor(x+d),0,W-1)])),y=g-190-rand()*70;
  if(y<420||[-rx-80,0,rx+80].some(d=>!solid(t,x+d,WATER-12))||t.features.some(f=>f.kind!=='landmark'&&Math.abs(x-(f.x0+f.x1)/2)<(f.x1-f.x0)/2+rx+60))continue;
  const ry=24,flat=.35;
  for(let yy=Math.floor(y-ry);yy<=y+ry;yy++)for(let xx=Math.floor(x-rx);xx<=x+rx;xx++)if(xx>=0&&xx<W&&((xx-x)/rx)**2+((yy-y)/ry)**2<1&&yy>=y-ry*flat)t.mask[yy*W+xx]=1;
  refreshTop(t,x-rx,x+rx);t.features.push({kind:'float',x0:x-rx,x1:x+rx,y});return;
 }
}
export function createTerrain(map=0,seed=1){
 setWorld(map);
 const spec=SPECS[map]??SPECS[0],rand=seeded(map===3?seed^0x5eed:seed),mask=new Uint8Array(W*H),top=new Int16Array(W),t={mask,top,map,seed,features:[]};
 const range=v=>Array.isArray(v)?[v[0][0],v[0][1],v[1]]:[.06,.94,v],pick=([x,jit])=>W*(x+(rand()*2-1)*jit),zones=spec.bands.length;
 const seas=spec.seas.map(s=>({x:pick(s),w:130+rand()*40,style:s[2]})),canyons=(spec.canyons||[]).map(c=>({x:pick(c),w:170+rand()*60}));
 const ends=85,coast=x=>Math.min(x,W-x,...seas.map(s=>Math.abs(x-s.x)-s.w/2));
 // Zone heights blend across 300 px seams; near the sea every zone settles down to low coastal ground.
 const band=x=>{const z=clamp(x/W*zones,0,zones-.001),i=Math.floor(z),f=z-i,seam=300/(W/zones);let b=spec.bands[i];
  if(f>1-seam&&i<zones-1){const k=smooth((f-(1-seam))/seam),n=spec.bands[i+1];b=[b[0]+(n[0]-b[0])*k,b[1]+(n[1]-b[1])*k]}
  const k=smooth((coast(x)-120)/900);return [WATER+spec.shore[0]+(b[0]-spec.shore[0])*k,WATER+spec.shore[1]+(b[1]-spec.shore[1])*k]};
 // The coast: how high the ground may stand at each column. Gentle beaches run down to the map ends and every
 // channel; under the waterline the sea floor drops away faster, so the shallows stay a thin strip; above the
 // beach the coast climbs four terraces (STEP px risers at MAX_GRADE, then a level step), then plain MAX_GRADE.
 const env=new Float32Array(W);for(let x=0;x<W;x++){let e=Math.min(x-ends,W-ends-x);for(const s of seas)e=Math.min(e,Math.abs(x-s.x)-s.w/2);
  const u=e-SHELF,k=Math.floor(u/TERRACE),r=u-k*TERRACE,stairs=4*TERRACE;
  env[x]=e<0?WATER-e*1.2:e<SHELF?WATER-e*BEACH:u<stairs?WATER-SHELF*BEACH-STEP*(k+Math.min(1,r/RISER)):WATER-SHELF*BEACH-4*STEP-(u-stairs)*MAX_GRADE}
 const h=ridgeline(rand,band),coastline=()=>{for(let x=0;x<W;x++)if(!knolls.some(k=>Math.abs(x-k.x)<=k.half))h[x]=Math.max(h[x],env[x])};
 // Flattens a window to its highest point; a checked ledge sits no higher than the coast allows anywhere under it.
 const levels=[],ledge=(a,b,checked,keep)=>{a=Math.max(0,Math.floor(a));b=Math.min(W-1,Math.ceil(b));let y=H,lim=0;for(let x=a;x<=b;x++){y=Math.min(y,h[x]);lim=Math.max(lim,env[x])}
  if(checked)y=Math.max(y,lim);for(let x=a;x<=b;x++)h[x]=y;if(keep)levels.push([a,b,y]);return y};
 const knolls=[];coastline();
 // Canyon rims are flat ledges level with the highest ground around them.
 for(const c of canyons)c.rim=ledge(c.x-c.w/2-110,c.x+c.w/2+110,true,true);
 // Rock mesas with a tunnel bored through at ground level: the sides are deliberate cliffs, the tunnel is the way on foot.
 {const [a,b,n]=range(spec.tunnels);for(let k=0,tries=0;k<n&&tries<40;tries++){const x=W*(a+rand()*(b-a)),half=130+rand()*60;
  if(coast(x)<half+420||canyons.some(c=>Math.abs(x-c.x)<c.w/2+half+650)||knolls.some(o=>Math.abs(o.x-x)<o.half+half+400))continue;
  const base=ledge(x-half-70,x+half+70,true,true);knolls.push({x,half,base,rise:150+rand()*50});k++}}
 // Spawn ledges: flat shelves spread along the dry land, well away from the sea and the canyons.
 const nl=Math.round(W/320);for(let k=0;k<nl;k++){const x=W*(k+.5)/nl+(rand()-.5)*W/nl*.5;
  if(coast(x)>320&&canyons.every(c=>Math.abs(x-c.x)>c.w/2+260)&&knolls.every(o=>Math.abs(x-o.x)>o.half+200))ledge(x-60-rand()*40,x+60+rand()*40,true)}
 limitGrade(h,MAX_GRADE);coastline();
 // Canyon rims and tunnel floors must stay exactly level: restore them and grade the ground around them down.
 for(const [a,b,y] of levels){for(let x=a;x<=b;x++)h[x]=y;cutAround(h,a,b,MAX_GRADE)}
 for(const c of canyons)for(let x=Math.floor(c.x-c.w/2-110);x<=c.x+c.w/2+110;x++)h[x]=c.rim;
 for(const k of knolls)for(let i=Math.floor(k.x-k.half);i<=k.x+k.half;i++)h[i]=Math.min(h[i],k.base-clamp((k.half-Math.abs(i-k.x))*3.2,0,k.rise));
 // Dry canyons: deliberate sheer walls down to a floor well above the sea, crossed by a girder bridge.
 for(const c of canyons){c.floor=Math.min(WATER-130,c.rim+240);for(let x=Math.floor(c.x-c.w/2);x<=c.x+c.w/2;x++)h[x]=Math.max(h[x],Math.min(c.floor,c.rim+(c.w/2-Math.abs(x-c.x))*4.5))}
 const p1=rand()*TAU,p2=rand()*TAU;
 for(let x=0;x<W;x++){
  let y=h[x];
  // Low, fine ripples and chips break up the silhouette without making real slopes.
  y+=4*Math.sin(x/57+p1)+2*Math.sin(x/26+p2)+.6*Math.sin(x/9);
  top[x]=Math.floor(clamp(y,380,H));for(let iy=top[x];iy<H;iy++)mask[iy*W+x]=1;
 }
 // Every channel is crossable on foot: a sagging rope bridge, or a natural arch on the atoll.
 for(const s of seas){let a=Math.floor(s.x),b=a;while(a>0&&top[a]>WATER-44)a--;while(b<W-1&&top[b]>WATER-44)b++;
  span(t,{kind:'bridge',style:s.style,x0:a,x1:b,ya:top[a],yb:top[b],sag:s.style==='arch'?-30:12})}
 for(const c of canyons){let a=Math.floor(c.x),b=a;while(a>0&&top[a]>c.rim+14)a--;while(b<W-1&&top[b]>c.rim+14)b++;
  span(t,{kind:'bridge',style:'girder',x0:a,x1:b,ya:top[a],yb:top[b],sag:-6})}
 for(const k of knolls)tunnel(t,k);
 // Caverns: hollows deep under thick ground, opened up by the first big blast.
 {const [a,b,n]=range(spec.caverns);for(let k=0;k<n;k++){const x=W*(a+(b-a)*(k+rand())/n),g=groundY(t,x),r=40+rand()*40;if(g<WATER-240&&solid(t,x,g+60)&&!t.features.some(f=>f.kind!=='landmark'&&x>f.x0-r-80&&x<f.x1+r+80)){const y=Math.min(g+110+r+rand()*50,WATER-60-r);if(y-r<g+100)continue;carve(t,x,y,r);t.features.push({kind:'cave',x0:x-r,x1:x+r,y,r})}}}
 for(const [a,b] of spec.floats)floatRock(t,rand,a,b);
 // Landmarks are background art standing on a flat stretch; they do not collide.
 for(const [type,a,b] of spec.landmarks){let best=null;for(let k=0;k<24;k++){const x=Math.floor(W*(a+rand()*(b-a))),g=top[x];if(!solid(t,x,WATER-12)||!solid(t,x,g+50))continue;const tilt=Math.abs(top[clamp(x-30,0,W-1)]-top[clamp(x+30,0,W-1)]);if(!best||tilt<best.tilt)best={tilt,x}}if(best)t.features.push({kind:'landmark',type,x:best.x})}
 return t;
}
// Six spawn points on level dry ground, sorted left to right; teams take alternate spots so rivals start close.
// Strict pass: a solid ledge well above the sea and far from any water; the loose pass only backs it up.
export function spawnSpots(t,seed,count=6){
 const rand=seeded((seed^0x51ed270b)>>>0),dist=new Float32Array(W);
 let d=1e6;for(let x=0;x<W;x++){d=solid(t,x,WATER-12)?d+1:0;dist[x]=d}d=1e6;for(let x=W-1;x>=0;x--){d=solid(t,x,WATER-12)?d+1:0;dist[x]=Math.min(dist[x],d)}
 const ok=(x,strict)=>{const g=groundY(t,x);
  if(g>WATER-(strict?150:100)||dist[x]<(strict?240:160)||Math.abs(groundY(t,x-14)-groundY(t,x+14))>(strict?8:12)||Math.abs(groundY(t,x-20)-groundY(t,x+20))>12||!wormFits(t,x,g-R-1)||solid(t,x,g-R*2-30))return false;
  if(!solid(t,x,g+30)||t.features?.some(f=>f.kind==='bridge'&&x>f.x0-40&&x<f.x1+40))return false;
  if(strict&&(Math.abs(groundY(t,x-32)-groundY(t,x+32))>14||!solid(t,x,g+60)))return false;
  return ![-70,-40,40,70].some(d=>groundY(t,x+d)-g>45)};
 let picked=[];
 for(const strict of [true,false]){
  const cand=[];for(let x=140;x<W-140;x+=20)if(ok(x,strict))cand.push(x);
  for(let i=cand.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[cand[i],cand[j]]=[cand[j],cand[i]]}
  for(const gap of [Math.round(W/9),300,200,120,40]){picked=[];for(const x of cand)if(picked.every(p=>Math.abs(p-x)>=gap)){picked.push(x);if(picked.length===count)break}if(picked.length===count)break}
  if(picked.length===count)break;
 }
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
    if(!underwater(end.y,8,water))rough.push({dir,angle:a,power:p,score:lobScore(end)});
  }
  // Bounces are chaotic, so the cheap sweep only shortlists; the live physics settles the pick.
  rough.sort((m,n)=>n.score-m.score);
  for(const c of rough.slice(0,12)){
    const theta=c.angle*Math.PI/180,speed=300+280*c.power;
    const end=trajectory(t,from.x+c.dir*Math.cos(theta)*24,from.y-9+Math.sin(theta)*22,c.dir*Math.cos(theta)*speed,Math.sin(theta)*speed,0,{fuse:3,bounce:true,water});
    if(underwater(end.y,8,water))continue;
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
// Water closes over a worm or a body only once its top (y-r) is below the surface: feet in the shallows are
// safe, a full dunk drowns. Game, body physics, AI sandbox and AI forecasts all use this one rule.
export const underwater=(y,r,water)=>y-r>water;
export const wormDrowned=(w,water)=>underwater(w.y,R,water);
// Fixed-step integration: the same sequence of steps runs at any frame rate and in the forecast.
export const BODY_STEP=1/120;
export function stepBody(t,b,dt,opts={}){
  const events={impact:0};b.acc=(b.acc||0)+dt;
  // The water check runs every step, so a body dipping under and bouncing back out is caught in game and forecast alike.
  const water=opts.water??Infinity;
  while(!b.sunk&&b.acc>=BODY_STEP-1e-9){b.acc-=BODY_STEP;events.impact=Math.max(events.impact,fixedStep(t,b,BODY_STEP,opts));if(underwater(b.y,b.r||0,water))b.sunk=true;if(b.resting)b.acc=0}
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
