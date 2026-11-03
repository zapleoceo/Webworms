// Procedural soil texture for Crater Crew: baked once per map/seed, then reused by every crater rebuild.
import {seeded} from './engine.js';
export const hexRgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
const pack=h=>{const [r,g,b]=hexRgb(h);return ((255<<24)|(b<<16)|(g<<8)|r)>>>0};
function disc(over,W,H,cx,cy,rx,ry,rot,col){
 const cs=Math.cos(rot),sn=Math.sin(rot),m=Math.ceil(Math.max(rx,ry))+1;
 for(let y=Math.max(0,Math.floor(cy-m));y<=Math.min(H-1,Math.ceil(cy+m));y++)for(let x=Math.max(0,Math.floor(cx-m));x<=Math.min(W-1,Math.ceil(cx+m));x++){
  const dx=x-cx,dy=y-cy,u=(dx*cs+dy*sn)/rx,v=(-dx*sn+dy*cs)/ry;if(u*u+v*v<=1)over[y*W+x]=col}
}
// Rocks, bones, roots, crystals and embers embedded in the soil. Per theme palette in `pal`.
export function bakeSoil(map,seed,W,H,pal){
 const shade=new Uint8Array(W*H),over=new Uint32Array(W*H),r=seeded((seed*2654435761^(map+1)*0x51ed27)>>>0);
 const sx1=new Float32Array(W),sx2=new Float32Array(W),sy1=new Float32Array(H),sy2=new Float32Array(H);
 const p1=r()*6,p2=r()*6;
 for(let x=0;x<W;x++){sx1[x]=Math.sin(x*.021+p1);sx2[x]=Math.sin(x*.067+p2)}
 for(let y=0;y<H;y++){sy1[y]=Math.sin(y*.027+p2);sy2[y]=Math.sin(y*.083+p1)}
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const grain=((x*73856093^y*19349663)>>>0)%97/97,blot=sx1[x]*.5+sy1[y]*.5+sx2[x]*sy2[y]*.6,fleck=grain>.955?-.2:grain<.03?.16:0;
  shade[y*W+x]=Math.max(0,Math.min(255,Math.round((.9+grain*.14+blot*.07+fleck)*128)));
 }
 const area=W*H/1280000,outline=pack(pal.outline),rock=pal.rock.map(pack),bone=pack(pal.bone),boneEdge=pack(pal.outline),root=pal.root.map(pack);
 const place=()=>[r()*W,160+r()*(H-160)];
 for(let i=0;i<Math.round(210*area);i++){const [x,y]=place(),s=3+r()*9,rot=r()*3;
  disc(over,W,H,x,y,s+1.8,s*.8+1.8,rot,outline);disc(over,W,H,x,y,s,s*.8,rot,rock[0]);disc(over,W,H,x-s*.25,y-s*.25,s*.55,s*.4,rot,rock[1])}
 for(let i=0;i<Math.round(26*area);i++){const [x,y]=place(),rot=r()*Math.PI,l=11+r()*8,cx=Math.cos(rot),cy=Math.sin(rot);
  disc(over,W,H,x,y,l+2,4.5,rot,boneEdge);for(const s of [-1,1]){disc(over,W,H,x+cx*l*s,y+cy*l*s,6,6,0,boneEdge)}
  disc(over,W,H,x,y,l,2.6,rot,bone);for(const s of [-1,1]){disc(over,W,H,x+cx*l*s,y+cy*l*s,4.2,4.2,0,bone)}}
 for(let i=0;i<Math.round(44*area);i++){let [x,y]=place(),a=r()*6.28;const len=30+r()*60,pts=[];
  for(let s=0;s<len;s++){x+=Math.cos(a)*1.6;y+=Math.sin(a)*1.6;a+=(r()-.5)*.4;pts.push(x,y)}
  for(let k=0;k<pts.length;k+=2)disc(over,W,H,pts[k],pts[k+1],3.3,3.3,0,outline);
  for(let k=0;k<pts.length;k+=2)disc(over,W,H,pts[k],pts[k+1],1.8,1.8,0,root[0])}
 if(pal.spark)for(let i=0;i<Math.round(380*area);i++){const [x,y]=place();disc(over,W,H,x,y,1.4+r()*1.4,1.4,0,pack(pal.spark[i%pal.spark.length]))}
 return {shade,over};
}
