import test from 'node:test';
import assert from 'node:assert/strict';
import { serve } from './server.mjs';
async function get(url){
 const r={writeHead(status,headers){this.status=status;this.headers=headers},end(body){this.body=body}};
 await serve({url},r);return r;
}
test('crawler entry and sitemap agree with the canonical public game URL',async()=>{
 const page=await get('/'),robots=await get('/robots.txt'),map=await get('/sitemap.xml');
 for(const r of [page,robots,map])assert.equal(r.status,200);
 const html=page.body.toString();
 const canonical=html.match(/rel="canonical" href="([^"]+)"/)[1];
 assert.equal(canonical,'https://aiworms.vercel.app/');
 assert.match(robots.headers['content-type'],/^text\/plain/);
 assert.match(robots.body.toString(),/Allow: \/\n/);
 assert.ok(robots.body.toString().includes(`Sitemap: ${canonical}sitemap.xml`));
 assert.match(map.headers['content-type'],/^application\/xml/);
 assert.ok(map.body.toString().includes(`<loc>${canonical}</loc>`));
 assert.doesNotMatch(html,/<meta[^>]+(?:noindex|nofollow)/i);
 assert.match(html,/<meta name="description" content="[^"]+"/);
 assert.match(html,/Win the island/);assert.match(html,/same device/);
});
test('social preview URL resolves to a real JPEG with matching advertised dimensions',async()=>{
 const html=(await get('/')).body.toString();
 const url=new URL(html.match(/property="og:image" content="([^"]+)"/)[1]);
 assert.equal(url.origin,'https://aiworms.vercel.app');
 const r=await get(url.pathname);assert.equal(r.status,200);assert.equal(r.headers['content-type'],'image/jpeg');
 const b=r.body;assert.equal(b.readUInt16BE(0),0xffd8);
 let width,height;
 for(let i=2;i<b.length;){assert.equal(b[i],255);const marker=b[i+1],length=b.readUInt16BE(i+2);if([0xc0,0xc1,0xc2].includes(marker)){height=b.readUInt16BE(i+5);width=b.readUInt16BE(i+7);break}i+=length+2}
 assert.equal(width,Number(html.match(/property="og:image:width" content="(\d+)"/)[1]));
 assert.equal(height,Number(html.match(/property="og:image:height" content="(\d+)"/)[1]));
 assert.match(html,/name="twitter:card" content="summary_large_image"/);
});
