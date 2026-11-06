// Original canvas artwork for Crater Crew. The collision shape remains in engine.js.
import {FONT} from './scenery.js';
import {clamp} from './engine.js';
const TAU=Math.PI*2;
const oval=(c,x,y,rx,ry,color,rotation=0)=>{c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,rotation,0,TAU);c.fill()};
function stroke(c,color,width,points){c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.beginPath();c.moveTo(...points[0]);for(const p of points.slice(1))c.lineTo(...p);c.stroke()}

export function drawEnvironment(c,state,groundY){
 c.save();
 const map=state.map;
 for(let i=0;i<10;i++){
  const x=68+i*172+(i%3)*28,y=groundY(state.terrain,x)+8;
  c.save();c.translate(x,y);
  if(map===0){
   // Coves: eroded stone towers, driftwood and tufts of sea grass.
   c.fillStyle='#5d6f77';c.beginPath();c.moveTo(-28,0);c.lineTo(-22,-24-i%3*8);c.lineTo(-13,-30);c.lineTo(-5,-15);c.lineTo(3,-34);c.lineTo(15,-29);c.lineTo(23,0);c.fill();
   c.fillStyle='#354f5c';c.fillRect(-3,-19,7,12);stroke(c,'#d5b86b',3,[[-18,-7],[-24,-13],[-26,-19]]);
   if(i%3===0){stroke(c,'#655447',6,[[32,0],[30,-81]]);stroke(c,'#655447',3,[[30,-74],[53,-52]]);c.fillStyle='#d5c5a06b';c.beginPath();c.moveTo(32,-72);c.lineTo(67,-43);c.lineTo(37,-41);c.fill();stroke(c,'#7b5b47',3,[[17,-17],[37,-27],[64,-24]])}
  }else if(map===1){
   // A rusted industrial ridge, with pipes and chipped vents.
   c.fillStyle='#483e50';c.fillRect(-20,-31,35,36);c.fillStyle='#a76c61';c.fillRect(-15,-38,24,9);c.fillStyle='#2a3444';c.fillRect(-7,-64,9,30);
   stroke(c,'#c18c69',3,[[-27,-5],[-27,-23],[-15,-23]]);oval(c,18,-41,10,5,'#d4adb0aa');
   if(i%3===1){stroke(c,'#3c3947',5,[[36,0],[36,-104],[86,-104],[86,-55]]);stroke(c,'#b28d72',3,[[38,-93],[83,-93]]);c.fillStyle='#ca90735c';c.fillRect(60,-52,26,13);oval(c,85,-42,7,7,'#342f42')}
  }else{
   // Low gravity crystalline outcrops on the atoll.
   c.fillStyle='#637aa5';c.beginPath();c.moveTo(-24,0);c.lineTo(-13,-44);c.lineTo(-2,-17);c.lineTo(7,-61);c.lineTo(24,0);c.fill();
   stroke(c,'#c9dcff',2,[[-13,-42],[-8,-18],[0,-13]]);stroke(c,'#9dbbe4',2,[[7,-57],[16,-9]]);
   if(i%3===2){stroke(c,'#6e80a1',5,[[34,0],[34,-67],[63,-83]]);oval(c,65,-86,24,9,'#a0b2cf66',-.35);stroke(c,'#d3e1f5',2,[[48,-84],[77,-93]])}
  }
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
