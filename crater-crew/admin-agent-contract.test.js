import test from 'node:test';
import assert from 'node:assert/strict';
import {handle} from './lib/admin-api.mjs';
import {invalidateAuthCache,resetLimiter} from './lib/auth.mjs';
import {setStore} from './lib/store.mjs';
import {OPEN_RULES} from './lib/agent-instructions.mjs';
import {ACTION_SCHEMA,OPEN_PROTOCOL} from './agent-contract.js';
import {readFile} from 'node:fs/promises';

test('agent inspector requires login, returns actual shared prompt/schema, never calls Broker',async()=>{
 const old=process.env.ADMIN_PASSWORD,oldFetch=globalThis.fetch;
 process.env.ADMIN_PASSWORD='inspector-test-password';invalidateAuthCache();resetLimiter();setStore(null);
 globalThis.fetch=()=>{throw Error('Inspector must not make network/model calls')};
 const req=(method='GET',cookie)=>new Request('https://game.example/api/admin/agent-contract',{method,headers:cookie?{cookie}:undefined});
 try{
  assert.equal((await handle(req())).status,401);
  const login=await handle(new Request('https://game.example/api/admin/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:process.env.ADMIN_PASSWORD})}));
  assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
  const result=await handle(req('GET',cookie));assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'no-store');
  const text=await result.text(),data=JSON.parse(text);
  assert.equal(data.systemPrompt,OPEN_RULES);assert.deepEqual(data.actionSchema,ACTION_SCHEMA);assert.equal(data.protocol,OPEN_PROTOCOL);
  assert.match(data.inputDescription,/Template only, not a live request/);assert.match(data.execution,/defines no native tool calls/);assert.match(data.execution,/Provider runtime permissions are not represented here/);assert.equal(data.inputTemplate.difficulty,'<hard | ultra | god>');assert.equal(data.inputTemplate.snapshot.size,'[width,height]');
  assert.ok(!text.includes(process.env.ADMIN_PASSWORD));assert.equal(data.inputTemplate.snapshot.activeId,'<active worm ID>');
  assert.equal((await handle(req('POST',cookie))).status,405);
 }finally{globalThis.fetch=oldFetch;if(old===undefined)delete process.env.ADMIN_PASSWORD;else process.env.ADMIN_PASSWORD=old;invalidateAuthCache();resetLimiter()}
});

test('existing admin exposes contract with safe text rendering and live turn uses the same prompt',async()=>{
 const html=await readFile(new URL('./admin.html',import.meta.url),'utf8'),js=await readFile(new URL('./admin.js',import.meta.url),'utf8'),turn=await readFile(new URL('./api/ai/turn.mjs',import.meta.url),'utf8');
 for(const id of ['agent-contract-refresh','agent-system-prompt','agent-input-template','agent-action-schema'])assert.ok(html.includes(`id="${id}"`));
 assert.match(js,/api\('\/api\/admin\/agent-contract'\)/);assert.match(js,/\$\('agent-system-prompt'\)\.textContent=r\.systemPrompt/);
 assert.match(turn,/import \{OPEN_RULES\} from '\.\.\/\.\.\/lib\/agent-instructions.mjs'/);assert.match(turn,/content:open\?OPEN_RULES:RULES/);
});
