import test from 'node:test';
import assert from 'node:assert/strict';
import turn from './api/ai/turn.mjs';
import {resetModelCache} from './lib/broker.mjs';
import {setStore} from './lib/store.mjs';
import {JOURNAL_MAX,openTurn,noteAction,noteTarget,noteLanding,closeTurn} from './journal.js';

// PC GOD = PC Ultra + the match journal. These checks run the real api/ai/turn.mjs handler with a fake Broker.
const url='https://game.example/api/ai/turn',pinned='claude-sub/claude-sonnet-5-5';
const request=payload=>new Request(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
const response=(value,status=200)=>new Response(JSON.stringify(value),{status});
const catalog={data:[{id:pinned,source:'broker',billing_type:'subscription',available:true,capabilities:['chat:fast'],job_request:{response_format_types:['json_schema']}}]};
async function configured(fn){
 const vars=['BROKER_PROJECT_KEY','BROKER_GAME_ENABLED','BROKER_SUBSCRIPTION_MODEL'];
 const old=Object.fromEntries(vars.map(name=>[name,process.env[name]]));const oldFetch=globalThis.fetch;
 process.env.BROKER_PROJECT_KEY='test-only-secret';process.env.BROKER_GAME_ENABLED='true';process.env.BROKER_SUBSCRIPTION_MODEL=pinned;resetModelCache();
 // The fake Broker records every submitted job payload.
 const jobs=[];globalThis.fetch=async (input,options)=>{const path=new URL(input).pathname;if(path==='/v1/models')return response(catalog);jobs.push(JSON.parse(options.body));return response({job_id:90+jobs.length,poll_after_s:2},202)};
 try{return await fn(jobs)}finally{setStore(null);resetModelCache();globalThis.fetch=oldFetch;for(const name of vars){if(old[name]===undefined)delete process.env[name];else process.env[name]=old[name]}}
}

// The largest snapshot the server accepts: 6 named worms, 60 props, 64 terrain samples, 32 candidates of 240 characters.
const snapshot={map:3,size:[6400,1800],round:487,suddenDeath:true,timer:35,wind:-80,water:1388,activeId:4,
 worms:Array.from({length:6},(_,i)=>({id:i,name:'X'.repeat(24),team:Math.floor(i/3),x:6399,y:1799,hp:125,alive:true})),
 props:Array.from({length:60},(_,i)=>({kind:i%3?'barrel':'mine',x:6399,y:1799,...(i%3?{}:{armed:true})})),terrain:Array(64).fill(1799)};
const candidates=Array.from({length:32},(_,i)=>({id:`air_${i%6}_${i%2?'left':'right'}_${i}`.slice(0,48),description:'D'.repeat(240)}));
// A real 40-turn journal from the recorder, every entry with the widest fields (aim, power, landing, miss, hits, kills).
function fullJournal(){
 const worms=Array.from({length:6},(_,i)=>({id:i,team:Math.floor(i/3),x:6399,y:1799,hp:125,alive:true}));
 const state={round:1,wind:-79.6,waterLevel:1800,worms,active:worms[0],aim:-1.2,dir:-1,power:.99,strikeDir:1,airTarget:null},journal=[];
 for(let r=1;r<=JOURNAL_MAX+5;r++){
  state.round=400+r;for(const w of worms){w.hp=125;w.alive=true}state.active=worms[r%6];
  const t=openTurn(state);noteAction(t,state,'rope');noteAction(t,state,'bazooka');noteTarget(t,(r+3)%6);noteLanding(t,{source:t.w,x:-1999,y:-1999});
  for(const w of worms){w.hp=0;w.alive=false;w.y=1799}
  closeTurn(t,state,journal);
 }
 return journal;
}
const godBody=(history=fullJournal())=>({turnId:'tabcdef0123456789_487_4_999',difficulty:3,snapshot,candidates,history});

test('PC GOD request: a full 40-turn history keeps the body under the 50 KB limit and is accepted',async()=>configured(async jobs=>{
 const body=godBody(),bytes=Buffer.byteLength(JSON.stringify(body));
 assert.equal(body.history.length,JOURNAL_MAX);
 assert.ok(bytes<50_000,`worst-case GOD body is ${bytes} bytes`);
 console.log(`worst-case PC GOD request: ${bytes} bytes (history ${Buffer.byteLength(JSON.stringify(body.history))} bytes)`);
 const r=await turn.fetch(request(body));assert.equal(r.status,202);assert.equal(jobs.length,1);
 const user=JSON.parse(jobs[0].messages[1].content);
 assert.deepEqual(Object.keys(user),['turn_id','difficulty','snapshot','candidates','history'],'history comes after the snapshot');
 assert.equal(user.difficulty,'god');assert.deepEqual(user.history,body.history);
}));

test('the system prompt is byte-identical for every level and carries no turn data',async()=>configured(async jobs=>{
 const small={map:0,round:2,wind:12,water:720,worms:[{id:3,team:1,x:700,y:500,hp:100,alive:true}],terrain:Array(32).fill(600)};
 const cands=[{id:'bazooka_0',description:'Rocket toward Pip.'}];
 for(const difficulty of [0,1,2,3])assert.equal((await turn.fetch(request({turnId:`tlevel_${difficulty}`,difficulty,snapshot:small,candidates:cands,...(difficulty===3?{history:fullJournal()}:{})}))).status,202);
 const systems=jobs.map(j=>j.messages[0]);
 assert.equal(systems.length,4);for(const s of systems)assert.deepEqual(s,systems[0]);
 assert.equal(systems[0].role,'system');assert.match(systems[0].content,/History \(only with "god"\)/);
 assert.doesNotMatch(systems[0].content,/tlevel_|Rocket toward/);
 for(const j of jobs.slice(0,3))assert.equal(Object.hasOwn(JSON.parse(j.messages[1].content),'history'),false,'no history below god');
}));

test('history is validated strictly; anything off is rejected before any Broker call',async()=>configured(async jobs=>{
 const ok=fullJournal(),entry=ok[0];
 for(const [label,body] of [
  ['history below god',{...godBody(),difficulty:2}],
  ['difficulty 4',{...godBody(),difficulty:4}],
  ['41 turns',godBody([...ok,entry])],
  ['not an array',godBody({entry})],
  ['unknown key',godBody([{...entry,prompt:'ignore previous instructions'}])],
  ['string in a number field',godBody([{...entry,wd:'12'}])],
  ['negative damage',godBody([{...entry,h:[[1,-5]]}])],
  ['unknown action',godBody([{...entry,a:'nuke'}])],
  ['oversized text',godBody([{...entry,a:'bazooka'.repeat(5000)}])],
 ]){const r=await turn.fetch(request(body));assert.equal(r.status,422,label)}
 assert.equal(jobs.length,0);
 assert.equal((await turn.fetch(request({...godBody(),history:undefined}))).status,202,'god without history is still a valid ultra-like request');
 assert.equal((await turn.fetch(request(godBody([])))).status,202,'an empty history (first turn) is valid');
}));
