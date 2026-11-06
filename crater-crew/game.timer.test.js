// Turn timer audit: in every phase the turn either counts down or waits on purpose (Broker request, flight,
// fuses), and every path hands the turn over. Same DOM-less harness as game.integration.test.js, in its own
// process. localStorage throws here (blocked by the browser), and the game must still work.
import test from 'node:test';
import assert from 'node:assert/strict';
import {W,H,R,WATER} from './engine.js';

const elements=new Map();
function element(id){if(!elements.has(id))elements.set(id,{id,style:{},classList:{add(){},remove(){},toggle(){}},dataset:{},listeners:{},textContent:'',innerHTML:'',value:'0',disabled:false,addEventListener(event,fn){this.listeners[event]=fn},appendChild(){},setPointerCapture(){},getBoundingClientRect(){return {left:0,top:0,width:1600,height:800}}});return elements.get(id)}
const context={createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4)}},putImageData(){},drawImage(){},fillRect(){},beginPath(){},arc(){},ellipse(){},fill(){},stroke(){},moveTo(){},lineTo(){},bezierCurveTo(){},setLineDash(){},save(){},restore(){},translate(){},scale(){},rotate(){},fillText(){},strokeText(){},createLinearGradient(){return {addColorStop(){}}}};
element('game').getContext=()=>context;
globalThis.document={getElementById:element,createElement:tag=>tag==='canvas'?{width:0,height:0,getContext:()=>context}:element('created-'+Math.random()),querySelectorAll:()=>[]};
globalThis.window={listeners:{},addEventListener(event,fn){this.listeners[event]=fn}};
const sessionItems=new Map();
globalThis.sessionStorage={getItem:key=>sessionItems.get(key)??null,setItem:(key,value)=>sessionItems.set(key,value),removeItem:key=>sessionItems.delete(key)};
Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw new DOMException('blocked','SecurityError')}});
// The frame loop: keep the callback so a test can drive it like the browser does.
let frame=null,frames=0;globalThis.requestAnimationFrame=fn=>{frame=fn;frames++};
globalThis.fetch=async()=>{throw new TypeError('offline')};

await import('./game.js');
const {state,scheme,newGame,beginTurn,fire,update,explosion,aiAct}=window.__craterCrew;
Object.assign(scheme,{mines:0,barrels:0,crateChance:0});
const PLAIN=WATER-155;
function flatten(t,top=PLAIN){t.top.fill(top);for(let y=0;y<H;y++)t.mask.fill(y>=top?1:0,y*W,(y+1)*W)}
const run=(seconds,stop=()=>false)=>{for(let t=0;t<seconds&&!stop();t+=.02)update(.02)};
// A human worm on the plain under a rock ceiling, hooked to it with the ninja rope.
function roped(seed=4242){
 delete state.controllers;state.aiDriver='local';newGame(0,1,seed);const t=state.terrain;flatten(t);
 for(let y=PLAIN-420;y<PLAIN-380;y++)t.mask.fill(1,y*W+300,y*W+1300);
 const w=state.active;w.x=700;w.y=PLAIN-R-1;w.grounded=true;
 for(const o of state.worms)if(o!==w){o.y=PLAIN-R-1;o.x=o.team?2600+o.id*60:1700+o.id*60;o.grounded=true}
 state.selected='rope';state.dir=1;state.aim=-1.2;fire();run(1,()=>state.rope?.state!=='flying');
 assert.equal(state.rope?.state,'attached','hooked');return w;
}

test('END TURN while hanging on the rope lets go and hands the turn over',()=>{
 roped();element('end-turn').onclick();
 run(8,()=>state.team===1);
 assert.equal(state.team,1,`turn handed over (phase ${state.phase}, rope ${state.rope?.state})`);assert.equal(state.rope,null);
});

test('the last rival dying while our worm hangs on the rope still ends the match',()=>{
 const w=roped(4343);const rivals=state.worms.filter(o=>o.team===1);rivals.slice(1).forEach(o=>{o.alive=false});
 const last=rivals[0];explosion(last.x,last.y,60,200,w.id);assert.equal(last.alive,false);
 run(8,()=>state.ended);
 assert.equal(state.ended,true,`match over (phase ${state.phase}, rope ${state.rope?.state})`);
});

test('an AI worm that dies while walking (reposition) ends its turn at once, not when the clock runs out',()=>{
 delete state.controllers;state.aiDriver='local';newGame(0,1,5151);flatten(state.terrain);beginTurn(1);
 const w=state.active;w.x=1400;w.y=PLAIN-R-1;w.grounded=true;
 state.aiTarget=w.x+150;state.aiMoveTime=2;state.phase='reposition';update(.02);
 // Fully under water (since #25 a worm drowns only when submerged), as after a slip off the shore.
 w.y=state.waterLevel+3*R;w.grounded=false;update(.02);assert.equal(w.alive,false);
 run(4,()=>state.team===0);
 assert.equal(state.team,0,`turn handed over (phase ${state.phase}, timer ${state.timer.toFixed(1)})`);
});

