import test from 'node:test';
import assert from 'node:assert/strict';
import {bakeSoil,hexRgb} from './terrain-art.js';
const pal={outline:'#2a1a1a',rock:['#887766','#bbaa99'],bone:'#eee5cc',root:['#5b3b25'],spark:['#ff8a2b']};
test('soil bake is deterministic per seed and embeds features',()=>{
 const a=bakeSoil(0,5,320,200,pal),b=bakeSoil(0,5,320,200,pal),c=bakeSoil(0,6,320,200,pal);
 assert.deepEqual(a.over,b.over);assert.notDeepEqual(a.over,c.over);
 assert.ok(a.over.some(v=>v!==0));assert.equal(a.shade.length,320*200);assert.ok(a.shade.some(v=>v>0));
 assert.deepEqual(hexRgb('#102030'),[16,32,48]);
});
import {paintTerrain,grassDepths} from './terrain-art.js';
test('dirty-rect repaint matches a full rebuild byte for byte',()=>{
 const W=240,H=160,th={dirt:'#8a5a3c',dark:'#573629',grass:['#9be84a','#3f9d2c'],outline:'#2b1a1c'};
 const soil=bakeSoil(0,9,W,H,pal),m=new Uint8Array(W*H),grass=grassDepths(W);
 for(let x=0;x<W;x++)for(let y=60+Math.round(8*Math.sin(x*.05));y<H;y++)m[y*W+x]=1;
 const inc=new Uint8ClampedArray(W*H*4),run=new Uint16Array(W);paintTerrain(inc,run,grass,m,soil,th,W,H);
 const cx=120,cy=70,r=25;for(let y=0;y<H;y++)for(let x=0;x<W;x++)if((x-cx)**2+(y-cy)**2<=r*r)m[y*W+x]=0;
 paintTerrain(inc,run,grass,m,soil,th,W,H,{x0:cx-r-6,x1:cx+r+6,y0:cy-r-6});
 const full=new Uint8ClampedArray(W*H*4);paintTerrain(full,new Uint16Array(W),grass,m,soil,th,W,H);
 assert.deepEqual(inc,full);
});
test('soil features take one byte per pixel and a local strip paints the same pixels as the full image',()=>{
 const W=200,H=120,th={dirt:'#8a5a3c',dark:'#573629',grass:['#9be84a','#3f9d2c'],outline:'#2b1a1c'};
 const soil=bakeSoil(1,4,W,H,pal),m=new Uint8Array(W*H),grass=grassDepths(W);
 assert.ok(soil.over instanceof Uint8Array);assert.ok(soil.colors.length<=8);
 for(let x=0;x<W;x++)for(let y=40+Math.round(6*Math.sin(x*.07));y<H;y++)m[y*W+x]=1;
 const full=new Uint8ClampedArray(W*H*4);paintTerrain(full,new Uint16Array(W),grass,m,soil,th,W,H);
 const x0=37,x1=121,y0=30,pw=x1-x0+1,strip=new Uint8ClampedArray(pw*(H-y0)*4);
 paintTerrain(strip,new Uint16Array(W),grass,m,soil,th,W,H,{x0,x1,y0,local:true});
 for(let y=y0;y<H;y++)assert.deepEqual(strip.subarray((y-y0)*pw*4,(y-y0+1)*pw*4),full.subarray((y*W+x0)*4,(y*W+x1+1)*4),`row ${y}`);
});
