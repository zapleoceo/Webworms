import test from 'node:test';
import assert from 'node:assert/strict';
import { serve } from './server.mjs';

async function request(url){
 const response={status:null,headers:null,body:null,writeHead(status,headers){this.status=status;this.headers=headers},end(body){this.body=body}};
 await serve({url},response);return response;
}
test('root serves the same HTML and MIME as index.html, without a download header',async()=>{
 const root=await request('/'),index=await request('/index.html');
 assert.equal(root.status,200);assert.equal(index.status,200);
 assert.equal(root.headers['content-type'],'text/html');assert.equal(index.headers['content-type'],'text/html');
 assert.equal(root.headers['content-disposition'],undefined);
 assert.deepEqual(root.body,index.body);assert.match(root.body.toString('utf8'),/^<!doctype html>/i);
});
test('JavaScript and CSS assets keep browser-readable MIME types',async()=>{
 for(const [url,mime] of [['/game.js','text/javascript'],['/engine.js','text/javascript'],['/style.css','text/css']]){
  const result=await request(url);assert.equal(result.status,200,url);assert.equal(result.headers['content-type'],mime,url);assert.ok(result.body.length>100,url);
 }
});
test('local server exposes a safe Broker health route without making a model call',async()=>{
 const result=await request('/api/ai/health');
 assert.equal(result.status,200);assert.equal(result.headers['content-type'],'application/json; charset=utf-8');
 assert.deepEqual(JSON.parse(result.body.toString()),{mode:'broker',configured:false});
});
test('local server routes the settings and admin API',async()=>{
 delete process.env.ADMIN_PASSWORD;
 const settings=await request('/api/settings');
 assert.equal(settings.status,200);assert.equal(settings.headers['content-type'],'application/json; charset=utf-8');
 assert.equal(JSON.parse(settings.body.toString()).match.turnTime,35);
 const admin=await request('/api/admin/session');
 assert.equal(admin.status,503);assert.equal(JSON.parse(admin.body.toString()).error,'admin not configured');
 const page=await request('/admin.html');assert.equal(page.status,200);assert.equal(page.headers['content-type'],'text/html');
});
