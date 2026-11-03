// Original canvas artwork for Crater Crew. The collision shape remains in engine.js.
import {FONT} from './scenery.js';
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
const OUT='#5a1d38',SKIN='#f7a8bb',SKIN_SHADE='#e07c9a',BELLY='#ffdbe4',INK='#26181f';
function rrect(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.lineTo(x+w-r,y);c.arc(x+w-r,y+r,r,-Math.PI/2,0);c.lineTo(x+w,y+h-r);c.arc(x+w-r,y+h-r,r,0,Math.PI/2);c.lineTo(x+r,y+h);c.arc(x+r,y+h-r,r,Math.PI/2,Math.PI);c.lineTo(x,y+r);c.arc(x+r,y+r,r,Math.PI,Math.PI*1.5);c.lineTo(x+r,y)}
// Filled shape with a dark cartoon outline.
function blob(c,x,y,rx,ry,fill,rot=0,line=1.8){oval(c,x,y,rx+line,ry+line,OUT,rot);oval(c,x,y,rx,ry,fill,rot)}
function box(c,x,y,w,h,fill,r=2){rrect(c,x,y,w,h,r);c.fillStyle=fill;c.fill();c.strokeStyle=INK;c.lineWidth=1.6;c.lineJoin='round';c.stroke()}

function heldWeapon(c,weapon,face,aim,phase){
 if(!weapon)return;
 c.save();c.lineJoin='round';
 if(weapon==='jetpack'){
  box(c,-face*25-(face>0?0:0),-12,13,27,'#5c7d96',5);box(c,-face*24,-13,11,7,'#9fc4d2',3);box(c,-face*23,6,9,9,'#2b4254',2);
  if(phase==='jetpack'){c.fillStyle='#ffd45e';c.beginPath();c.moveTo(-face*21,15);c.lineTo(-face*28,36);c.lineTo(-face*14,15);c.fill();c.fillStyle='#ff7b2b';c.beginPath();c.moveTo(-face*21,15);c.lineTo(-face*25,28);c.lineTo(-face*17,15);c.fill()}
 }else if(weapon==='airstrike'){
  box(c,face>0?9:-25,-5,16,17,'#3d6a8e',3);box(c,face>0?12:-22,-1,10,7,'#a6e0e2',2);stroke(c,INK,2.4,[[face*19,-5],[face*22,-19]]);oval(c,face*22,-20,3.6,3.6,'#ffd75e');
 }else if(weapon==='grenade'){
  blob(c,face*19,-5,8,9.5,'#5b9a54',0,1.6);stroke(c,'#b7e0a6',1.6,[[face*15,-7],[face*23,-7]]);stroke(c,'#b7e0a6',1.6,[[face*15,-2],[face*23,-2]]);box(c,face>0?17:-22,-17,5,5,'#d5d2af',1);
 }else if(weapon==='dynamite'){
  box(c,face>0?12:-25,-15,13,23,'#d24b49',3);box(c,face>0?13:-24,-12,11,4,'#f1dcb6',1);stroke(c,INK,2.4,[[face*18,-15],[face*21,-21]]);oval(c,face*21,-22,2.8,2.8,'#ffd75e');
 }else if(weapon==='punch'){
  blob(c,face*21,1,11,9,'#f7a8bb',0,1.8);stroke(c,OUT,1.6,[[face*17,-4],[face*17,6]]);stroke(c,OUT,1.6,[[face*22,-5],[face*22,6]]);
 }else{
  c.rotate(Math.atan2(Math.sin(aim),Math.cos(aim)*face));
  if(weapon==='bazooka'){
   box(c,1,-8,40,16,'#4f7a5a',6);box(c,0,-10,9,20,'#2f4a40',3);box(c,34,-10,10,20,'#e0b26a',3);box(c,12,7,11,9,'#2b3f3c',2);stroke(c,'#a9d3a0',2,[[13,-4],[31,-4]]);
  }else{
   box(c,4,-6,40,11,'#5d6b72',3);box(c,5,3,23,8,'#c9945a',3);box(c,12,9,9,8,'#2b3f4c',2);box(c,38,-7,8,13,'#d9c78f',2);
  }
 }
 c.restore();
}
function grave(c,x,y,team){
 c.save();c.translate(x,y);oval(c,0,1,15,4.5,'#6b4a35');
 c.lineJoin='round';c.beginPath();c.moveTo(-9,0);c.lineTo(-9,-17);c.arc(0,-17,9,Math.PI,0);c.lineTo(9,0);c.lineTo(-9,0);c.fillStyle='#b9bfc7';c.fill();c.strokeStyle=INK;c.lineWidth=2;c.stroke();
 stroke(c,'#7c838d',2,[[0,-24],[0,-10]]);stroke(c,'#7c838d',2,[[-4,-19],[4,-19]]);
 stroke(c,TEAM_COLORS[team?1:0],3,[[-9,-3],[9,-3]]);
 c.restore();
}

