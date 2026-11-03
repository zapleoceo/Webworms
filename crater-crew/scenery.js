// Sky, parallax scenery, ambient particles and water: original cartoon artwork drawn with Canvas 2D.
export const FONT='"Arial Rounded MT Bold","Trebuchet MS","Segoe UI",Verdana,sans-serif';
const TAU=Math.PI*2;
const fx={cloud:0};
const oval=(c,x,y,rx,ry,color,rot=0)=>{c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,rot,0,TAU);c.fill()};
function stroke(c,color,width,pts){c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.beginPath();c.moveTo(...pts[0]);for(const p of pts.slice(1))c.lineTo(...p);c.stroke()}
function lin(c,y0,y1,stops){const g=c.createLinearGradient(0,y0,0,y1);stops.forEach((s,i)=>g.addColorStop(i/(stops.length-1),s));return g}
function ridge(c,W,H,base,amp,f1,f2,ph,color,jag=0){
 c.fillStyle=color;c.beginPath();c.moveTo(-40,H);
 for(let x=-40;x<=W+40;x+=8){const j=jag?Math.abs(Math.sin(x*f2*2+ph))*jag:Math.sin(x*f2+ph*2)*amp*.28;c.lineTo(x,base-Math.sin(x*f1+ph)*amp-j)}
 c.lineTo(W+40,H);c.fill();
}
function palm(c,x,y,s,color){
 stroke(c,color,5*s,[[x,y],[x+7*s,y-30*s],[x+3*s,y-62*s]]);
 for(let i=0;i<6;i++){const a=-Math.PI/2+(i-2.5)*.6;c.save();c.translate(x+3*s,y-62*s);c.rotate(a);oval(c,22*s,0,24*s,5*s,color);c.restore()}
}
function tri(c,pts,color){c.fillStyle=color;c.beginPath();c.moveTo(...pts[0]);for(const p of pts.slice(1))c.lineTo(...p);c.fill()}

