// Original canvas artwork for Crater Crew. The collision shape remains in engine.js.
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

function heldWeapon(c,weapon,face,aim,phase){
 if(!weapon)return;
 c.save();
 if(weapon==='jetpack'){
  c.fillStyle='#35566b';c.fillRect(-face*24,-11,12,25);c.fillStyle='#93b9c5';c.fillRect(-face*24,-12,10,5);c.fillStyle='#233747';c.fillRect(-face*23,5,9,8);
  if(phase==='jetpack'){c.fillStyle='#ffe28c';c.beginPath();c.moveTo(-face*20,13);c.lineTo(-face*27,32);c.lineTo(-face*13,13);c.fill()}
 }else if(weapon==='airstrike'){
  c.fillStyle='#314e66';c.fillRect(face*9,-4,16,16);c.fillStyle='#9cd5d8';c.fillRect(face*12,-1,10,7);stroke(c,'#263b4b',2,[[face*19,-4],[face*22,-18]]);oval(c,face*22,-19,3,3,'#ffda83');
 }else if(weapon==='grenade'){
  oval(c,face*19,-5,8,9,'#496a49');stroke(c,'#bad0ac',2,[[face*15,-5],[face*23,-5]]);c.fillStyle='#d5d2af';c.fillRect(face*17,-16,5,4);
 }else if(weapon==='dynamite'){
  c.fillStyle='#c74445';c.fillRect(face*12,-14,13,22);c.fillStyle='#edd5b4';c.fillRect(face*13,-12,11,3);stroke(c,'#f9cd70',2,[[face*18,-14],[face*21,-20]]);
 }else if(weapon==='punch'){
  oval(c,face*21,1,11,9,'#efb377');stroke(c,'#a84e4a',3,[[face*13,-4],[face*18,-7],[face*23,-6]]);
 }else{
  c.rotate(Math.atan2(Math.sin(aim),Math.cos(aim)*face));
  if(weapon==='bazooka'){
   c.fillStyle='#466656';c.fillRect(1,-7,38,14);c.fillStyle='#283f3c';c.fillRect(2,-9,8,18);c.fillStyle='#d1ac76';c.fillRect(34,-9,9,18);c.fillStyle='#263a38';c.fillRect(12,7,11,8);
   stroke(c,'#9eb994',2,[[12,-4],[31,-4]]);
  }else{
   c.fillStyle='#4e5b62';c.fillRect(4,-5,38,10);c.fillStyle='#c39b71';c.fillRect(5,4,22,6);c.fillStyle='#293b48';c.fillRect(12,9,9,7);c.fillStyle='#d8c6a0';c.fillRect(37,-6,8,12);
  }
 }
 c.restore();
}

