// Original canvas artwork for Crater Crew. The collision shape remains in engine.js.
import {FONT} from './scenery.js';
import {clamp} from './engine.js';
const TAU=Math.PI*2;
const oval=(c,x,y,rx,ry,color,rotation=0)=>{c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,rotation,0,TAU);c.fill()};
function stroke(c,color,width,points){c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.beginPath();c.moveTo(...points[0]);for(const p of points.slice(1))c.lineTo(...p);c.stroke()}

// Set dressing across the whole battlefield. Spots are picked once per map and seed (level dry ground,
// clear of the worms' spawn points) and each map has its own cast of props; all of it is decoration only.
const ENV_KINDS=[['palm','palm','hut','flowers','sign','shells','palm','flowers'],['pipe','girder','warning','vent','vent','stack','girder','warning'],['crystal','crystal','mushroom','lantern','crystal','mushroom','shard','lantern']];
function envSpots(state,groundY){
 const key=state.map+':'+state.seed;if(state.envCache?.key===key)return state.envCache;
 let s=(state.seed*2654435761^(state.map+3)*97)>>>0;const rnd=()=>{s=(1664525*s+1013904223)>>>0;return s/4294967296};
 const spots=[],W=state.terrain.top.length,water=state.waterLevel??1355;
 for(let x=90;x<W-90;x+=100+rnd()*80){
  const y=groundY(state.terrain,x);if(y>water-70||Math.abs(groundY(state.terrain,x-18)-groundY(state.terrain,x+18))>28)continue;
  if(state.worms?.some(w=>Math.abs(w.x-x)<45))continue;
  // Grand Expedition changes its props zone by zone: islands, jungle, industry, crystal atoll.
  const kinds=state.map===3?[ENV_KINDS[0],['palm','flowers','mushroom','sign','palm','flowers'],ENV_KINDS[1],ENV_KINDS[2]][Math.min(3,Math.floor(x/W*4))]:ENV_KINDS[state.map]??ENV_KINDS[0];spots.push({x,kind:kinds[Math.floor(rnd()*kinds.length)],s:.8+rnd()*.5,flip:rnd()<.5?-1:1,ph:rnd()*6.28});
 }
 // Undersides of floating rock and overhangs get hanging roots/vines (sampled once).
 const hang=[],m=state.terrain.mask,Hh=m.length/W;
 for(let x=40;x<W-40;x+=26){let y=state.terrain.top[x];if(y>=Hh)continue;while(y<Hh&&m[y*W+x])y++;if(y<Hh-4&&y<water-30&&!m[(y+40)*W+x])hang.push({x,y,len:18+rnd()*34,ph:rnd()*6.28})}
 return state.envCache={key,spots,hang};
}
function palm(c,s,f,t){
 stroke(c,'#3b2418',9*s,[[0,0],[6*f*s,-40*s],[3*f*s,-86*s]]);stroke(c,'#8a5a34',6*s,[[0,0],[6*f*s,-40*s],[3*f*s,-86*s]]);
 for(let k=0;k<6;k++){const a=-Math.PI/2+(k-2.5)*.55+Math.sin(t*.0012+k)*.05,tx=3*f*s+Math.cos(a)*48*s,ty=-86*s+Math.sin(a)*22*s+22*s;
  stroke(c,'#1f4a22',7*s,[[3*f*s,-86*s],[3*f*s+Math.cos(a)*26*s,-96*s+Math.sin(a)*8*s],[tx,ty]]);stroke(c,'#5fb83a',4*s,[[3*f*s,-86*s],[3*f*s+Math.cos(a)*26*s,-96*s+Math.sin(a)*8*s],[tx,ty]])}
 oval(c,1*f*s,-84*s,5*s,5*s,'#6a3f22');oval(c,6*f*s,-82*s,5*s,5*s,'#7a4a28');
}
function hut(c,s){
 for(const x of [-22,22])stroke(c,'#3b2418',5*s,[[x*s,0],[x*s,-22*s]]);
 c.fillStyle='#2b1a1c';c.fillRect(-28*s,-46*s,56*s,26*s);c.fillStyle='#c98a4a';c.fillRect(-26*s,-44*s,52*s,22*s);c.fillStyle='#6a3f22';c.fillRect(-6*s,-36*s,12*s,14*s);
 c.fillStyle='#2b1a1c';c.beginPath();c.moveTo(-36*s,-44*s);c.lineTo(0,-70*s);c.lineTo(36*s,-44*s);c.lineTo(-36*s,-44*s);c.fill();
 c.fillStyle='#e8c46a';c.beginPath();c.moveTo(-31*s,-46*s);c.lineTo(0,-66*s);c.lineTo(31*s,-46*s);c.lineTo(-31*s,-46*s);c.fill();
 for(let k=-2;k<=2;k++)stroke(c,'#b8913f',1.5*s,[[k*12*s,-47*s],[k*5*s,-62*s]]);
}
function flowers(c,s,t){const cols=['#ff6b8a','#ffd23f','#ffffff','#b48cff'];for(let k=0;k<5;k++){const x=(k-2)*7*s,h=(10+(k%3)*5)*s,sw=Math.sin(t*.002+k)*1.5;stroke(c,'#2f6b2a',2*s,[[x,0],[x+sw,-h]]);oval(c,x+sw,-h,3.6*s,3.6*s,cols[k%4]);oval(c,x+sw,-h,1.4*s,1.4*s,'#ffe9a8')}}
function sign(c,s,f){stroke(c,'#3b2418',5*s,[[0,0],[0,-34*s]]);c.save();c.scale(f,1);c.fillStyle='#2b1a1c';c.beginPath();c.moveTo(-4*s,-40*s);c.lineTo(24*s,-40*s);c.lineTo(32*s,-33*s);c.lineTo(24*s,-26*s);c.lineTo(-4*s,-26*s);c.lineTo(-4*s,-40*s);c.fill();c.fillStyle='#d9a45a';c.fillRect(-2*s,-38*s,25*s,10*s);c.restore()}
function shells(c,s){oval(c,-8*s,-3*s,6*s,4*s,'#2b1a1c');oval(c,-8*s,-3*s,4.6*s,2.8*s,'#ffd0c2');oval(c,7*s,-3*s,5*s,3.4*s,'#2b1a1c');oval(c,7*s,-3*s,3.8*s,2.4*s,'#f3e3c0')}
function pipe(c,s,f){c.save();c.scale(f,1);stroke(c,'#1e161e',14*s,[[-30*s,0],[-30*s,-34*s],[20*s,-34*s],[20*s,-58*s]]);stroke(c,'#7a6a7e',9*s,[[-30*s,0],[-30*s,-34*s],[20*s,-34*s],[20*s,-58*s]]);stroke(c,'#a796a8',2.5*s,[[-33*s,-4*s],[-33*s,-31*s]]);c.fillStyle='#c97a3a';c.fillRect(13*s,-62*s,14*s,6*s);c.restore()}
function girder(c,s,f){c.save();c.scale(f,1);c.rotate(-.25);stroke(c,'#1e161e',10*s,[[-40*s,-4*s],[40*s,-4*s]]);stroke(c,'#c9603a',6*s,[[-40*s,-4*s],[40*s,-4*s]]);for(let k=-3;k<=3;k++)stroke(c,'#8a3a24',2*s,[[k*11*s,-7*s],[k*11*s+5*s,-1*s]]);c.restore()}
function warning(c,s){stroke(c,'#1e161e',5*s,[[0,0],[0,-26*s]]);c.fillStyle='#1e161e';c.beginPath();c.moveTo(0,-52*s);c.lineTo(17*s,-24*s);c.lineTo(-17*s,-24*s);c.lineTo(0,-52*s);c.fill();c.fillStyle='#ffd23f';c.beginPath();c.moveTo(0,-47*s);c.lineTo(13*s,-27*s);c.lineTo(-13*s,-27*s);c.lineTo(0,-47*s);c.fill();c.fillStyle='#1e161e';c.fillRect(-1.6*s,-42*s,3.2*s,9*s);c.fillRect(-1.6*s,-31*s,3.2*s,3*s)}
function vent(c,s,t){const glow=.55+.45*Math.sin(t*.004);c.globalAlpha=.35*glow;oval(c,0,-6*s,26*s,14*s,'#ff7a2b');c.globalAlpha=1;oval(c,0,-2*s,16*s,6*s,'#1e161e');oval(c,0,-3*s,11*s,3.6*s,glow>.7?'#ffd05a':'#ff8a2b');for(let k=0;k<3;k++){const y=-((t*.03+k*14+s*40)%42)*s;c.globalAlpha=.5-Math.abs(y)/(90*s);oval(c,Math.sin(t*.002+k)*5*s,y-6*s,(3+k)*s,(3+k)*s,'#8a7a86');c.globalAlpha=1}}
function stack(c,s){c.fillStyle='#1e161e';c.fillRect(-9*s,-92*s,18*s,92*s);c.fillStyle='#5b4a5e';c.fillRect(-6*s,-90*s,12*s,90*s);for(const y of [-70,-40])c.fillStyle='#c9603a',c.fillRect(-6*s,y*s,12*s,5*s);oval(c,0,-98*s,9*s,5*s,'#8a7a86aa')}
function crystal(c,s,t,ph){const glow=.6+.4*Math.sin(t*.003+ph);c.globalAlpha=.28*glow;oval(c,0,-18*s,24*s,26*s,'#8ff0ff');c.globalAlpha=1;
 for(const [x,h,w,col] of [[-9,30,7,'#7fd0ff'],[2,44,9,'#b6f0ff'],[12,26,6,'#9ad8ff']]){c.fillStyle='#161c3a';c.beginPath();c.moveTo((x-w-1.5)*s,0);c.lineTo(x*s,(-h-3)*s);c.lineTo((x+w+1.5)*s,0);c.lineTo((x-w-1.5)*s,0);c.fill();c.fillStyle=col;c.beginPath();c.moveTo((x-w)*s,0);c.lineTo(x*s,-h*s);c.lineTo((x+w)*s,0);c.lineTo((x-w)*s,0);c.fill();stroke(c,'#ffffffaa',1.4*s,[[x*s,-h*s+4*s],[(x-w*.4)*s,-4*s]])}}