// Pre-renders sky and three transparent silhouette layers once per map (cheap per-frame drawImage).
export function bakeBackground(makeCanvas,map,th,W,H){
 const mk=w=>{const cv=makeCanvas();cv.width=w;cv.height=H;return [cv,cv.getContext('2d')]};
 const [sky,c]=mk(W);c.fillStyle=lin(c,0,H*.78,th.sky);c.fillRect(0,0,W,H);
 const sunX=map===2?1230:1240,sunY=map===2?150:210,sr=map===2?52:78;
 c.save();c.fillStyle=th.sun;
 for(let i=5;i>0;i--){c.globalAlpha=.07;c.beginPath();c.arc(sunX,sunY,sr+i*22,0,TAU);c.fill()}
 c.globalAlpha=1;c.beginPath();c.arc(sunX,sunY,sr,0,TAU);c.fill();
 if(map===2){c.fillStyle=th.sky[0];c.beginPath();c.arc(sunX+22,sunY-12,sr*.82,0,TAU);c.fill();c.fillStyle='#ffffffc0';for(let i=0;i<70;i++){c.fillRect((i*211+37)%W,(i*127+11)%330,1+i%3,1+i%3)}}
 c.restore();
 const layers=[];
 for(let k=0;k<3;k++){
  const [cv,g]=mk(W+80);g.translate(40,0);const base=[470,520,575][k],col=th.ridge[k];
  if(map===0){
   ridge(g,W,H,base,[46,38,22][k],[.0045,.0062,.009][k],[.011,.014,.02][k],k*1.7+.4,col);
   if(k===1)for(let i=0;i<5;i++){const x=150+i*330+40,y=base-Math.sin(x*.0062+3.8)*38+6;tri(g,[[x-22,y+10],[x-14,y-48-i%2*16],[x-3,y-24],[x+7,y-62-i%3*8],[x+24,y+10]],col)}
   if(k===2)for(let i=0;i<4;i++){const x=90+i*420+i%2*60;palm(g,x,base-Math.sin(x*.009+3.8)*22+10,1.1-i%2*.2,col)}
  }else if(map===1){
   ridge(g,W,H,base,[60,44,26][k],[.0035,.0058,.01][k],[.01,.02,.03][k],k*2.1+1,col,[0,18,26][k]);
   if(k===0)for(let i=0;i<3;i++){const x=240+i*520,y=base-Math.sin(x*.0035+1)*60-6;tri(g,[[x-110,y+40],[x-24,y-110],[x+24,y-110],[x+110,y+40]],col);oval(g,x,y-111,25,7,'#ff7a3a');oval(g,x,y-135,30,22,'#6b4a5e88');oval(g,x+18,y-170,38,26,'#6b4a5e55')}
   if(k===2)for(let i=0;i<4;i++){const x=120+i*400,y=base-24;g.fillStyle=col;g.fillRect(x-26,y-70,52,80);g.fillRect(x+26,y-110,14,120);oval(g,x+33,y-124,16,12,'#4a3a5a88')}
  }else{
   ridge(g,W,H,base,[50,36,22][k],[.004,.0066,.01][k],[.012,.02,.03][k],k*2.6+.7,col,[10,22,30][k]);
   if(k===0)for(let i=0;i<6;i++){const x=90+i*270,y=base-Math.sin(x*.004+.7)*50;tri(g,[[x-18,y+20],[x-2,y-70-i%3*24],[x+16,y+20]],col)}
   if(k===1)for(let i=0;i<3;i++){const x=300+i*500,y=170+i*40;tri(g,[[x-70,y],[x+70,y],[x+10,y+34],[x-20,y+22]],col);oval(g,x,y-4,70,8,th.ridge[2])}
   if(k===2)for(let i=0;i<4;i++)palm(g,70+i*430,base+8,1.05,col);
  }
  layers.push(cv);
 }
 return {sky,layers};
}
export function drawBackdrop(c,st,bg,W,t,dt){
 c.drawImage(bg.sky,0,0);
 fx.cloud=(fx.cloud+(6+st.wind*.9)*dt+W+520)%(W+520);
 const col=st.map===2?'#c9d8ff30':'#ffffffcc';
 for(let i=0;i<6;i++){const x=((i*337+fx.cloud*(1+i%3*.35))%(W+520))-260,y=70+(i*83)%220,s=.8+i%3*.35;
  oval(c,x,y,64*s,19*s,col);oval(c,x-34*s,y+6*s,40*s,15*s,col);oval(c,x+30*s,y-9*s,38*s,16*s,col)}
 for(let k=0;k<3;k++)c.drawImage(bg.layers[k],-40+Math.sin(t*.00018+k*2)*(3+k*5),0);
}
// Falling leaves / ash / sparkles steered by state.wind. Mutates the cosmetic decor list only.
export function drawAmbient(c,st,th,W,H,t,dt){
 const m=st.map,wind=st.wind||0;
 for(const d of st.decor){
  d.y+=(m===2?10+d.r*3:m===1?22+d.r*5:30+d.r*7)*dt;d.x+=(wind*(.9+d.r*.12)+Math.sin(t*.001+d.phase)*(m===0?22:10))*dt;
  if(d.y>H-60){d.y=-8;d.x=(d.x*7+d.phase*500)%W}
  if(d.x<-20)d.x+=W+40;else if(d.x>W+20)d.x-=W+40;
  const al=.3+d.r*.14;c.globalAlpha=al;
  if(m===0){c.save();c.translate(d.x,d.y);c.rotate(t*.002+d.phase);oval(c,0,0,d.r*1.3+1.2,d.r*.65+.6,th.fx[(d.phase*10|0)%3]);c.restore()}
  else if(m===1){oval(c,d.x,d.y,d.r*.5+.5,d.r*.5+.5,d.phase>3.4?'#ff9a4a':'#b8a6b4')}
  else{const s=(.7+d.r*.48)*(.6+.4*Math.sin(t*.004+d.phase*3));c.fillStyle='#e8f6ff';c.fillRect(d.x-s,d.y-.6,s*2,1.2);c.fillRect(d.x-.6,d.y-s,1.2,s*2)}
  c.globalAlpha=1;
 }
}
// Layered, animated wave rows. Back rows sit behind the terrain, front rows overlap its foot.
export function drawWater(c,st,th,W,H,t,front){
 const wl=st.waterLevel,rows=th.water;
 if(!front){c.fillStyle=lin(c,wl,H,[rows[1],rows[3],rows[4]]);c.fillRect(0,wl+14,W,H-wl)}
 for(let k=front?3:0;k<(front?5:3);k++){
  const y0=wl+k*9-9,amp=6.5-k*.5,sp=.0011+k*.00035,wy=x=>y0+Math.sin(x*.016+t*sp+k*1.9)*amp+Math.sin(x*.041-t*sp*1.7+k)*2;
  c.fillStyle=rows[k];if(front)c.globalAlpha=.94;
  c.beginPath();c.moveTo(-10,H);for(let x=-10;x<=W+10;x+=16)c.lineTo(x,wy(x));c.lineTo(W+10,H);c.fill();c.globalAlpha=1;
  c.strokeStyle=k===0?'#ffffff':'#d4f8f4';c.globalAlpha=k===0?1:.6;c.lineWidth=k===0?5:2.5;c.beginPath();
  for(let x=-10;x<=W+10;x+=16)x===-10?c.moveTo(x,wy(x)):c.lineTo(x,wy(x));
  c.stroke();c.globalAlpha=1;
  if(k===0)for(let x=10;x<W;x+=46){const bx=x+Math.sin(t*.0013+x)*8;oval(c,bx,wy(bx)+1,5,3,'#ffffff')}
  else for(let i=0;i<14;i++){const hx=(i*131+k*57+t*.012*(1+k*.3))%W;c.strokeStyle='#ffffffaa';c.lineWidth=2;c.beginPath();c.moveTo(hx,wy(hx)+9);c.lineTo(hx+24,wy(hx+24)+9);c.stroke()}
 }
}
