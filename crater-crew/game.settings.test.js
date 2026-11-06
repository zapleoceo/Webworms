// The game applies admin settings (fetched from /api/settings at startup) to new matches.
// Same DOM-less harness as game.integration.test.js, in its own process so its settings do not leak there.
import test from 'node:test';
import assert from 'node:assert/strict';
import {W,WATER,seeded} from './engine.js';
import {defaultSettings} from './settings.js';

const elements=new Map();
function element(id){if(!elements.has(id))elements.set(id,{id,style:{},attrs:{},classList:{add(){},remove(){},toggle(){}},dataset:{},listeners:{},textContent:'',innerHTML:'',value:'0',disabled:false,hidden:true,addEventListener(event,fn){this.listeners[event]=fn},setAttribute(k,v){this.attrs[k]=String(v)},removeAttribute(k){delete this.attrs[k]},appendChild(){},setPointerCapture(){},getBoundingClientRect(){return {left:0,top:0,width:1600,height:800}}});return elements.get(id)}
const context={createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4)}},putImageData(){},drawImage(){},fillRect(){},beginPath(){},closePath(){},arc(){},ellipse(){},fill(){},stroke(){},moveTo(){},lineTo(){},bezierCurveTo(){},setLineDash(){},save(){},restore(){},translate(){},scale(){},rotate(){},fillText(){},strokeText(){},createLinearGradient(){return {addColorStop(){}}}};
element('game').getContext=()=>context;
globalThis.document={getElementById:element,createElement:tag=>tag==='canvas'?{width:0,height:0,getContext:()=>context}:element('created-'+Math.random()),querySelectorAll:()=>[]};
globalThis.window={listeners:{},addEventListener(event,fn){this.listeners[event]=fn}};
const sessionItems=new Map();
globalThis.sessionStorage={getItem:key=>sessionItems.get(key)??null,setItem:(key,value)=>sessionItems.set(key,value),removeItem:key=>sessionItems.delete(key)};
globalThis.requestAnimationFrame=()=>{};

// What the server would send: custom rules plus one sponsor.
const SPONSOR={id:'abcdef123456',name:'Acme',logoUrl:'https://s.public.blob.vercel-storage.com/sponsors/abcdef123456.png',link:'https://acme.example',weight:1,placements:['billboard','crate','banner']};
const served={...defaultSettings(),match:{turnTime:50,teleports:4},props:{mines:0,barrels:0,crateChance:0,crateHeal:40},players:{defaults:['easy','easy'],offerHard:true,offerUltra:false},audio:{music:false,musicVolume:10,effects:true,effectsVolume:80,voices:false},sponsors:[SPONSOR]};
const requested=[];
globalThis.fetch=async url=>{requested.push(String(url));if(url==='api/settings')return new Response(JSON.stringify(served),{headers:{'content-type':'application/json'}});throw new TypeError('offline')};

await import('./game.js');
const {state,rules,scheme,newGame,nextTurn,beginTurn,applySettings,render}=window.__craterCrew;
await new Promise(r=>setTimeout(r,20));// let the startup fetch settle

test('startup fetches /api/settings once and applies it before the first match',()=>{
 assert.equal(requested.filter(u=>u==='api/settings').length,1);
 assert.equal(rules.turnTime,50);assert.equal(rules.teleports,4);
 newGame(0,1,4242);
 assert.equal(state.timer,50);assert.deepEqual(state.ammo,[{teleport:4},{teleport:4}]);
 beginTurn(1);assert.equal(state.timer,50,'every turn uses the configured time');
 assert.equal(state.crateHeal,40);assert.equal(state.props.length,0,'mines 0, barrels 0');
 // Setup screen: default players and audio come from the settings when the player has not chosen yet.
 assert.match(elements.get('ai-hint').textContent,/SKY SQUAD · PC EASY.*DIRT DEVILS · PC EASY/);
 assert.equal(elements.get('music-on').checked,false);assert.equal(elements.get('effects-volume').value,'80');
});

test('defaults reproduce the built-in match exactly',()=>{
 applySettings({});
 newGame(0,1,1234);
 assert.equal(state.timer,35);assert.deepEqual(state.ammo,[{teleport:2},{teleport:2}]);
 assert.deepEqual({...scheme},{mines:8,barrels:6,crateChance:.3});assert.equal(state.crateHeal,25);
 const first=seeded((1234^0x9e3779b9)>>>0)();
 assert.equal(state.wind,(first-.5)*72,'same random draw, same ±36 start wind');
 assert.ok(state.props.length>0);
});