function mushroom(c,s,t,ph){const glow=.6+.4*Math.sin(t*.0025+ph);stroke(c,'#161c3a',8*s,[[0,0],[1*s,-18*s]]);stroke(c,'#e8e4ff',5*s,[[0,0],[1*s,-18*s]]);c.globalAlpha=.3*glow;oval(c,0,-20*s,22*s,14*s,'#c58cff');c.globalAlpha=1;oval(c,0,-20*s,15*s,9*s,'#161c3a');oval(c,0,-21*s,13*s,7.4*s,'#b06cff');for(const [x,y] of [[-6,-23],[4,-25],[7,-20]])oval(c,x*s,y*s,1.8*s,1.6*s,'#f3e0ff')}
function lantern(c,s,t,ph){stroke(c,'#161c3a',4*s,[[0,0],[0,-44*s],[10*s,-48*s]]);stroke(c,'#161c3a',1.5*s,[[10*s,-48*s],[10*s,-40*s]]);const glow=.65+.35*Math.sin(t*.005+ph);c.globalAlpha=.35*glow;oval(c,10*s,-34*s,16*s,16*s,'#ffd27a');c.globalAlpha=1;c.fillStyle='#161c3a';c.fillRect(5*s,-40*s,10*s,12*s);c.fillStyle=glow>.8?'#fff2a8':'#ffd27a';c.fillRect(7*s,-38*s,6*s,8*s)}
function shard(c,s,f){c.save();c.scale(f,1);c.rotate(.5);c.fillStyle='#161c3a';c.fillRect(-5*s,-30*s,10*s,30*s);c.fillStyle='#6d7ea6';c.fillRect(-3*s,-28*s,6*s,27*s);c.restore()}
export function drawEnvironment(c,state,groundY){
 if(!state.terrain)return;const {spots,hang}=envSpots(state,groundY),t=state.envClock=(state.envClock||0)+16;
 c.save();c.lineCap='round';c.lineJoin='round';
 // Hanging roots / vines under floating rock, swaying a little.
 const vine=state.map===1?'#3a2a2a':state.map===2?'#2c3a66':'#2f5a26',leaf=state.map===2?'#8ff0d2':state.map===1?'#6a4a3a':'#6fbf3a';
 for(const h of hang){const sw=Math.sin(t*.0012+h.ph)*4;stroke(c,'#1c1420',4,[[h.x,h.y-2],[h.x+sw*.5,h.y+h.len*.5],[h.x+sw,h.y+h.len]]);stroke(c,vine,2,[[h.x,h.y-2],[h.x+sw*.5,h.y+h.len*.5],[h.x+sw,h.y+h.len]]);oval(c,h.x+sw,h.y+h.len,2.6,2,leaf)}
 for(const p of spots){
  const y=groundY(state.terrain,p.x);if(y>=(state.waterLevel??1e9)-8)continue;
  c.save();c.translate(p.x,y+3);
  ({palm:()=>palm(c,p.s,p.flip,t),hut:()=>hut(c,p.s),flowers:()=>flowers(c,p.s,t),sign:()=>sign(c,p.s,p.flip),shells:()=>shells(c,p.s),pipe:()=>pipe(c,p.s,p.flip),girder:()=>girder(c,p.s,p.flip),warning:()=>warning(c,p.s),vent:()=>vent(c,p.s,t),stack:()=>stack(c,p.s),crystal:()=>crystal(c,p.s,t,p.ph),mushroom:()=>mushroom(c,p.s,t,p.ph),lantern:()=>lantern(c,p.s,t,p.ph),shard:()=>shard(c,p.s,p.flip)}[p.kind]||(()=>{}))();
  c.restore();
 }
 c.restore();
}

