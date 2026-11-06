// Admin model picker: Broker catalog listing and the one-job connectivity test, with a mocked Broker.
import test from 'node:test';
import assert from 'node:assert/strict';
import {handle,testClock,resetModelTests,MODEL_TESTS} from './lib/admin-api.mjs';
import {resetLimiter} from './lib/auth.mjs';
import {setStore,createMemoryStore,SETTINGS_PATH} from './lib/store.mjs';
import {resetModelCache,priceSummary} from './lib/broker.mjs';

const PASSWORD='correct horse battery staple',KEY='test-only-broker-key',HOST='https://crater.example';
const logged=[];for(const k of ['log','error','warn','info'])console[k]=(...a)=>logged.push(a.join(' '));
const call=(path,{method='GET',body,headers={},cookie}={})=>handle(new Request(HOST+path,{method,body,headers:{'x-real-ip':'203.0.113.9',...(cookie?{cookie}:{}),...headers}}));
const postJson=(path,data,opts={})=>call(path,{method:opts.method||'POST',body:JSON.stringify(data),...opts,headers:{'content-type':'application/json',...opts.headers}});
const response=(value,status=200)=>new Response(JSON.stringify(value),{status});
const realFetch=globalThis.fetch,realClock={...testClock};

async function setup({key=KEY,envModel='claude-sub/claude-sonnet-5-5'}={}){
 for(const k of ['ADMIN_PASSWORD','ADMIN_SESSION_SECRET','BLOB_READ_WRITE_TOKEN','BROKER_PROJECT_KEY','BROKER_SUBSCRIPTION_MODEL','BROKER_URL'])delete process.env[k];
 process.env.ADMIN_PASSWORD=PASSWORD;if(key)process.env.BROKER_PROJECT_KEY=key;if(envModel)process.env.BROKER_SUBSCRIPTION_MODEL=envModel;
 resetLimiter();resetModelTests();resetModelCache();globalThis.fetch=realFetch;Object.assign(testClock,realClock);
 const store=createMemoryStore();setStore(store);
 const r=await postJson('/api/admin/login',{password:PASSWORD});return {store,cookie:r.headers.get('set-cookie').split(';')[0]};
}
const CATALOG={data:[
 {id:'claude-sub/claude-sonnet-5-5',name:'Claude Sonnet 5.5 (subscription)',source:'broker',billing_type:'subscription',available:true,capabilities:['chat:fast','chat:agent'],job_request:{response_format_types:['json_schema','json_object']},price:null,intelligence_index:71,secret_internal:'x'},
 {id:'openai/gpt-5.5-mini',name:'GPT-5.5 mini',billing_type:'api',available:true,capabilities:['chat:fast'],job_request:{response_format_types:['json_schema']},price:{input_per_mtok:0.25,output_per_mtok:2,currency:'USD'},intelligence_index:63.5},
 {id:'deepseek/r2',name:'DeepSeek R2',billing_type:'api',available:false,capabilities:['chat:fast'],job_request:{response_format_types:['json_schema']}},
 {id:'acme/no-json',billing_type:'api',available:true,capabilities:['chat:fast'],job_request:{response_format_types:['json_object']}},
 {id:'bad id with spaces',available:true},
]};