export function drawCharacter(c,w,{active=false,weapon=null,aim=0,phase='ready',now=0,graveY=null}={}){
 const team=TEAM_COLORS[w.team?1:0];
 if(!w.alive){if(graveY!=null)grave(c,w.x,graveY,w.team);return}
 const f=w.face||1,walking=w.grounded&&Math.abs(w.vx)>24,swing=walking?Math.sin(now*.017+w.id)*2:0;
 const br=Math.sin(now*.004+w.id*1.3),bounce=walking?Math.abs(Math.sin(now*.017+w.id))*1.6:0,hurt=w.flash>0;
 c.save();c.translate(w.x,w.y-bounce*.8);c.scale(.82,.82);
 if(hurt&&Math.sin(w.flash*30)>0)c.globalAlpha=.65;
 oval(c,0,20+bounce,19,4.5,'#10284466');
 // Curled tail, then four chubby segments stacked toward the head, lighter belly on the facing side.
 blob(c,-f*12,15,6.5,4.2,SKIN_SHADE,-.4*f);
 const hy=-13+br*.7-bounce*.4,hx=f*2.5;
 const seg=[[-f*1,12,10.2],[0,3.5,10.8],[f*1,-4.5,11.2]];
 for(const [x,y,r] of seg)oval(c,x,y,r+1.9,r+1.9,OUT);
 oval(c,hx,hy,12.4+br*.25,12.8,OUT);
 for(const [x,y,r] of seg)oval(c,x,y,r,r,SKIN);
 oval(c,hx,hy,10.6+br*.25,11,SKIN);
 for(const [x,y,r] of seg)oval(c,x+f*3.2,y+2.2,r*.6,r*.55,BELLY);
 stroke(c,SKIN_SHADE,1.6,[[-f*8,7.8],[0,10],[f*9,7.8]]);stroke(c,SKIN_SHADE,1.6,[[-f*9,-.3],[0,2],[f*10,-.3]]);stroke(c,SKIN_SHADE,1.6,[[-f*8,-8],[0,-6.4],[f*9,-8]]);
 oval(c,hx-f*5,hy-2,5.5,7,SKIN_SHADE,.3*f);oval(c,hx-f*3,hy-4,3,4,SKIN);
 // Team sweatband with a knot at the back.
 stroke(c,OUT,6,[[hx-f*10,hy-5],[hx,hy-9],[hx+f*10,hy-6]]);stroke(c,team,3.4,[[hx-f*10,hy-5],[hx,hy-9],[hx+f*10,hy-6]]);
 blob(c,hx-f*12,hy-3,3.6,2.2,team,-.6*f,1.2);blob(c,hx-f*13,hy+1,3.2,2,team,.7*f,1.2);
 // Big white eyes, pupils follow the aim, periodic blink.
 const vx=active?Math.cos(aim)*f:f*.8,vy=active?Math.sin(aim):.12,blink=((now+w.id*911)%3600)<140;
 for(const ex of [hx+f*.5,hx+f*8]){
  if(blink){stroke(c,INK,2,[[ex-4,hy+1],[ex+4,hy+1]]);continue}
  blob(c,ex,hy+.5,4.8,6.2,'#ffffff',0,1.2);oval(c,ex+vx*1.9,hy+.8+vy*2.4,2.5,2.9,INK);oval(c,ex+vx*1.9-.7,hy-.3+vy*2.4,.9,.9,'#ffffff');
  stroke(c,OUT,1.7,hurt||w.hp<35?[[ex-4,hy-9],[ex+4,hy-7]]:[[ex-4,hy-8],[ex+4,hy-8.8]]);
 }
 if(hurt)oval(c,hx+f*5,hy+9,2.6,3,OUT);else stroke(c,OUT,1.8,[[hx+f*2,hy+8.5],[hx+f*5,hy+10.2],[hx+f*9,hy+8.2]]);
 oval(c,hx-f*1,hy+6,2.4,1.6,'#ff8fa6aa');
 // Little feet.
 blob(c,-f*6,19+swing*.4,5.5,3,SKIN_SHADE,0,1.4);blob(c,f*7,19-swing*.4,5.5,3,SKIN_SHADE,0,1.4);
 if(active){heldWeapon(c,weapon,f,aim,phase);blob(c,f*10,3,4.4,4.2,SKIN,0,1.4)}
 c.restore();
 // Name and HP in team colour with a dark outline, bold rounded face.
 c.save();c.textAlign='center';c.lineJoin='round';c.font='bold 12px '+FONT;c.lineWidth=3.6;c.strokeStyle=INK;c.fillStyle=team;
 const nm=w.name.toUpperCase();c.strokeText(nm,w.x,w.y-46);c.fillText(nm,w.x,w.y-46);
 rrect(c,w.x-14,w.y-41,28,13,5);c.fillStyle=team;c.fill();c.lineWidth=2;c.strokeStyle=INK;c.stroke();
 c.font='bold 11px '+FONT;c.fillStyle='#fff';c.lineWidth=2;c.strokeStyle='#00000066';c.strokeText(String(Math.max(0,Math.ceil(w.hp))),w.x,w.y-31);c.fillText(String(Math.max(0,Math.ceil(w.hp))),w.x,w.y-31);
 if(active){const by=w.y-64+Math.sin(now*.008)*3;c.beginPath();c.moveTo(w.x-8,by-9);c.lineTo(w.x+8,by-9);c.lineTo(w.x,by+3);c.lineTo(w.x-8,by-9);c.fillStyle=team;c.fill();c.lineWidth=2.4;c.strokeStyle=INK;c.stroke()}
 c.restore();
}