export const TEAM_COLORS=['#4aa8ff','#ff5d52'];
const OUT='#3d1126',SKIN='#f7a8bb',SKIN_SHADE='#e07c9a',BELLY='#ffdbe4',INK='#26181f';
function rrect(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.lineTo(x+w-r,y);c.arc(x+w-r,y+r,r,-Math.PI/2,0);c.lineTo(x+w,y+h-r);c.arc(x+w-r,y+h-r,r,0,Math.PI/2);c.lineTo(x+r,y+h);c.arc(x+r,y+h-r,r,Math.PI/2,Math.PI);c.lineTo(x,y+r);c.arc(x+r,y+r,r,Math.PI,Math.PI*1.5);c.lineTo(x+r,y)}
// Filled shape with a dark cartoon outline.
function blob(c,x,y,rx,ry,fill,rot=0,line=2.7){oval(c,x,y,rx+line,ry+line,OUT,rot);oval(c,x,y,rx,ry,fill,rot)}
function box(c,x,y,w,h,fill,r=2){rrect(c,x,y,w,h,r);c.fillStyle=fill;c.fill();c.strokeStyle=INK;c.lineWidth=1.6;c.lineJoin='round';c.stroke()}

// Weapons held by the active worm. Coordinates are in the worm's local frame; aimed weapons rotate.
const TEAL='#2f8f86',TEAL_D='#1f5c57',ORANGE='#ff9f3a',STEEL='#8796a3',WOOD='#9a5b32';
function poly(c,points,fill){c.beginPath();c.moveTo(...points[0]);for(const p of points.slice(1))c.lineTo(...p);c.lineTo(...points[0]);c.fillStyle=fill;c.fill();c.strokeStyle=INK;c.lineWidth=1.6;c.lineJoin='round';c.stroke()}
function spark(c,x,y,now){const r=2.4+Math.sin(now*.05)*1.1;oval(c,x,y,r+2,r+2,'#ffb02e88');oval(c,x,y,r,r,'#fff2a8')}
function heldWeapon(c,weapon,face,aim,phase,now){
 if(!weapon)return;
 c.save();c.lineJoin='round';
 if(weapon==='jetpack'){
  // Twin pressure tanks with orange fins strapped to the back.
  for(const dx of [-27,-17]){const x=face>0?dx:-dx-9;box(c,x,-14,9,26,'#9fb4c6',4);box(c,x+1,-12,7,4,'#d8e6f0',2)}
  poly(c,[[-face*31,8],[-face*35,15],[-face*27,12]],ORANGE);poly(c,[[-face*13,8],[-face*9,15],[-face*17,12]],ORANGE);
  if(phase==='jetpack'){for(const dx of [-22.5,-12.5]){const x=face*dx,fl=10+Math.random()*8;c.fillStyle='#ffd45e';c.beginPath();c.moveTo(x-3.5,13);c.lineTo(x,13+fl);c.lineTo(x+3.5,13);c.fill();c.fillStyle='#ff6a2b';c.beginPath();c.moveTo(x-2,13);c.lineTo(x,13+fl*.6);c.lineTo(x+2,13);c.fill()}}
 }else if(weapon==='airstrike'){
  // Field radio with a blinking antenna light.
  box(c,face>0?8:-24,-9,16,21,'#3b4f7a',3);for(const y of [-5,-2,1])stroke(c,'#9fb3dc',1.4,[[face*11,y],[face*21,y]]);box(c,face>0?11:-21,5,10,4,ORANGE,1);
  stroke(c,INK,2.2,[[face*20,-9],[face*24,-25]]);oval(c,face*24,-26,2.8,2.8,Math.floor(now/260)%2?'#ff4b3e':'#7a1d1a');
 }else if(weapon==='grenade'){
  // Round teal charge with an orange band and a pull ring.
  blob(c,face*25,1,8.5,8.5,TEAL,0,1.6);stroke(c,ORANGE,2.6,[[face*17.5,2],[face*32.5,2]]);oval(c,face*22,-3,2.4,2,'#9fe0d6');
  box(c,face>0?22:-28,-11,6,5,'#c9cfd6',1);c.strokeStyle=INK;c.lineWidth=1.6;c.beginPath();c.arc(face*32,-10,3.4,0,Math.PI*2);c.stroke();
 }else if(weapon==='dynamite'){
  // Three-stick bundle, tied with a band, sparking fuse.
  for(const dx of [0,6,12])box(c,(face>0?10:-28)+dx,-14,6,22,'#d6453f',2);box(c,face>0?9:-29,-5,20,4,'#f1dcb6',1);
  stroke(c,INK,2,[[face*19,-14],[face*22,-19],[face*20,-23]]);spark(c,face*20,-24,now);
 }else if(weapon==='teleport'){
  // Handheld beacon with a glowing violet tip.
  box(c,face>0?10:-22,-12,12,20,'#5b4a8a',3);box(c,face>0?12:-20,-9,8,6,'#c9a2ff',2);stroke(c,INK,2,[[face*16,-12],[face*16,-20]]);oval(c,face*16,-22,4+Math.sin(now*.012)*1.2,4+Math.sin(now*.012)*1.2,'#e6d4ff');
 }else if(weapon==='punch'){
  // A padded red glove with a white cuff.
  box(c,face>0?8:-14,-6,6,13,'#f4efe2',2);blob(c,face*20,0,9.5,8.5,'#e2413b',0,1.8);oval(c,face*22,-3,3.6,2.4,'#ff8a80');stroke(c,OUT,1.4,[[face*15,4],[face*24,5]]);
 }else{
  c.rotate(Math.atan2(Math.sin(aim),Math.cos(aim)*face));
  if(weapon==='rope'){
   // Grapple launcher: stubby barrel with a three-prong hook loaded at the muzzle.
   box(c,0,-6,26,12,'#7a6a52',4);box(c,4,4,7,9,'#3a2a2a',2);stroke(c,STEEL,2.6,[[26,0],[34,0]]);stroke(c,STEEL,2.2,[[34,0],[40,-6]]);stroke(c,STEEL,2.2,[[34,0],[40,6]]);stroke(c,STEEL,2.2,[[34,0],[41,0]]);stroke(c,'#e8d7a8',1.6,[[2,-2],[22,-2]]);
  }else if(weapon==='bazooka'){
   // Teal launch tube, orange warning band, flared exhaust and a brass sight.
   box(c,-8,-8,8,16,TEAL_D,3);box(c,-2,-7,44,14,TEAL,7);box(c,14,-7,6,14,ORANGE,1);box(c,40,-9,8,18,TEAL_D,3);
   box(c,22,-13,9,6,'#ffd27a',2);box(c,10,6,7,9,'#3a2a2a',2);stroke(c,'#8fd6cc',2,[[0,-3],[12,-3]]);
  }else{
   // Blunderbuss: wooden stock, steel barrel, brass bell mouth.
   box(c,-6,-3,17,10,WOOD,4);box(c,8,-4,32,8,STEEL,3);poly(c,[[38,-5],[49,-9],[49,9],[38,5]],'#d2a94c');box(c,12,4,8,8,'#3a2a2a',2);stroke(c,'#cdd8e0',1.6,[[11,-1.5],[34,-1.5]]);
  }
 }
 c.restore();
}
// Grave: a little wooden marker on a mound, with a ribbon in the team colour.
function grave(c,x,y,team){
 c.save();c.translate(x,y);oval(c,0,1,16,5,'#6b4a35');oval(c,0,-1,12,3.6,'#8a6446');
 box(c,-2.6,-30,5.2,30,'#b98652',1.5);box(c,-10,-24,20,5.2,'#b98652',1.5);stroke(c,'#7c5534',1.2,[[-1,-28],[-1,-4]]);
 stroke(c,OUT,4.5,[[2,-21],[8,-14]]);stroke(c,TEAM_COLORS[team?1:0],2.6,[[2,-21],[8,-14]]);
 c.restore();
}

