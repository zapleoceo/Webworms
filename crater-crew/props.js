// Map props that make the landscape interactive: proximity mines, fuel barrels and parachute health crates.
// They use the same body physics as grenades, so they settle, roll, and drop when the ground is blasted away.
import {W,R,WATER,groundY,stepBody,clamp,seeded} from './engine.js';
import {drawFitted} from './sponsors.js';

const BODY={
 mine:{restitution:.25,impactFriction:.5,rollDrag:6,restOnSlope:true},
 barrel:{restitution:.15,impactFriction:.35,rollDrag:8,restOnSlope:true},
 crate:{restitution:.1,impactFriction:.3,rollDrag:9,restOnSlope:true},
};
export const PROP_BLAST={mine:{radius:62,damage:42},barrel:{radius:80,damage:48},crate:{radius:38,damage:12}};
const MINE_TRIGGER=46,MINE_FUSE=1.1,CRATE_HEAL=25,PICKUP=30;

// Scatter mines and barrels on dry, level ground, away from the worms' starting spots.
export function placeProps(t,worms,seed,{mines=8,barrels=6}={}){
 const rand=seeded((seed^0x2c1b3c6d)>>>0),props=[],taken=worms.map(w=>w.x);
 const spot=()=>{for(let tries=0;tries<300;tries++){const x=120+rand()*(W-240),g=groundY(t,x);if(g>WATER-150||Math.abs(groundY(t,x+10)-groundY(t,x-10))>8)continue;if(taken.some(o=>Math.abs(o-x)<90))continue;taken.push(x);return {x,g}}return null};
 for(let i=0;i<mines+barrels;i++){const s=spot();if(!s)break;const kind=i<mines?'mine':'barrel',r=kind==='mine'?7:12;
  props.push({kind,x:s.x,y:s.g-r-1,vx:0,vy:0,r,resting:false,fuse:0,armed:false,hp:kind==='barrel'?30:1,boom:0})}
 return props;
}

// A health crate drifts down under a parachute somewhere over dry land.
export function dropCrate(state,rand){
 for(let tries=0;tries<30;tries++){const x=150+rand()*(W-300);if(groundY(state.terrain,x)>WATER-80)continue;
  state.props.push({kind:'crate',x,y:Math.max(-40,groundY(state.terrain,x)-520),vx:0,vy:0,r:11,resting:false,parachute:true,hp:10,boom:0});return true}
 return false;
}

// Called from explosion(): push props, hurt barrels and crates, arm mines. Detonation is delayed a beat
// in updateProps so chain reactions ripple instead of recursing.
export function blastProps(state,x,y,r,damage){
 for(const p of state.props){
  if(p.dead)continue;const d=Math.hypot(p.x-x,p.y-y);if(d>r*1.3)continue;
  const push=(1-d/(r*1.3))*420;p.vx+=(p.x-x)/(d||1)*push;p.vy+=(p.y-y)/(d||1)*push-110;p.resting=false;p.parachute=false;
  if(d<r){p.hp-=damage*(1-d/r);if(p.kind==='mine'){p.armed=true;p.fuse=Math.min(p.fuse||MINE_FUSE,.25)}else if(p.hp<=0&&!p.boom)p.boom=.18}
 }
}

// Physics, triggers and pickups; `api.explode(x,y,radius,damage)` and `api.heal(worm,amount)` come from the game.
export function updateProps(state,dt,api){
 for(const p of state.props){
  if(p.dead)continue;
  if(p.parachute){p.vy=Math.min(p.vy+300*dt,90);p.vx=(state.wind||0)*.25;p.x=clamp(p.x+p.vx*dt,20,W-20);p.y+=p.vy*dt;if(p.y+p.r>=groundY(state.terrain,p.x)-1){p.parachute=false;p.y=groundY(state.terrain,p.x)-p.r-1}}
  else stepBody(state.terrain,p,dt,{body:BODY[p.kind],water:state.waterLevel});
  if(p.sunk||p.y>state.waterLevel){p.dead=true;api.splash?.(p.x,state.waterLevel);continue}
  if(p.kind==='mine'){
   if(!p.armed&&state.worms.some(w=>w.alive&&Math.hypot(w.x-p.x,w.y-p.y)<MINE_TRIGGER)){p.armed=true;p.fuse=MINE_FUSE;api.beep?.()}
   if(p.armed){p.fuse-=dt;if(p.fuse<=0){p.dead=true;api.explode(p.x,p.y,PROP_BLAST.mine.radius,PROP_BLAST.mine.damage)}}
  }else if(p.boom){p.boom-=dt;if(p.boom<=0){p.dead=true;api.explode(p.x,p.y,PROP_BLAST[p.kind].radius,PROP_BLAST[p.kind].damage)}}
  else if(p.kind==='crate'&&!p.parachute){const w=state.worms.find(w=>w.alive&&Math.hypot(w.x-p.x,w.y-p.y)<PICKUP+R*.5);if(w){p.dead=true;api.heal?.(w,state.crateHeal??CRATE_HEAL)}}
 }
 state.props=state.props.filter(p=>!p.dead);
}
// The turn should not hand over while a mine is ticking or a barrel is about to go.
// A crate still drifting down does not hold the turn; a ticking mine or a barrel about to blow does.
export const propsBusy=state=>state.props.some(p=>p.armed||p.boom>0||(!p.parachute&&!p.resting&&Math.hypot(p.vx,p.vy)>25));