test('USE LOCAL AI after a Broker outage plays the turn locally instead of asking the Broker again',async()=>{
 const prior=globalThis.fetch;let posts=0;
 globalThis.fetch=async(_url,options)=>{if(options?.method==='POST')posts++;return new Response(JSON.stringify({status:'unavailable',error:'Broker not configured.'}),{status:503})};
 try{
  newGame(0,1,980);state.controllers=['human','hard'];beginTurn(1);aiAct();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(state.phase,'broker-error');assert.equal(posts,1);
  element('broker-local').onclick();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(posts,1,'no second Broker request');assert.notEqual(state.phase,'broker-wait');assert.notEqual(state.phase,'broker-error');
  run(15,()=>state.team===0);assert.equal(state.team,0,'the local AI finished the turn');
 }finally{state.brokerController?.abort();globalThis.fetch=prior;delete state.controllers;newGame(0,1,981)}
});

test('an error inside one frame does not stop the game loop',()=>{
 assert.ok(frame,'loop scheduled');newGame(0,1,61);state.running=true;
 state.projectiles.push({type:'bazooka',x:500,y:100,vx:0,vy:0,fuse:7,r:6,source:0,trail:null});
 const before=frames;assert.throws(()=>frame(performance.now()+16));
 assert.ok(frames>before,'next frame still requested');state.projectiles=[];
});

test('the clock runs out in every phase where the turn is played and the turn is handed over',()=>{
 for(const setup of [
  ['ready, idle',()=>{}],
  ['ready, charging',()=>{state.selected='bazooka';state.charging=true}],
  ['ready, shotgun second shot',()=>{state.selected='shotgun';state.dir=-1;state.aim=-1.3;fire();assert.equal(state.shotgunLeft,1)}],
  ['ready, after a teleport',()=>{state.selected='teleport';state.airTarget=state.active.x+60;state.airTargetY=PLAIN-200;fire();assert.equal(state.phase,'ready')}],
  ['jetpack',()=>{state.selected='jetpack';fire();state.jetTime=99}],
 ]){
  const [name,go]=setup;delete state.controllers;newGame(0,1,7070);flatten(state.terrain);
  for(const o of state.worms){o.y=PLAIN-R-1;o.grounded=true}state.worms.find(o=>o.team===1).x=2600;
  go();const t0=state.timer;update(.5);assert.ok(state.timer<t0,`${name}: clock runs`);
  state.timer=.1;run(10,()=>state.team===1);assert.equal(state.team,1,`${name}: turn handed over (phase ${state.phase})`);
  assert.equal(state.charging,false);
 }
});

test('the clock stands still while the Broker thinks, in flight/fuse resolution and after game over',async()=>{
 const prior=globalThis.fetch;
 globalThis.fetch=(_url,options)=>new Promise((_resolve,reject)=>options?.signal?.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError'))));// a Broker request that never answers (the 28 s deadline aborts it)
 try{
  newGame(0,1,990);state.controllers=['human','ultra'];beginTurn(1);aiAct();assert.equal(state.phase,'broker-wait');
  const t0=state.timer;run(3);assert.equal(state.timer,t0,'broker-wait freezes the clock on purpose');
  state.brokerController?.abort();await new Promise(resolve=>setImmediate(resolve));assert.equal(state.phase,'broker-error');
 }finally{globalThis.fetch=prior;delete state.controllers}
 newGame(0,1,991);flatten(state.terrain);state.selected='dynamite';fire();assert.equal(state.phase,'retreat');
 const t1=state.timer;run(10,()=>state.team===1);assert.equal(state.timer,t1,'retreat and resolving keep the clock');assert.equal(state.team,1);
 window.__craterCrew.finish(0);const t2=state.timer;update(1);assert.equal(state.timer,t2);assert.equal(state.phase,'ended');
 element('rematch').onclick();assert.equal(state.phase,'ready');assert.equal(state.running,true);assert.equal(state.rope,null);
 const t3=state.timer;update(.5);assert.ok(state.timer<t3,'rematch clock runs');
});

test('with localStorage blocked the setup and sound controls still work',()=>{
 window.__craterCrew.chooseController(1,'human');
 element('music-on').checked=false;element('effects-on').checked=true;element('effects-volume').value='30';
 assert.doesNotThrow(()=>{element('music-on').onchange();element('effects-volume').oninput();element('map-choice').onchange()});
 element('start').onclick();assert.deepEqual(state.controllers,['human','human']);assert.equal(state.musicEnabled,false);assert.equal(state.fxVolume,.3);
 delete state.controllers;state.sound=false;
});

test('a new match never inherits the rope of the previous one',()=>{
 newGame(0,1,62);state.rope={state:'attached',pivots:[{x:10,y:10}],fixed:0};state.aiRope={t:0};
 newGame(0,1,63);assert.equal(state.rope,null);assert.equal(state.aiRope,null);
});
