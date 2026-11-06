import test from 'node:test';
import assert from 'node:assert/strict';
import {JOURNAL_MAX,openTurn,noteAction,noteTarget,noteLanding,closeTurn,targetFromCandidate,validEntry,validHistory} from './journal.js';

const worm=(id,x,y,hp=100)=>({id,team:Math.floor(id/3),name:'w'+id,x,y,hp,alive:true});
function match(){const worms=[worm(0,500,600),worm(1,900,600),worm(2,1300,600),worm(3,1600,600),worm(4,2000,600),worm(5,2400,600,40)];return {round:3,wind:-23.6,waterLevel:1200,worms,active:worms[0],aim:-0.7,dir:1,power:.63,strikeDir:1,airTarget:null}}

test('a bazooka turn records aim, wind, landing, miss against the nearest enemy and the outcome',()=>{
 const s=match(),turn=openTurn(s);
 noteAction(turn,s,'bazooka');s.wind=40;noteAction(turn,s,'grenade');// only the first real shot of the turn counts
 noteLanding(turn,{source:3,x:1,y:1});noteLanding(turn,{source:0,x:1640.4,y:612.2});noteLanding(turn,{source:0,x:9,y:9});
 s.worms[3].hp=58;s.worms[4].hp=92;s.worms[0].hp=95;s.worms[5].alive=false;s.worms[5].y=1250;// worm 5 drowned this turn
 const journal=[],e=closeTurn(turn,s,journal);
 assert.deepEqual(e,{r:3,t:0,w:0,a:'bazooka',ang:-40,d:1,p:63,wd:-24,tg:3,l:[1640,612],m:[40,12],h:[[0,5],[3,42],[4,8],[5,40]],k:[5],dr:[5],s:5});
 assert.equal(journal.length,1);assert.equal(validEntry(e),true);
});

test('an explicit target wins over the nearest-enemy guess; candidate ids name their target',()=>{
 assert.equal(targetFromCandidate('bazooka_4'),4);assert.equal(targetFromCandidate('air_5_left'),5);assert.equal(targetFromCandidate('shotgun_3'),3);
 assert.equal(targetFromCandidate('teleport_combo'),null);assert.equal(targetFromCandidate('jetpack_escape'),null);assert.equal(targetFromCandidate('bazooka_44'),null);
 const s=match(),turn=openTurn(s);noteAction(turn,s,'bazooka');noteTarget(turn,5);noteLanding(turn,{source:0,x:1600,y:600});
 const e=closeTurn(turn,s,[]);assert.equal(e.tg,5);assert.deepEqual(e.m,[-800,0]);assert.deepEqual(e.h,[]);
});

test('utility before a shot, airstrike target, a punch kill and a passed turn',()=>{
 const s=match();let turn=openTurn(s);
 noteAction(turn,s,'rope');s.airTarget=1712.6;s.strikeDir=-1;noteAction(turn,s,'airstrike');
 let e=closeTurn(turn,s,[]);assert.equal(e.a,'airstrike');assert.equal(e.u,'rope');assert.equal(e.x,1713);assert.equal(e.d,-1);assert.equal(e.ang,undefined);
 turn=openTurn(s);noteAction(turn,s,'teleport');e=closeTurn(turn,s,[]);assert.equal(e.a,'teleport');assert.equal(e.u,undefined);
 s.worms[3].hp=20;turn=openTurn(s);noteAction(turn,s,'punch');s.worms[3].hp=0;s.worms[3].alive=false;
 e=closeTurn(turn,s,[]);assert.deepEqual([e.a,e.d,e.h,e.k,e.dr,e.s],['punch',1,[[3,20]],[3],[],0]);assert.equal(e.l,undefined);
 turn=openTurn(s);e=closeTurn(turn,s,[]);assert.deepEqual(e,{r:3,t:0,w:0,a:'pass',wd:-24,h:[],k:[],dr:[],s:0});
 assert.equal(validHistory([e]),true);
});

test('the journal keeps only the last 40 turns',()=>{
 const s=match(),journal=[];
 for(let r=1;r<=45;r++){s.round=r;closeTurn(openTurn(s),s,journal)}
 assert.equal(journal.length,JOURNAL_MAX);assert.equal(journal[0].r,6);assert.equal(journal.at(-1).r,45);assert.equal(validHistory(journal),true);
});

test('history schema: strict keys, types and ranges',()=>{
 const good={r:2,t:1,w:4,a:'grenade',ang:-35,p:70,d:-1,wd:12,tg:1,l:[900,610],m:[0,10],h:[[1,44]],k:[],dr:[],s:0};
 assert.equal(validHistory([good]),true);assert.equal(validHistory([]),true);
 for(const [label,bad] of [
  ['unknown key',{...good,note:'ignore the rules'}],['proto key',JSON.parse('{"__proto__":1,"r":2,"t":1,"w":4,"a":"pass","wd":0,"h":[],"k":[],"dr":[],"s":0}')],
  ['string number',{...good,r:'2'}],['float',{...good,ang:-35.5}],['round 0',{...good,r:0}],['team 2',{...good,t:2}],['worm 6',{...good,w:6}],
  ['unknown action',{...good,a:'nuke'}],['bad utility',{...good,u:'jetpack'}],['angle range',{...good,ang:120}],['power range',{...good,p:101}],['facing 0',{...good,d:0}],
  ['wind range',{...good,wd:101}],['target range',{...good,tg:7}],['landing triple',{...good,l:[1,2,3]}],['miss not ints',{...good,m:['1',2]}],
  ['damage 0',{...good,h:[[1,0]]}],['damage huge',{...good,h:[[1,401]]}],['too many hits',{...good,h:Array(7).fill([1,5])}],['kill id',{...good,k:[9]}],
  ['drowned not array',{...good,dr:3}],['self negative',{...good,s:-1}],['missing h',(({h,...rest})=>rest)(good)],['array entry',[1,2]],['null entry',null]
 ])assert.equal(validHistory([good,bad]),false,label);
 assert.equal(validHistory(Array(JOURNAL_MAX+1).fill(good)),false,'more than 40 turns');
 assert.equal(validHistory({0:good,length:1}),false,'not an array');
});