const INK='#1c1420';
const oval=(c,x,y,rx,ry,col)=>{c.fillStyle=col;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill()};
// opts.crateLogo: a loaded sponsor image shown on crates instead of the green cross.
// opts.view: the camera's world rectangle; props outside it are skipped.
export function drawProps(c,props,now,{crateLogo=null,view=null}={}){
 for(const p of props){
  if(view&&(p.x+70<view.x0||p.x-70>view.x1||p.y+30<view.y0||p.y-70>view.y1))continue;
  c.save();c.translate(p.x,p.y);c.lineJoin='round';
  if(p.kind==='mine'){
   // Flat dome mine with three studs and a light that blinks fast once armed.
   oval(c,0,1,p.r+2.5,p.r*.7+2,INK);oval(c,0,1,p.r+1,p.r*.7,'#4a5560');oval(c,0,-1,p.r*.55,p.r*.32,'#7d8b96');
   for(const sx of [-5,0,5])oval(c,sx,-p.r*.45,1.4,1.4,'#2b3138');
   const on=p.armed?Math.floor(now/90)%2:Math.floor(now/700)%2;oval(c,0,-p.r*.62,2,2,on?'#ff4b3e':'#5a1714');
  }else if(p.kind==='barrel'){
   // Upright fuel drum: olive body, two ribs, a hazard band.
   c.fillStyle=INK;c.fillRect(-p.r-2,-p.r-4,p.r*2+4,p.r*2+6);c.fillStyle='#6f8a3c';c.fillRect(-p.r,-p.r-2,p.r*2,p.r*2+2);
   c.fillStyle='#f2c230';c.fillRect(-p.r,-3,p.r*2,6);c.fillStyle=INK;for(let x=-p.r+2;x<p.r;x+=6){c.fillRect(x,-3,3,6)}
   c.fillStyle='#55702c';c.fillRect(-p.r,-p.r+3,p.r*2,2);c.fillRect(-p.r,p.r-4,p.r*2,2);c.fillStyle='#9fbd5e';c.fillRect(-p.r+3,-p.r,3,p.r*2-2);
  }else{
   // Wooden crate with a white-on-green cross; a striped canopy while it floats down.
   if(p.parachute){c.strokeStyle=INK;c.lineWidth=1.4;c.beginPath();c.moveTo(-p.r,-p.r);c.lineTo(-22,-44);c.moveTo(p.r,-p.r);c.lineTo(22,-44);c.stroke();
    c.beginPath();c.ellipse(0,-46,26,14,0,Math.PI,0);c.fillStyle='#f4efe2';c.fill();c.lineWidth=2;c.stroke();
    c.fillStyle='#ff9f3a';c.beginPath();c.ellipse(0,-46,9,14,0,Math.PI,0);c.fill()}
   c.fillStyle=INK;c.fillRect(-p.r-2,-p.r-2,p.r*2+4,p.r*2+4);c.fillStyle='#c88a4a';c.fillRect(-p.r,-p.r,p.r*2,p.r*2);
   c.fillStyle='#a76c34';c.fillRect(-p.r,-p.r,p.r*2,3);c.fillRect(-p.r,p.r-3,p.r*2,3);
   if(crateLogo){c.fillStyle='#fff6e0';c.fillRect(-8,-8,16,16);drawFitted(c,crateLogo,0,0,14,14)}
   else{c.fillStyle='#3fa55c';c.fillRect(-6,-6,12,12);c.fillStyle='#ffffff';c.fillRect(-1.6,-4.5,3.2,9);c.fillRect(-4.5,-1.6,9,3.2)}
  }
  c.restore();
 }
}