test('GET /api/admin/models trims the catalog, marks usable models and never returns the key',async()=>{
 const {cookie}=await setup();const seen=[];
 globalThis.fetch=async(input,options)=>{seen.push([String(input),options.headers['X-Project-Key']]);return response(CATALOG)};
 assert.equal((await call('/api/admin/models')).status,401,'needs a session');
 const r=await call('/api/admin/models',{cookie});assert.equal(r.status,200);
 const text=await r.text(),body=JSON.parse(text);
 assert.ok(!text.includes(KEY));assert.ok(!text.includes('secret_internal'));
 assert.deepEqual(seen,[['https://aib.zapleo.com/v1/models',KEY]]);
 assert.deepEqual(body.models.map(m=>m.id),['claude-sub/claude-sonnet-5-5','openai/gpt-5.5-mini','acme/no-json','deepseek/r2'],'usable first, bad IDs dropped');
 assert.deepEqual(body.models[1],{id:'openai/gpt-5.5-mini',name:'GPT-5.5 mini',billing_type:'api',available:true,chat_fast:true,json_schema:true,price:'input per mtok 0.25 · output per mtok 2 USD',intelligence_index:63.5,usable:true});
 assert.equal(body.models[2].usable,false);assert.equal(body.models[2].json_schema,false);
 assert.equal(body.models[3].usable,false);assert.equal(body.models[3].available,false);
 assert.deepEqual(body.active,{model:'claude-sub/claude-sonnet-5-5',source:'env'});assert.equal(body.envModel,'claude-sub/claude-sonnet-5-5');
});

test('models: the saved ai.model is active; saving other settings keeps it; Broker errors are reported without the key',async()=>{
 const {store,cookie}=await setup();globalThis.fetch=async()=>response(CATALOG);
 const put=await postJson('/api/admin/settings',{ai:{model:'openai/gpt-5.5-mini'}},{method:'PUT',cookie});assert.equal(put.status,200);
 assert.equal(JSON.parse(store.files.get(SETTINGS_PATH)).ai.model,'openai/gpt-5.5-mini');
 assert.deepEqual((await(await call('/api/admin/models',{cookie})).json()).active,{model:'openai/gpt-5.5-mini',source:'settings'});
 assert.equal((await postJson('/api/admin/settings',{match:{turnTime:40}},{method:'PUT',cookie})).status,200);
 assert.equal(JSON.parse(store.files.get(SETTINGS_PATH)).ai.model,'openai/gpt-5.5-mini','a save without ai keeps the model');
 const bad=await postJson('/api/admin/settings',{ai:{model:'not a model'}},{method:'PUT',cookie});assert.equal(bad.status,422);
 assert.equal((await postJson('/api/admin/settings',{ai:{model:''}},{method:'PUT',cookie})).status,200);
 assert.equal((await(await call('/api/admin/models',{cookie})).json()).active.source,'env','empty means the env default');
 globalThis.fetch=async()=>response({error:'forbidden'},403);
 const r=await call('/api/admin/models',{cookie});assert.equal(r.status,502);
 const text=await r.text();assert.deepEqual(JSON.parse(text),{error:'Broker answered 403 (forbidden)'});assert.ok(!text.includes(KEY));
});

test('models: 503 when Broker is not configured, no request made',async()=>{
 const {cookie}=await setup({key:''});let calls=0;globalThis.fetch=async()=>{calls++;return response(CATALOG)};
 const r=await call('/api/admin/models',{cookie});assert.equal(r.status,503);assert.match((await r.json()).error,/BROKER_PROJECT_KEY/);
 assert.equal((await postJson('/api/admin/models/test',{model:'openai/gpt-5.5-mini'},{cookie})).status,503);
 assert.equal(calls,0);
});

