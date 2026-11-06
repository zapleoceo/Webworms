import test from 'node:test';
import assert from 'node:assert/strict';
import {teamHealth} from './hud.js';
test('team health fraction counts only living hp per team',()=>{
 const w=[{team:0,alive:true,hp:100},{team:0,alive:false,hp:0},{team:1,alive:true,hp:50},{team:1,alive:true,hp:50}];
 assert.equal(teamHealth(w,0),.5);assert.equal(teamHealth(w,1),.5);assert.equal(teamHealth([],0),0);
});
test('hud health bars stay inside the dark panel (full and empty bars)',async()=>{
 const {drawHud}=await import('./hud.js'),W=1600,H=800;
 const bb=p=>({x0:Math.min(...p.map(a=>a[0])),x1:Math.max(...p.map(a=>a[0])),y0:Math.min(...p.map(a=>a[1])),y1:Math.max(...p.map(a=>a[1]))});
 for(const hp of [100,0]){
  let pts=[];const fills=[],strokes=[];
  const c={lineWidth:1,fillStyle:'',strokeStyle:'',save(){},restore(){},beginPath(){pts=[]},moveTo(x,y){pts.push([x,y])},lineTo(x,y){pts.push([x,y])},
   arc(x,y,r){pts.push([x-r,y-r],[x+r,y+r])},fillText(){},strokeText(){},
   fill(){fills.push({s:this.fillStyle,...bb(pts)})},stroke(){strokes.push({lw:this.lineWidth,...bb(pts)})}};
  drawHud(c,{team:0,timer:30,running:true,ended:false,wind:0,worms:[{team:0,alive:hp>0,hp},{team:1,alive:hp>0,hp}]},W,H,0);
  const panel=fills.find(f=>f.s==='#1c1830dd'&&f.x1-f.x0===380),cx=(panel.x0+panel.x1)/2;
  assert.ok(panel.y0<40&&panel.x0<40,'team panel sits in the top-left corner, clear of the worms');
  const bars=[...fills,...strokes].filter(d=>d!==panel&&d.x0>=cx-20&&d.x0<=cx&&d.x1-d.x0<380);
  assert.ok(bars.length>=4);
  const maxX=Math.max(...bars.map(d=>d.x1+(d.lw||0)/2));
  assert.ok(maxX<=panel.x1-1.5-15,'bar right edge '+maxX+' overflows panel '+panel.x1);
 }
});
