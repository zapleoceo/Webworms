// Procedural soil texture for Crater Crew: baked once per map/seed, then reused by every crater rebuild.
import {seeded} from './engine.js';
export const hexRgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
function disc(over,W,H,cx,cy,rx,ry,rot,col){
 const cs=Math.cos(rot),sn=Math.sin(rot),m=Math.ceil(Math.max(rx,ry))+1;
 for(let y=Math.max(0,Math.floor(cy-m));y<=Math.min(H-1,Math.ceil(cy+m));y++)for(let x=Math.max(0,Math.floor(cx-m));x<=Math.min(W-1,Math.ceil(cx+m));x++){
  const dx=x-cx,dy=y-cy,u=(dx*cs+dy*sn)/rx,v=(-dx*sn+dy*cs)/ry;if(u*u+v*v<=1)over[y*W+x]=col}
}
// Rocks, bones, roots, crystals and embers embedded in the soil. Per theme palette in `pal`.
// `over` holds one byte per pixel: 0 = plain soil, otherwise an index into `colors` ([r,g,b] each).
export function bakeSoil(map,seed,W,H,pal){
 const shade=new Uint8Array(W*H),over=new Uint8Array(W*H),r=seeded((seed*2654435761^(map+1)*0x51ed27)>>>0);
 const colors=[null],index=new Map(),pack=h=>{if(!index.has(h)){index.set(h,colors.length);colors.push(hexRgb(h))}return index.get(h)};
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
 for(let i=0;i<Math.round(140*area);i++){const [x,y]=place(),s=2.4+r()*6.5,rot=r()*3;
  disc(over,W,H,x,y,s+1.8,s*.8+1.8,rot,outline);disc(over,W,H,x,y,s,s*.8,rot,rock[0]);disc(over,W,H,x-s*.25,y-s*.25,s*.55,s*.4,rot,rock[1])}
 for(let i=0;i<Math.round(8*area);i++){const [x,y]=place(),rot=r()*Math.PI,l=5+r()*4,cx=Math.cos(rot),cy=Math.sin(rot);
  disc(over,W,H,x,y,l+1.6,3,rot,boneEdge);for(const s of [-1,1]){disc(over,W,H,x+cx*l*s,y+cy*l*s,3.6,3.6,0,boneEdge)}
  disc(over,W,H,x,y,l,1.6,rot,bone);for(const s of [-1,1]){disc(over,W,H,x+cx*l*s,y+cy*l*s,2.4,2.4,0,bone)}}
 for(let i=0;i<Math.round(6*area);i++){let [x,y]=place(),a=r()*6.28;const len=20+r()*30,pts=[];
  for(let s=0;s<len;s++){x+=Math.cos(a)*1.6;y+=Math.sin(a)*1.6;a+=(r()-.5)*.4;pts.push(x,y)}
  for(let k=0;k<pts.length;k+=2)disc(over,W,H,pts[k],pts[k+1],2.2,2.2,0,outline);
  for(let k=0;k<pts.length;k+=2)disc(over,W,H,pts[k],pts[k+1],1.1,1.1,0,root[0])}
 if(pal.spark)for(let i=0;i<Math.round(380*area);i++){const [x,y]=place();disc(over,W,H,x,y,1.4+r()*1.4,1.4,0,pack(pal.spark[i%pal.spark.length]))}
 return {shade,over,colors};
}

export const grassDepths=W=>{const g=new Uint8Array(W);for(let x=0;x<W;x++)g[x]=Math.round(8+3*Math.sin(x*.31)+2*Math.sin(x*.9));return g};
// Paints solid terrain pixels into `p` (RGBA). `rect` {x0,x1,y0} limits work to columns x0..x1 from row y0 to the bottom:
// depth-based shading means everything below a carved crater can change, so the area extends to the bottom edge.
// With rect.local, `p` holds just that area ((x1-x0+1) x (H-y0) pixels) instead of the whole W x H image.
export function paintTerrain(p,run,grass,m,soil,th,W,H,rect=null){
 const shade=soil.shade,over=soil.over,colors=soil.colors;
 const a=hexRgb(th.dirt),dark=hexRgb(th.dark),g0=hexRgb(th.grass[0]),g1=hexRgb(th.grass[1]),ol=hexRgb(th.outline);
 const x0=rect?Math.max(0,rect.x0):0,x1=rect?Math.min(W-1,rect.x1):W-1,y0=rect?Math.max(0,rect.y0):0;
 for(let x=x0;x<=x1;x++){let n=0;for(let y=y0-1;y>=0&&m[y*W+x];y--)n++;run[x]=n}
 const local=Boolean(rect?.local),pw=x1-x0+1;
 for(let y=y0;y<H;y++)for(let x=x0;x<=x1;x++){
  const i=y*W+x,k=local?((y-y0)*pw+x-x0)*4:i*4;
  if(!m[i]){run[x]=0;p[k]=p[k+1]=p[k+2]=p[k+3]=0;continue}
  const dep=run[x]++;let r,g,b;
  if((x>2&&!m[i-3])||(x<W-3&&!m[i+3])||(y>2&&!m[i-3*W])||(y<H-3&&!m[i+3*W])){r=ol[0];g=ol[1];b=ol[2]}
  else if(dep<grass[x]){const f=dep/grass[x],q=f*f,hl=dep<3?1.12:1;r=(g0[0]+(g1[0]-g0[0])*q)*hl;g=(g0[1]+(g1[1]-g0[1])*q)*hl;b=(g0[2]+(g1[2]-g0[2])*q)*hl}
  else if(over[i]){const q=colors[over[i]];r=q[0];g=q[1];b=q[2]}
  // Soil strata: gently waving bands that follow the depth, lighter and darker by turns, over the depth gradient.
  else{const d=Math.min(1,Math.max(0,(dep-30)/230)),s=shade[i]/128,cs=dep<grass[x]+5?.8:1,band=Math.sin((dep+9*Math.sin(x*.013)+5*Math.sin(x*.041))*.075),st=1+.075*band+(band>.92?.06:0);r=(a[0]+(dark[0]-a[0])*d)*s*cs*st;g=(a[1]+(dark[1]-a[1])*d)*s*cs*st;b=(a[2]+(dark[2]-a[2])*d)*s*cs*st}
  p[k]=r;p[k+1]=g;p[k+2]=b;p[k+3]=255;
 }
}