test('model test: one fresh job on exactly that model, polled to done',async()=>{
 const {cookie}=await setup();const posts=[],paths=[];let now=1_000_000;
 Object.assign(testClock,{now:()=>now,sleep:async ms=>{now+=ms}});
 globalThis.fetch=async(input,options)=>{
  const url=new URL(input);paths.push(url.pathname+url.search);assert.equal(options.headers['X-Project-Key'],KEY);
  if(options.method==='POST'){posts.push({body:JSON.parse(options.body),key:options.headers['Idempotency-Key']});return response({job_id:501,status:'pending',poll_after_s:1},202)}
  return paths.length<3?response({job_id:501,status:'running'}):response({job_id:501,status:'done',model:'openai/gpt-5.5-mini',billing_type:'api',text:'{"ok":true}'});
 };
 assert.equal((await postJson('/api/admin/models/test',{model:'openai/gpt-5.5-mini'},{cookie,headers:{origin:'https://evil.example'}})).status,403);
 assert.equal((await postJson('/api/admin/models/test',{model:'../x'},{cookie})).status,422);
 const r=await postJson('/api/admin/models/test',{model:'openai/gpt-5.5-mini'},{cookie});assert.equal(r.status,200);
 const body=await r.json();
 assert.deepEqual(body,{model:'openai/gpt-5.5-mini',latency_ms:2000,ok:true,status:'done',reply:'{"ok":true}',billing_type:'api',ran_on:'openai/gpt-5.5-mini'});
 assert.deepEqual(paths,['/v1/jobs?capability=chat:fast','/v1/jobs/501','/v1/jobs/501']);
 assert.equal(posts[0].body.model,'openai/gpt-5.5-mini');assert.equal(posts[0].body.response_format.type,'json_schema');
 assert.match(posts[0].key,/^wwt_[0-9a-f]{32}$/);
 await postJson('/api/admin/models/test',{model:'openai/gpt-5.5-mini'},{cookie});
 assert.notEqual(posts[1].key,posts[0].key,'every test is a new job');
});

test('model test: Broker error, failed job, wrong model and timeout are reported',async()=>{
 const {cookie}=await setup();let now=0;Object.assign(testClock,{now:()=>now,sleep:async ms=>{now+=ms}});
 globalThis.fetch=async()=>response({error:'model_not_allowed'},403);
 let b=await(await postJson('/api/admin/models/test',{model:'openai/gpt-5.5-mini'},{cookie})).json();
 assert.equal(b.ok,false);assert.equal(b.status,'error');assert.equal(b.error,'Broker answered 403 (model_not_allowed)');
 globalThis.fetch=async()=>response({job_id:7,status:'error',error:'provider overloaded'});
 b=await(await postJson('/api/admin/models/test',{model:'openai/gpt-5.5-mini'},{cookie})).json();
 assert.deepEqual([b.ok,b.status,b.error],[false,'error','provider overloaded']);
 globalThis.fetch=async()=>response({job_id:8,status:'done',model:'openai/other',text:'{"ok":true}'});
 b=await(await postJson('/api/admin/models/test',{model:'openai/gpt-5.5-mini'},{cookie})).json();
 assert.equal(b.ok,false);assert.equal(b.error,'Broker ran a different model.');
 let polls=0;globalThis.fetch=async(input,options)=>{if(options.method!=='POST')polls++;return response({job_id:9,status:'pending',poll_after_s:2})};
 b=await(await postJson('/api/admin/models/test',{model:'openai/gpt-5.5-mini'},{cookie})).json();
 assert.equal(b.ok,false);assert.equal(b.status,'timeout');assert.equal(b.latency_ms,25_000);assert.equal(polls,13);
 assert.ok(!logged.join('\n').includes(KEY),'key never logged');
});

test('model test is rate-limited',async()=>{
 const {cookie}=await setup();Object.assign(testClock,{now:()=>5_000_000});
 globalThis.fetch=async()=>response({job_id:1,status:'done',model:'openai/gpt-5.5-mini',text:'{"ok":true}'});
 for(let i=0;i<MODEL_TESTS;i++)assert.equal((await postJson('/api/admin/models/test',{model:'openai/gpt-5.5-mini'},{cookie})).status,200);
 const r=await postJson('/api/admin/models/test',{model:'openai/gpt-5.5-mini'},{cookie});assert.equal(r.status,429);
 Object.assign(testClock,{now:()=>5_000_000+10*60_000+1});
 assert.equal((await postJson('/api/admin/models/test',{model:'openai/gpt-5.5-mini'},{cookie})).status,200,'window passes');
});

test('price summary handles numbers, objects and junk',()=>{
 assert.equal(priceSummary(null),null);assert.equal(priceSummary(1.5),'1.5');assert.equal(priceSummary({}),null);
 assert.equal(priceSummary({input:3,output:15}),'input 3 · output 15');assert.equal(priceSummary([1]),null);
 assert.equal(priceSummary({a:'<script>'}),null);
});