export function drawCharacter(c,w,{active=false,weapon=null,aim=0,phase='ready',now=0,graveY=null}={}){
 const team=TEAM_COLORS[w.team?1:0];
 if(!w.alive){if(graveY!=null)grave(c,w.x,graveY,w.team);return}
 // Inchworm crawl: the body bunches and stretches with distance travelled.
 const f=w.face||1,walking=Boolean(w.walking)||w.grounded&&Math.abs(w.vx)>24,cp=(w.crawl||0)*.2,hump=walking?Math.max(0,Math.sin(cp)):0,reach=walking?Math.cos(cp):0,air=!w.grounded&&w.alive?clamp(-w.vy/400,-1,1):0;
 const br=Math.sin(now*.004+w.id*1.3),hurt=w.flash>0;
 c.save();c.translate(w.x,w.y-4);c.scale(1.1,1.1);
 if(hurt&&Math.sin(w.flash*30)>0)c.globalAlpha=.65;
 oval(c,0,20,17,4,'#10284455');
 // One tapered body traced along a spine from tail tip to neck, so it reads as a single worm.
 const sp=[[-f*(16+reach*3),18+air*3],[-f*(8-hump*2),18-hump*4+air*2],[f*hump*2,14-hump*8+air],[f*3,4-hump*4],[f*2.5,-5-hump*2+br*.6]],wd=[6,12,17,19];
 for(let i=0;i<4;i++)stroke(c,OUT,wd[i]+5,[sp[i],sp[i+1]]);
 for(let i=0;i<4;i++)stroke(c,SKIN,wd[i],[sp[i],sp[i+1]]);
 for(let i=1;i<4;i++)stroke(c,BELLY,wd[i]*.32,[[sp[i][0]+f*wd[i]*.28,sp[i][1]],[sp[i+1][0]+f*wd[i]*.28,sp[i+1][1]]]);
 for(const i of [1,2]){const [x,y]=sp[i+1];stroke(c,SKIN_SHADE,1.5,[[x-wd[i]*.42,y+1],[x,y+2.6],[x+wd[i]*.42,y+1]])}
 const hx=f*3,hy=-15+br*.7-hump*2;
 oval(c,hx,hy,14,14.2,OUT);oval(c,hx,hy,11.6,11.8,SKIN);oval(c,hx+f*4,hy+5,5,3.6,BELLY);
 // Crater Crew signature: team goggles pushed up on the forehead, strap round the back.
 stroke(c,OUT,6,[[hx-f*12,hy-6],[hx+f*11,hy-10]]);stroke(c,team,3.4,[[hx-f*12,hy-6],[hx+f*11,hy-10]]);
 for(const gx of [hx-f*1,hx+f*7.5]){oval(c,gx,hy-10,5,4.4,OUT);oval(c,gx,hy-10,3.6,3,'#bfe9ff');oval(c,gx-1,hy-11,1.2,.9,'#ffffff')}
 // Eyes follow the aim and blink now and then.
 const vx=active?Math.cos(aim)*f:f*.8,vy=active?Math.sin(aim):.12,blink=((now+w.id*911)%3600)<140,worried=hurt||w.hp<35;
 for(const ex of [hx-f*.5,hx+f*7.5]){
  if(blink){stroke(c,INK,2,[[ex-3.5,hy+1],[ex+3.5,hy+1]]);continue}
  oval(c,ex,hy+1,5.6,6.6,OUT);oval(c,ex,hy+1,4.4,5.4,'#ffffff');oval(c,ex+vx*2,hy+1.4+vy*2.4,2.6,3,INK);oval(c,ex+vx*2-.8,hy+.4+vy*2.4,.9,.9,'#ffffff');
  stroke(c,OUT,1.7,worried?[[ex-4,hy-5.2],[ex+4,hy-3.6]]:[[ex-4,hy-4.4],[ex+4,hy-5.4]]);
 }
 // Cheeky grin with one buck tooth, or an "o" when hit.
 if(hurt)oval(c,hx+f*4,hy+8.5,2.6,3,OUT);else{stroke(c,OUT,1.8,[[hx+f*1,hy+7.5],[hx+f*4.5,hy+9.6],[hx+f*9,hy+7]]);c.fillStyle='#ffffff';c.fillRect(hx+f*4-(f>0?0:2.4),hy+8.8,2.4,2.4)}
 oval(c,hx-f*3.5,hy+5.5,2.4,1.5,'#ff8fa6aa');
 if(active){heldWeapon(c,weapon,f,aim,phase,now);blob(c,f*10,1,4.2,4,SKIN,0,1.4)}
 c.restore();
 // Name and HP in team colour with a dark outline, bold rounded face.
 c.save();c.textAlign='center';c.lineJoin='round';c.font='bold 15px '+FONT;c.lineWidth=4.2;c.strokeStyle=INK;c.fillStyle=team;
 const nm=w.name.toUpperCase();c.strokeText(nm,w.x,w.y-60);c.fillText(nm,w.x,w.y-60);
 rrect(c,w.x-17,w.y-55,34,16,6);c.fillStyle=team;c.fill();c.lineWidth=2;c.strokeStyle=INK;c.stroke();
 c.font='bold 13px '+FONT;c.fillStyle='#fff';c.lineWidth=2;c.strokeStyle='#00000066';c.strokeText(String(Math.max(0,Math.ceil(w.hp))),w.x,w.y-42.5);c.fillText(String(Math.max(0,Math.ceil(w.hp))),w.x,w.y-42.5);
 if(active){const by=w.y-82+Math.sin(now*.008)*3;c.beginPath();c.moveTo(w.x-8,by-9);c.lineTo(w.x+8,by-9);c.lineTo(w.x,by+3);c.lineTo(w.x-8,by-9);c.fillStyle=team;c.fill();c.lineWidth=2.4;c.strokeStyle=INK;c.stroke()}
 c.restore();
}