export function drawOrdnance(c,p){
 c.save();
 // Smoke-puff trail: older points are bigger and fainter.
 const n=p.trail.length,fire=p.type==='bazooka'||p.type==='airstrike';
 for(let k=0;k<n;k+=2){const q=k/n,pt=p.trail[k];c.globalAlpha=.15+.55*q;oval(c,pt.x,pt.y,(p.type==='airstrike'?5:3.5)*(.5+q),(p.type==='airstrike'?5:3.5)*(.5+q),fire?(q>.8?'#ffd37a':'#f1ece0'):'#ffffffcc')}
 c.globalAlpha=1;
 c.translate(p.x,p.y);c.rotate(Math.atan2(p.vy,p.vx));c.lineJoin='round';c.lineWidth=2;c.strokeStyle='#26181f';
 if(p.type==='grenade'){oval(c,0,0,9,10,'#26181f');oval(c,0,0,7.4,8.4,'#5b9a54');stroke(c,'#b7e0a6',1.6,[[-5,-2],[5,-2]]);stroke(c,'#b7e0a6',1.6,[[-5,3],[5,3]]);c.fillStyle='#d5cfaa';c.fillRect(4,-12,5,5);c.strokeRect?.(4,-12,5,5)}
 else if(p.type==='dynamite'){c.fillStyle='#d24b49';c.fillRect(-9,-8,18,16);c.strokeRect?.(-9,-8,18,16);c.fillStyle='#f1dcb6';c.fillRect(4,-8,4,16);stroke(c,'#26181f',2.2,[[0,-8],[3,-14]]);oval(c,3,-15,3.2,3.2,'#ffd75e')}
 else{
  const big=p.type==='airstrike';const s=big?1.15:1;
  c.fillStyle='#ffb02e';c.beginPath();c.moveTo(-10*s,-4);c.lineTo(-20*s-Math.random()*5,0);c.lineTo(-10*s,4);c.fill();
  c.fillStyle='#26181f';c.beginPath();c.moveTo(-11*s,-6);c.lineTo(-15*s,-10);c.lineTo(-5*s,-6);c.lineTo(-5*s,6);c.lineTo(-15*s,10);c.lineTo(-11*s,6);c.fill();
  c.fillStyle='#e03d3a';c.beginPath();c.moveTo(-12*s,-5);c.lineTo(-14*s,-9);c.lineTo(-6*s,-5);c.fill();c.beginPath();c.moveTo(-12*s,5);c.lineTo(-14*s,9);c.lineTo(-6*s,5);c.fill();
  oval(c,-1*s,0,11*s,5.4,'#26181f');oval(c,-1*s,0,9.6*s,4,'#f4efe2');
  c.fillStyle='#26181f';c.beginPath();c.moveTo(14*s,0);c.lineTo(5*s,-6);c.lineTo(5*s,6);c.fill();c.fillStyle='#e03d3a';c.beginPath();c.moveTo(12.5*s,0);c.lineTo(6.5*s,-4);c.lineTo(6.5*s,4);c.fill();
 }
 c.restore();
}
