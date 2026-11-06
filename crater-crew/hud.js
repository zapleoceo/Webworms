// In-canvas HUD: timer box (bottom-left), stacked team health bars (bottom-centre), wind bar (bottom-right).
import {FONT} from './scenery.js';
import {TEAM_COLORS} from './art.js';
const INK='#1c1420',NAMES=['SKY SQUAD','DIRT DEVILS'],SEGS=8,MAX_WIND=80;
function rr(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.lineTo(x+w-r,y);c.arc(x+w-r,y+r,r,-Math.PI/2,0);c.lineTo(x+w,y+h-r);c.arc(x+w-r,y+h-r,r,0,Math.PI/2);c.lineTo(x+r,y+h);c.arc(x+r,y+h-r,r,Math.PI/2,Math.PI);c.lineTo(x,y+r);c.arc(x+r,y+r,r,Math.PI,Math.PI*1.5);c.lineTo(x+r,y)}
function plate(c,x,y,w,h,r,edge){rr(c,x,y,w,h,r);c.fillStyle='#1c1830dd';c.fill();c.lineWidth=3;c.strokeStyle=edge||INK;c.stroke()}
function text(c,s,x,y,size,color,align='center'){c.textAlign=align;c.font='bold '+size+'px '+FONT;c.lineWidth=3.5;c.lineJoin='round';c.strokeStyle=INK;c.strokeText(s,x,y);c.fillStyle=color;c.fillText(s,x,y)}
export const teamHealth=(worms,team)=>{let hp=0,n=0;for(const w of worms)if((w.team?1:0)===team){n++;if(w.alive)hp+=Math.max(0,w.hp)}return n?hp/(n*100):0};
export function drawHud(c,st,W,H,now){
 c.save();
 // timer
 const mine=!st.team,tc=TEAM_COLORS[st.team?1:0],low=st.timer<=5&&st.running&&!st.ended;
 plate(c,18,H-74,96,58,12,tc);
 text(c,String(Math.max(0,Math.ceil(st.timer))),66,H-34,34,low&&Math.floor(now/250)%2?'#ff5d52':'#ffffff');
 text(c,mine?'YOUR TURN':'AI TURN',66,H-58,11,tc);
 // health bars, one row per team
 const cx=W/2,bw=240;
 plate(c,cx-190,H-78,380,62,12);
 for(let t=0;t<2;t++){
  const y=H-70+t*26,f=teamHealth(st.worms,t);
  text(c,NAMES[t],cx-30,y+14,13,TEAM_COLORS[t],'right');
  rr(c,cx-18,y,bw,18,8);c.fillStyle='#0d0a14';c.fill();
  if(f>0){rr(c,cx-16,y+2,Math.max(10,(bw-4)*f),14,6);c.fillStyle=TEAM_COLORS[t];c.fill();rr(c,cx-14,y+3,Math.max(6,(bw-8)*f),4,2);c.fillStyle='#ffffff55';c.fill()}
  rr(c,cx-18,y,bw,18,8);c.lineWidth=3;c.strokeStyle=INK;c.stroke();
 }
 // wind: segmented bar growing left (blue) or right (red) from the centre
 const wx=W-208,wy=H-74;plate(c,wx,wy,190,58,12);
 text(c,'WIND',wx+95,wy+18,11,'#ffe9a8');
 const lit=Math.min(SEGS,Math.round(Math.abs(st.wind||0)/MAX_WIND*SEGS)),dir=(st.wind||0)<0?-1:1,mid=wx+95;
 for(let s=0;s<SEGS;s++)for(const side of [-1,1]){
  const x=side>0?mid+3+s*10:mid-3-s*10-8,on=s<lit&&side===dir;
  rr(c,x,wy+28,8,16,2);c.fillStyle=on?(side<0?'#4aa8ff':'#ff5d52'):'#3a3450';c.fill();c.lineWidth=1.5;c.strokeStyle=INK;c.stroke();
 }
 if(lit>0){const e=mid+dir*(6+lit*10);c.beginPath();c.moveTo(e,wy+25);c.lineTo(e+dir*10,wy+36);c.lineTo(e,wy+47);c.lineTo(e,wy+25);c.fillStyle=dir<0?'#4aa8ff':'#ff5d52';c.fill();c.lineWidth=2;c.strokeStyle=INK;c.stroke()}
 c.restore();
}