export function drawOrdnance(c,p){
 c.save();
 // Smoke-puff trail: older points are bigger and fainter.
 const n=p.trail.length,fire=p.type==='bazooka'||p.type==='airstrike',now=globalThis.performance?.now?.()??0;
 for(let k=0;k<n;k+=2){const q=k/n,pt=p.trail[k];c.globalAlpha=.15+.55*q;oval(c,pt.x,pt.y,(p.type==='airstrike'?5:3.5)*(.5+q),(p.type==='airstrike'?5:3.5)*(.5+q),fire?(q>.8?'#ffd37a':'#f1ece0'):'#ffffffcc')}
 c.globalAlpha=1;c.translate(p.x,p.y);c.lineJoin='round';
 if(p.type==='grenade'){
  // Spins with travel; resting grenades keep still.
  c.rotate((p.x+p.y)*.06);blob(c,0,0,7.5,7.5,TEAL,0,1.6);stroke(c,ORANGE,2.4,[[-7,0],[7,0]]);oval(c,-2.5,-3.5,2,1.6,'#9fe0d6');box(c,-2.5,-12,5,4.5,'#c9cfd6',1);
  oval(c,0,0,1.6,1.6,Math.floor(now/(p.fuse<1.2?90:220))%2?'#ff4b3e':'#5a1714');
 }else if(p.type==='dynamite'){
  c.rotate(Math.atan2(p.vy,p.vx)*.25);for(const dx of [-8,-2,4])box(c,dx,-9,5.5,18,'#d6453f',2);box(c,-9,-2,19,4,'#f1dcb6',1);stroke(c,INK,2,[[0,-9],[3,-14],[1,-18]]);spark(c,1,-19,now);
 }else if(p.type==='airstrike'){
  // Teardrop bomb with fins and a warning stripe, nose down along its path.
  c.rotate(Math.atan2(p.vy,p.vx));poly(c,[[-14,0],[-20,-7],[-11,-4],[-11,4],[-20,7]],TEAL_D);
  oval(c,0,0,13,7,OUT);oval(c,0,0,11.2,5.4,'#3b4f7a');box(c,-4,-5.4,3.5,10.8,ORANGE,1);oval(c,4,-2,3,1.4,'#8ea3cf');
 }else{
  // Rocket: teal body, orange nose, dark fins and a flickering exhaust.
  c.rotate(Math.atan2(p.vy,p.vx));
  c.fillStyle='#ffb02e';c.beginPath();c.moveTo(-11,-4);c.lineTo(-22-Math.random()*6,0);c.lineTo(-11,4);c.fill();c.fillStyle='#fff2a8';c.beginPath();c.moveTo(-11,-2);c.lineTo(-16-Math.random()*3,0);c.lineTo(-11,2);c.fill();
  poly(c,[[-12,-5],[-16,-10],[-6,-5]],TEAL_D);poly(c,[[-12,5],[-16,10],[-6,5]],TEAL_D);
  oval(c,-1,0,11,5.6,OUT);oval(c,-1,0,9.6,4.2,TEAL);stroke(c,'#8fd6cc',1.4,[[-7,-1.6],[4,-1.6]]);
  poly(c,[[15,0],[6,-5.4],[6,5.4]],ORANGE);
 }
 c.restore();
}