test('settings that arrive mid-match wait for the next match',()=>{
 applySettings({});newGame(0,1,77);assert.equal(state.running,true);
 applySettings({match:{turnTime:20,teleports:1}});
 assert.equal(rules.turnTime,35,'the running match keeps its rules');beginTurn(1);assert.equal(state.timer,35);
 newGame(0,1,78);assert.equal(state.timer,20);assert.equal(state.ammo[0].teleport,1);
});

test('sudden death round and water rise per round',()=>{
 state.running=false;applySettings({water:{suddenDeathRound:3,waterRise:20}});
 newGame(0,1,99);state.controllers=['human','easy'];
 state.team=1;state.round=1;nextTurn();assert.equal(state.round,2);assert.equal(state.waterLevel,WATER,'round 2: calm');
 state.team=1;nextTurn();assert.equal(state.round,3);assert.equal(state.waterLevel,WATER-20,'round 3: sudden death');
 state.team=1;nextTurn();assert.equal(state.waterLevel,WATER-40);
 assert.equal(state.suddenDeathRound,3);
});

test('wind start and cap',()=>{
 state.running=false;applySettings({wind:{startMax:5,turnDrift:60,cap:10}});
 for(const seed of [1,2,3,4,5]){newGame(0,1,seed);assert.ok(Math.abs(state.wind)<=5);for(let i=0;i<20;i++){beginTurn(i%2);assert.ok(Math.abs(state.windTarget)<=10);state.wind=state.windTarget}}
 state.running=false;applySettings({wind:{startMax:0,turnDrift:0,cap:0}});newGame(0,1,6);beginTurn(1);assert.equal(Math.abs(state.wind),0);assert.equal(Math.abs(state.windTarget),0);
});

test('only enabled maps are played',()=>{
 state.running=false;applySettings({maps:{enabled:[1,2]}});
 newGame(2,1,5);elements.get('new-map').onclick();assert.equal(state.map,1,'NEW MAP skips the disabled map 0');
 elements.get('map-choice').value='0';state.running=false;applySettings({maps:{enabled:[1,2]}});
 assert.equal(elements.get('map-choice').value,'1','the setup selection moves to an enabled map');
});

test('sponsors: seeded billboards, crate sponsor and the presented-by strip',()=>{
 state.running=false;applySettings({sponsors:[SPONSOR]});
 newGame(0,1,31337);const a=state.billboards.map(b=>b.x);
 assert.ok(a.length>=1&&a.length<=3);assert.ok(a.every(x=>x>0&&x<W));
 assert.ok(state.billboards.every(b=>b.sponsor.id===SPONSOR.id));
 assert.ok(state.billboards.every(b=>state.worms.every(w=>Math.abs(w.x-b.x)>=110)),'boards keep clear of the start spots');
 newGame(0,1,31337);assert.deepEqual(state.billboards.map(b=>b.x),a,'same seed, same boards');
 assert.equal(state.crateSponsor.id,SPONSOR.id);
 render();// images never load in Node: drawing skips them without throwing
 const strip=elements.get('sponsor-intro'),logo=elements.get('sponsor-intro-logo');
 assert.equal(logo.src,SPONSOR.logoUrl);assert.equal(logo.alt,'Acme');assert.equal(strip.attrs.href,'https://acme.example');
 assert.equal(strip.hidden,true,'shown only after the logo loads');logo.onload();assert.equal(strip.hidden,false);
 // Billboards are scenery: no new props, terrain or collision.
 assert.equal(state.props.some(p=>p.kind==='billboard'),false);
 state.running=false;applySettings({sponsors:[{...SPONSOR,placements:['banner']}]});newGame(0,1,31337);
 assert.deepEqual(state.billboards,[]);assert.equal(state.crateSponsor,null);
 state.running=false;applySettings({sponsors:[]});assert.equal(elements.get('sponsor-intro').hidden,true);
});

test('broken or hostile settings fall back to defaults',()=>{
 state.running=false;applySettings({match:{turnTime:'9999',teleports:-3},sponsors:[{...SPONSOR,logoUrl:'javascript:alert(1)'}],maps:{enabled:[]}});
 newGame(0,1,5);assert.equal(state.timer,35);assert.equal(state.ammo[0].teleport,2);assert.deepEqual(rules.maps,[0,1,2]);assert.deepEqual(rules.sponsors,[]);
});
