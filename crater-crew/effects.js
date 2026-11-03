// Chunky cartoon explosions: white flash, orange fireball lobes, rising smoke puffs and a comic burst.
import {FONT} from './scenery.js';
const TAU=Math.PI*2;
const WORDS=['POW!','BOOM!','WHAM!','KABOOM!'];
export function makeBlast(x,y,r,rand){
 const puffs=[];for(let i=0;i<7;i++)puffs.push({a:rand()*TAU,d:.25+rand()*.55,s:.28+rand()*.22});
 return {x,y,r,t:0,word:WORDS[Math.floor(rand()*WORDS.length)],puffs,rot:(rand()-.5)*.5};
}
function disc(c,x,y,r,color){c.fillStyle=color;c.beginPath();c.arc(x,y,r,0,TAU);c.fill()}
export function drawBlast(c,b){
 const t=b.t,r=b.r;
 // smoke first (behind the fire)
 if(t>.1){const q=Math.min(1,(t-.1)/1.1);
  for(const p of b.puffs){const px=b.x+Math.cos(p.a)*r*p.d*(.6+q*.5),py=b.y+Math.sin(p.a)*r*p.d*.7-q*46,pr=r*(p.s+q*.34);
   c.globalAlpha=.7*(1-q);disc(c,px,py,pr+3,'#2a2230');disc(c,px,py,pr,'#6f6679');disc(c,px-pr*.25,py-pr*.3,pr*.55,'#9a92a6')}
  c.globalAlpha=1}
 if(t<.12){c.globalAlpha=1-t/.12;disc(c,b.x,b.y,r*(.8+t*4),'#ffffff');c.globalAlpha=1}
 if(t<.6){const q=t/.6,e=.55+.55*Math.sqrt(q);
  c.globalAlpha=Math.min(1,1.6-q*1.4);
  disc(c,b.x,b.y,r*e+3,'#7a2410');for(const p of b.puffs)disc(c,b.x+Math.cos(p.a)*r*.5*e,b.y+Math.sin(p.a)*r*.5*e,r*.4*e+3,'#7a2410');
  disc(c,b.x,b.y,r*e,'#ff5a1f');for(const p of b.puffs)disc(c,b.x+Math.cos(p.a)*r*.5*e,b.y+Math.sin(p.a)*r*.5*e,r*.4*e,'#ff5a1f');
  disc(c,b.x,b.y,r*e*.72,'#ff9a2a');disc(c,b.x,b.y,r*e*.46*(1-q*.6),'#ffe27a');
  c.globalAlpha=1}
 if(r>=55&&t<.45){
  const pop=Math.min(1,t/.07),s=pop*(1+.15*Math.sin(t*14))*(t>.33?(.45-t)/.12:1),R=r*.95*s;
  c.save();c.translate(b.x,b.y-r*.15);c.rotate(b.rot);c.beginPath();
  for(let i=0;i<20;i++){const a=i/20*TAU,k=i%2?R*.62:R;i?c.lineTo(Math.cos(a)*k,Math.sin(a)*k):c.moveTo(Math.cos(a)*k,Math.sin(a)*k)}
  c.lineTo(R,0);c.fillStyle='#ffe135';c.fill();c.lineJoin='round';c.lineWidth=4;c.strokeStyle='#8a1d12';c.stroke();
  c.textAlign='center';c.font='bold '+Math.round(24*Math.max(.2,s))+'px '+FONT;c.lineWidth=4;c.strokeStyle='#fff';c.strokeText(b.word,0,8*s);c.fillStyle='#d6281b';c.fillText(b.word,0,8*s);
  c.restore()}
}
