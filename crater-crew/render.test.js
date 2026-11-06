// Rendering cost guards: the loop stops drawing behind a modal or in a hidden tab, and render() draws only what the
// camera sees (water span, set dressing, worms, props) without changing what is on screen.
import test from 'node:test';
import assert from 'node:assert/strict';
import {W,VIEW_W,VIEW_H} from './engine.js';
import {drawWater} from './scenery.js';
import {themes} from './themes.js';

const calls=[];
const base={createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4)}},createLinearGradient(){return {addColorStop(){}}}};
const context=new Proxy(base,{get(t,k){if(k in t)return t[k];if(typeof k!=='string')return undefined;return (...a)=>{calls.push([k,...a])}},set(t,k,v){t[k]=v;return true}});
const elements=new Map();
function element(id){if(!elements.has(id)){const cls=new Set();let text='';const el={id,style:{},classList:{add:c=>cls.add(c),remove:c=>cls.delete(c),toggle(c,on){(on??!cls.has(c))?cls.add(c):cls.delete(c)},contains:c=>cls.has(c)},dataset:{},listeners:{},writes:0,innerHTML:'',value:'0',disabled:false,addEventListener(e,fn){this.listeners[e]=fn},appendChild(){},setPointerCapture(){},getBoundingClientRect(){return {left:0,top:0,width:1600,height:800}}};
 Object.defineProperty(el,'textContent',{get:()=>text,set(v){el.writes++;text=v}});elements.set(id,el)}return elements.get(id)}
element('game').getContext=()=>context;
globalThis.document={hidden:false,getElementById:element,createElement:tag=>tag==='canvas'?{width:0,height:0,getContext:()=>context}:element('created-'+Math.random()),querySelectorAll:()=>[],
 querySelector:sel=>sel==='.modal.open'?(['intro','result'].map(element).find(e=>e.classList.contains('open'))||null):null};
globalThis.window={listeners:{},addEventListener(e,fn){this.listeners[e]=fn}};
globalThis.sessionStorage={getItem:()=>null,setItem(){},removeItem(){}};
let frame=null;globalThis.requestAnimationFrame=cb=>{frame=cb};
await import('./game.js');
const {state,newGame,render,update}=window.__craterCrew;
const intro=element('intro');
const draws=()=>calls.filter(c=>['fill','stroke','fillRect','drawImage','fillText','strokeText'].includes(c[0])).length;
function battle(seed=321){newGame(0,1,seed);intro.classList.remove('open');state.cam.auto=false;state.cam.zoom=state.cam.tz=1;for(let i=0;i<10;i++)update(1/60)}

test('the loop draws one still frame behind an open modal and none in a hidden tab',()=>{
 battle();let t=1000;const tick=dt=>{calls.length=0;frame(t+=dt);return draws()};
 assert.ok(tick(16.7)>100,'battle frames are drawn');
 intro.classList.add('open');
 assert.ok(tick(16.7)>100,'the modal gets one still frame');
 for(let i=0;i<5;i++)assert.equal(tick(16.7),0,'and nothing after it');
 intro.classList.remove('open');assert.ok(tick(16.7)>100,'drawing resumes when the modal closes');
 document.hidden=true;assert.equal(tick(16.7),0);document.hidden=false;
 assert.ok(tick(16.7)>100);
});

test('60 Hz draws every refresh, 144 Hz every other one; update() still runs every refresh',()=>{
 battle();let t=5000;const drawn=dt=>{let n=0;for(let i=0;i<20;i++){calls.length=0;frame(t+=dt);if(draws())n++}return n};
 assert.equal(drawn(16.7),20);assert.equal(drawn(6.94),10);
 const before=state.timer;frame(t+=6.94);assert.ok(state.timer<before,'the turn clock advanced on a skipped frame');
});

test('render() skips worms and props far outside the camera',()=>{
 battle();const near=state.active,far=state.worms.find(w=>w!==near&&w.alive);
 state.cam.x=Math.max(0,near.x-VIEW_W/2);state.cam.y=Math.max(0,near.y-VIEW_H/2);
 far.x=state.cam.x>W/2?200:W-200;state.props=[{kind:'barrel',x:far.x,y:far.y,r:12,vx:0,vy:0},{kind:'barrel',x:near.x+60,y:near.y,r:12,vx:0,vy:0}];
 calls.length=0;render();
 const names=calls.filter(c=>c[0]==='strokeText').map(c=>c[1]);
 assert.ok(names.includes(near.name.toUpperCase()));assert.ok(!names.includes(far.name.toUpperCase()));
 // the cull rectangle covers the whole camera window with a margin
 const v=state.view,c=state.cam;
 assert.ok(v.x0<c.x&&v.y0<c.y&&v.x1>c.x+VIEW_W/c.zoom&&v.y1>c.y+VIEW_H/c.zoom);
 // barrels: two dark rims would be drawn if both were; only the near one is
 const rims=calls.filter(c=>c[0]==='fillRect'&&c[1]===-14&&c[2]===-16&&c[3]===28).length;assert.equal(rims,1);
});

test('the HUD writes the DOM only when a value changes',()=>{
 battle();state.timer=20.5;update(0);for(const id of ['timer','wind','p-count','active-name'])element(id).writes=0;
 for(let i=0;i<10;i++)update(0);
 for(const id of ['timer','wind','p-count','active-name'])assert.equal(element(id).writes,0,id);
 state.timer=18.2;update(0);assert.equal(element('timer').textContent,'19');assert.equal(element('timer').writes,1);
});

test('water waves are drawn on the same grid points, only across the visible span',()=>{
 const st={waterLevel:1355,map:0},th=themes[0],t=12345;
 const points=view=>{calls.length=0;st.view=view;drawWater(context,st,th,W,1400,t,false);drawWater(context,st,th,W,1400,t,true);return calls.filter(c=>c[0]==='lineTo'||c[0]==='moveTo'||c[0]==='ellipse').map(c=>c.slice(0,3).join())};
 const full=points(null),view={x0:1000,x1:2000,y0:600,y1:1440},part=points(view);
 assert.ok(part.length<full.length*.45,`${part.length} of ${full.length} path points`);
 const inside=p=>{const x=Number(p.split(',')[1]);return x>=view.x0&&x<=view.x1};
 assert.deepEqual(part.filter(inside),full.filter(inside),'identical points inside the view');
 assert.equal(points({x0:1000,x1:2000,y0:0,y1:900}).length,0,'water below the view is skipped');
});
