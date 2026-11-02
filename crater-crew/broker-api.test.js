import test from 'node:test';
import assert from 'node:assert/strict';
import turn from './api/ai/turn.mjs';
import health from './api/ai/health.mjs';

const url='https://game.example/api/ai/turn';
const pinned='claude-sub/claude-sonnet-5-5';
const body={turnId:'t42_1_3_1',difficulty:2,snapshot:{map:0,round:1,wind:12,water:720,worms:[{id:3,team:1,x:700,y:500,hp:100,alive:true}],terrain:Array(32).fill(600)},candidates:[{id:'bazooka_0',description:'Rocket toward Pip.'},{id:'air_0_left',description:'Airstrike from left.'}]};
const request=(method,payload,query='')=>new Request(url+query,{method,headers:method==='POST'?{'content-type':'application/json'}:{},body:method==='POST'?JSON.stringify(payload):undefined});
const catalog=(overrides={})=>({data:[{id:pinned,source:'broker',billing_type:'subscription',available:true,capabilities:['chat:fast'],job_request:{response_format_types:['json_schema']},...overrides}]});
const done=(overrides={})=>({status:'done',provider:'claude-sub',model:pinned,requested_model:pinned,billing_type:'subscription',cost_usd:null,text:JSON.stringify({turn_id:body.turnId,candidate_id:'bazooka_0'}),...overrides});
const response=(value,status=200)=>new Response(JSON.stringify(value),{status});
async function configured(fn,model=pinned){
 const vars=['BROKER_PROJECT_KEY','BROKER_GAME_ENABLED','BROKER_SUBSCRIPTION_MODEL'];
 const old=Object.fromEntries(vars.map(name=>[name,process.env[name]]));const oldFetch=globalThis.fetch;
 process.env.BROKER_PROJECT_KEY='test-only-secret';process.env.BROKER_GAME_ENABLED='true';
 if(model===null)delete process.env.BROKER_SUBSCRIPTION_MODEL;else process.env.BROKER_SUBSCRIPTION_MODEL=model;
 try{return await fn()}finally{globalThis.fetch=oldFetch;for(const name of vars){if(old[name]===undefined)delete process.env[name];else process.env[name]=old[name]}}
}

test('Broker requires explicit subscription model and exposes no key',async()=>configured(async()=>{
 let calls=0;globalThis.fetch=async()=>{calls++;throw Error('should not call')};
 const r=await turn.fetch(request('POST',body));assert.equal(r.status,503);assert.equal((await r.json()).status,'unavailable');
 assert.deepEqual(await (await health.fetch()).json(),{mode:'broker',configured:false});assert.equal(calls,0);
},null));

test('Subscription submit pins the route, omits unsupported controls, and polls signed ticket',async()=>configured(async()=>{
 const calls=[];
 globalThis.fetch=async (input,options)=>{
  const path=new URL(input).pathname+new URL(input).search;calls.push(path);
  assert.equal(options.headers['X-Project-Key'],'test-only-secret');
  if(path==='/v1/models')return response(catalog());
  if(path==='/v1/jobs?capability=chat:fast'){
   const posted=JSON.parse(options.body);assert.equal(posted.model,pinned);
   assert.equal(posted.response_format.type,'json_schema');assert.equal(posted.workflow,'webworms-turn');
   for(const field of ['max_tokens','temperature','tools','stream'])assert.equal(Object.hasOwn(posted,field),false);
   return response({job_id:91,poll_after_s:2},202);
  }
  assert.equal(path,'/v1/jobs/91');return response(done());
 };
 const invalid=await turn.fetch(request('POST',{...body,candidates:[{id:'../../x',description:'bad'}]}));assert.equal(invalid.status,422);assert.equal(calls.length,0);
 const submit=await turn.fetch(request('POST',body));assert.equal(submit.status,202);
 const ticket=(await submit.json()).ticket;assert.ok(ticket&&!ticket.includes('test-only-secret'));
 const poll=await turn.fetch(request('GET',undefined,'?ticket='+encodeURIComponent(ticket)));
 assert.deepEqual(await poll.json(),{status:'done',turnId:body.turnId,candidateId:'bazooka_0'});
 const altered=await turn.fetch(request('GET',undefined,'?ticket='+encodeURIComponent(ticket)+'x'));
 assert.equal(altered.status,400);assert.deepEqual(calls,['/v1/models','/v1/jobs?capability=chat:fast','/v1/jobs/91']);
}));

for(const [label,entry] of [
 ['unavailable',{available:false}],['API billed',{billing_type:'api'}],
 ['wrong route',{id:'api/other'}],['no chat capability',{capabilities:['structured']}],
 ['no JSON schema',{job_request:{response_format_types:['json_object']}}]
])test(`Catalog rejects ${label} without submitting a job`,async()=>configured(async()=>{
 const calls=[];globalThis.fetch=async input=>{calls.push(new URL(input).pathname);return response(catalog(entry))};
 const result=await turn.fetch(request('POST',body));assert.equal(result.status,503);assert.deepEqual(calls,['/v1/models']);
}));

test('Catalog failure never submits a job',async()=>configured(async()=>{
 let calls=0;globalThis.fetch=async()=>{calls++;return response({error:'unavailable'},503)};
 const result=await turn.fetch(request('POST',body));assert.equal(result.status,503);assert.equal(calls,1);
}));

for(const [label,change] of [
 ['paid billing',{billing_type:'api',cost_usd:0.01}],['wrong model',{model:'claude-sub/other'}],
 ['wrong provider',{provider:'api'}],['non-null cost',{cost_usd:0}],
 ['unlisted candidate',{text:JSON.stringify({turn_id:body.turnId,candidate_id:'unlisted'})}]
])test(`Poll rejects ${label}`,async()=>configured(async()=>{
 globalThis.fetch=async input=>{
  const path=new URL(input).pathname;
  if(path==='/v1/models')return response(catalog());
  if(path==='/v1/jobs')return response({job_id:92},202);
  return response(done(change));
 };
 const submit=await turn.fetch(request('POST',body));assert.equal(submit.status,202);
 const ticket=(await submit.json()).ticket;
 const poll=await turn.fetch(request('GET',undefined,'?ticket='+encodeURIComponent(ticket)));
 assert.equal(poll.status,502);assert.equal((await poll.json()).status,'error');
}));

test('Changing the approved model invalidates old poll tickets',async()=>configured(async()=>{
 let calls=0;globalThis.fetch=async input=>{calls++;return new URL(input).pathname==='/v1/models'?response(catalog()):response({job_id:93},202)};
 const submit=await turn.fetch(request('POST',body));const ticket=(await submit.json()).ticket;
 process.env.BROKER_SUBSCRIPTION_MODEL='codex-sub/gpt-6.1-sol';
 const poll=await turn.fetch(request('GET',undefined,'?ticket='+encodeURIComponent(ticket)));
 assert.equal(poll.status,400);assert.equal(calls,2);
}));