export function drawCharacter(c,w,{active=false,weapon=null,aim=0,phase='ready',now=0}={}){
 if(!w.alive)return;
 const f=w.face||1,walking=w.grounded&&Math.abs(w.vx)>24,swing=walking?Math.sin(now*.017+w.id)*2:0;
 const squash=w.grounded?1:1.08,teamColor=w.team?'#c95659':'#4ab6ae';
 c.save();c.translate(w.x,w.y);c.scale(.82,.82);
 if(w.flash>0&&Math.sin(w.flash*30)>0)c.globalAlpha=.6;
 if(active){c.setLineDash([5,5]);c.strokeStyle='#ffe5a0';c.lineWidth=2.5;c.beginPath();c.ellipse(0,1,26,29,0,0,TAU);c.stroke();c.setLineDash([])}
 oval(c,0,18,20,5,'#18344555');
 // Coiled tail and a tapered, arched silhouette rather than an oval mascot.
 c.fillStyle='#a34e60';c.beginPath();c.moveTo(-f*9,5);c.bezierCurveTo(-f*25,6,-f*28,17,-f*21,18);c.bezierCurveTo(-f*13,18,-f*9,12,-f*3,12);c.fill();
 c.fillStyle='#cb7280';c.beginPath();c.moveTo(-f*17,13);c.bezierCurveTo(-f*18,3,-f*12,-4,-f*10,-15);c.bezierCurveTo(-f*6,-31,f*9,-31,f*15,-15);c.bezierCurveTo(f*19,-4,f*17,9,f*8,15);c.bezierCurveTo(f*1,20,-f*9,19,-f*17,13);c.fill();
 c.fillStyle='#ef9ba1';c.beginPath();c.moveTo(-f*10,12);c.bezierCurveTo(-f*12,-1,-f*9,-21,0,-25);c.bezierCurveTo(f*12,-28,f*16,-12,f*14,4);c.bezierCurveTo(f*13,15,-f*2,18,-f*10,12);c.fill();
 oval(c,f*4,6,9,7,'#f4b1ac',-.25*f);
 stroke(c,'#d97982',1.6,[[-f*8,6],[-f*4,10],[0,11]]);
 // Two separate eyes, expressive lids, long nose and an actual smile.
 oval(c,f*3,-14,5,7,'#fff7e8');oval(c,f*11,-13,5.5,7.5,'#fff7e8');
 oval(c,f*5,-13,1.8,2.4,'#233449');oval(c,f*13,-12,1.8,2.4,'#233449');
 stroke(c,'#9b4c5a',1.5,[[f*1,-23],[f*6,-23]]);stroke(c,'#9b4c5a',1.5,[[f*9,-22],[f*14,-22]]);
 oval(c,f*19,-4,5.5,4,'#f2a9a0');oval(c,f*21,-5,1.4,1.2,'#d57678');
 c.strokeStyle='#9a4a57';c.lineWidth=1.6;c.beginPath();c.arc(f*10,3,4,f>0?.15:Math.PI+.15,f>0?2.5:Math.PI*2-.15);c.stroke();
 // Team colours belong to equipment; both crews are the same species.
 c.fillStyle=teamColor;c.beginPath();c.moveTo(-12,-25);c.lineTo(9,-29);c.lineTo(15,-23);c.lineTo(-13,-21);c.fill();
 c.fillStyle='#f8d289';c.fillRect(-5,-26,7,2);
 oval(c,-f*6,15+swing,7,3,'#a95861');oval(c,f*8,15-swing,7,3,'#a95861');
 if(active){heldWeapon(c,weapon,f,aim,phase);oval(c,f*10,3,4.2,4,'#e8898b')}
 c.restore();
 c.save();c.textAlign='center';c.font='bold 10px Trebuchet MS';c.lineWidth=2.5;c.strokeStyle='#223747';c.fillStyle='#fff9e9';c.strokeText(w.name.toUpperCase(),w.x,w.y-33);c.fillText(w.name.toUpperCase(),w.x,w.y-33);
 c.fillStyle='#203a46';c.fillRect(w.x-17,w.y-29,34,4);c.fillStyle=teamColor;c.fillRect(w.x-17,w.y-29,34*w.hp/100,4);c.restore();
}

export function drawOrdnance(c,p){
 c.save();if(p.trail.length){c.beginPath();c.moveTo(p.trail[0].x,p.trail[0].y);for(const point of p.trail)c.lineTo(point.x,point.y);c.lineTo(p.x,p.y);c.strokeStyle=p.type==='bazooka'?'#f8edd0aa':'#fff6d488';c.lineWidth=p.type==='airstrike'?5:3;c.stroke()}
 c.translate(p.x,p.y);c.rotate(Math.atan2(p.vy,p.vx));
 if(p.type==='grenade'){oval(c,0,0,7,8,'#4e7659');c.fillStyle='#d5cfaa';c.fillRect(4,-10,5,4);stroke(c,'#b3d5ad',2,[[-4,0],[4,0]])}
 else if(p.type==='dynamite'){c.fillStyle='#bf4b4a';c.fillRect(-8,-7,16,14);c.fillStyle='#e7d0ae';c.fillRect(5,-7,3,14);stroke(c,'#fbd178',2,[[0,-7],[3,-13]])}
 else if(p.type==='airstrike'){c.fillStyle='#e9d3aa';c.beginPath();c.moveTo(13,0);c.lineTo(-9,-5);c.lineTo(-4,0);c.lineTo(-9,5);c.fill();c.fillStyle='#8b7470';c.fillRect(-4,-2,12,4)}
 else{c.fillStyle='#e5d9b2';c.fillRect(-10,-4,18,8);c.fillStyle='#60746d';c.beginPath();c.moveTo(15,0);c.lineTo(6,-6);c.lineTo(6,6);c.fill();c.fillStyle='#ffa968';c.beginPath();c.moveTo(-10,-4);c.lineTo(-18,0);c.lineTo(-10,4);c.fill()}
 c.restore();
}
