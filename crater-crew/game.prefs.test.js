// Player preferences survive a page reload: the game is loaded, settings are changed the way a player does,
// then the page is "reloaded" (game.js evaluated again over the same localStorage). Own process, DOM-less harness.
import test from 'node:test';
import assert from 'node:assert/strict';
import {PREFS_KEY} from './prefs.js';
import {defaultSettings} from './settings.js';

const elements=new Map();
function element(id){if(!elements.has(id))elements.set(id,{id,style:{},classList:{add(){},remove(){},toggle(){}},dataset:{},listeners:{},textContent:'',innerHTML:'',value:'0',checked:false,disabled:false,hidden:true,addEventListener(event,fn){this.listeners[event]=fn},setAttribute(){},removeAttribute(){},appendChild(){},setPointerCapture(){},getBoundingClientRect(){return {left:0,top:0,width:1600,height:800}}});return elements.get(id)}
const context={createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4)}},putImageData(){},drawImage(){},fillRect(){},beginPath(){},closePath(){},arc(){},ellipse(){},fill(){},stroke(){},moveTo(){},lineTo(){},bezierCurveTo(){},setLineDash(){},save(){},restore(){},translate(){},scale(){},rotate(){},fillText(){},strokeText(){},createLinearGradient(){return {addColorStop(){}}}};
element('game').getContext=()=>context;
// The page as index.html ships it: map list and the audio panel defaults.
element('map-choice').options=[0,1,2,3].map(v=>({value:String(v)}));element('map-choice').value='0';
element('music-on').checked=true;element('effects-on').checked=true;element('music-volume').value='42';element('effects-volume').value='65';
globalThis.document={getElementById:element,createElement:tag=>tag==='canvas'?{width:0,height:0,getContext:()=>context}:element('created-'+Math.random()),querySelectorAll:()=>[]};
globalThis.window={listeners:{},addEventListener(event,fn){this.listeners[event]=fn}};
const sessionItems=new Map();
globalThis.sessionStorage={getItem:key=>sessionItems.get(key)??null,setItem:(key,value)=>sessionItems.set(key,value),removeItem:key=>sessionItems.delete(key)};
const stored=new Map();
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:k=>stored.get(k)??null,setItem:(k,v)=>stored.set(k,String(v)),removeItem:k=>stored.delete(k)}});
globalThis.requestAnimationFrame=()=>{};
globalThis.fetch=async()=>{throw new TypeError('offline')};

let reloads=0;
async function load(){await import('./game.js?load='+(reloads++));return window.__craterCrew}
// A fresh page: the controls go back to their HTML defaults before game.js runs again.
function resetPage(){element('map-choice').value='0';element('music-on').checked=true;element('effects-on').checked=true;element('music-volume').value='42';element('effects-volume').value='65'}

test('a first visit with nothing saved keeps the built-in defaults and saves nothing',async()=>{
 const g=await load();
 assert.equal(stored.size,0);
 element('start').onclick();
 assert.deepEqual(g.state.controllers,['human','easy']);assert.equal(g.state.map,0);
 assert.equal(g.state.musicEnabled,true);assert.equal(g.state.sound,true);assert.equal(g.state.musicVolume,.42);assert.equal(g.state.fxVolume,.65);
});

test('sound, volumes, players and map chosen by the player come back after a reload',async()=>{
 let g=await load();
 element('music-on').checked=false;element('music-on').onchange();
 element('effects-volume').value='20';element('effects-volume').oninput();
 element('music-volume').value='75';element('music-volume').oninput();
 g.chooseController(0,'easy');g.chooseController(1,'human');
 element('map-choice').value='2';element('map-choice').onchange();
 assert.deepEqual(JSON.parse(stored.get(PREFS_KEY)),{audio:{music:false,effects:true,musicVolume:75,effectsVolume:20},controllers:['easy','human'],map:2});

 resetPage();g=await load();
 assert.equal(element('music-on').checked,false);assert.equal(element('effects-on').checked,true);
 assert.equal(element('music-volume').value,'75');assert.equal(element('effects-volume').value,'20');assert.equal(element('map-choice').value,'2');
 // Admin defaults arriving after the load do not override what the player chose.
 g.applySettings({...defaultSettings(),audio:{music:true,musicVolume:10,effects:false,effectsVolume:5,voices:true},players:{defaults:['human','ultra'],offerHard:true,offerUltra:true}});
 assert.equal(element('music-on').checked,false);assert.equal(element('effects-volume').value,'20');
 element('start').onclick();
 assert.deepEqual(g.state.controllers,['easy','human']);assert.equal(g.state.map,2);
 assert.equal(g.state.musicEnabled,false);assert.equal(g.state.sound,true);assert.equal(g.state.musicVolume,.75);assert.equal(g.state.fxVolume,.2);
 // Mid-match changes from the audio panel are remembered too.
 element('effects-on').checked=false;element('effects-on').onchange();assert.equal(JSON.parse(stored.get(PREFS_KEY)).audio.effects,false);
});

test('a saved map that is switched off on this server falls back to an enabled one',async()=>{
 stored.set(PREFS_KEY,JSON.stringify({map:3}));resetPage();const g=await load();
 assert.equal(element('map-choice').value,'3');
 g.applySettings({...defaultSettings(),maps:{enabled:[0,1]}});assert.equal(element('map-choice').value,'0');
 element('start').onclick();assert.equal(g.state.map,0);
});
