// Settings and sponsor-logo storage. Production: Vercel Blob (env BLOB_READ_WRITE_TOKEN). Local dev: a folder
// served by server.mjs. Tests: memory. All three expose the same small interface:
//   readSettings() -> object|null, writeSettings(obj), putLogo(id, ext, bytes, contentType) -> url, deleteLogo(url)
import {mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';

export const SETTINGS_PATH='settings/game.json';
const MAX_SETTINGS_BYTES=256*1024;

let override=null;
// server.mjs (local dev) and the tests install their own store; null restores the env-based choice.
export const setStore=store=>{override=store};
export function getStore(){
 if(override)return override;
 return process.env.BLOB_READ_WRITE_TOKEN?createBlobStore():null;
}

// `client` is the @vercel/blob module (or a test double with the same put/head/del functions).
export function createBlobStore(client=null){
 const blob=async()=>client??=await import('@vercel/blob');
 return {
  kind:'blob',
  async readSettings(){
   const {head,BlobNotFoundError}=await blob();
   let meta;try{meta=await head(SETTINGS_PATH)}catch(e){if(BlobNotFoundError&&e instanceof BlobNotFoundError||e?.name==='BlobNotFoundError')return null;throw e}
   // Public blobs sit behind a CDN; the upload time in the query asks for this exact version.
   const response=await fetch(`${meta.url}?v=${Date.parse(meta.uploadedAt)||Date.now()}`,{cache:'no-store',signal:AbortSignal.timeout(5000)});
   if(!response.ok)throw Error(`settings blob read failed: ${response.status}`);
   const text=await response.text();if(text.length>MAX_SETTINGS_BYTES)throw Error('settings blob too large');
   return JSON.parse(text);
  },
  async writeSettings(settings){
   const {put}=await blob();
   await put(SETTINGS_PATH,JSON.stringify(settings),{access:'public',contentType:'application/json; charset=utf-8',addRandomSuffix:false,allowOverwrite:true,cacheControlMaxAge:60});
  },
  async putLogo(id,ext,bytes,contentType){
   const {put}=await blob();
   const result=await put(`sponsors/${id}.${ext}`,Buffer.from(bytes),{access:'public',contentType,addRandomSuffix:false,allowOverwrite:false});
   return result.url;
  },
  async deleteLogo(url){const {del}=await blob();await del(url)},
 };
}

export function createMemoryStore(){
 const files=new Map();
 return {
  kind:'memory',files,
  async readSettings(){const t=files.get(SETTINGS_PATH);return t?JSON.parse(t):null},
  async writeSettings(s){files.set(SETTINGS_PATH,JSON.stringify(s))},
  async putLogo(id,ext,bytes){const p=`sponsors/${id}.${ext}`;files.set(p,Buffer.from(bytes));return `https://blob.test/${p}`},
  async deleteLogo(url){files.delete(new URL(url).pathname.slice(1))},
 };
}

// Local development: files under <root>/<dir>, logos served by server.mjs at /<dir>/sponsors/...
export function createFileStore(root,dir='.local-store'){
 const base=resolve(root,dir),at=p=>{const f=resolve(base,p);if(!f.startsWith(base+sep))throw Error('bad path');return f};
 return {
  kind:'file',
  async readSettings(){try{return JSON.parse(await readFile(at(SETTINGS_PATH),'utf8'))}catch(e){if(e.code==='ENOENT')return null;throw e}},
  async writeSettings(s){await mkdir(join(base,'settings'),{recursive:true});await writeFile(at(SETTINGS_PATH),JSON.stringify(s,null,1))},
  async putLogo(id,ext,bytes){await mkdir(join(base,'sponsors'),{recursive:true});await writeFile(at(`sponsors/${id}.${ext}`),Buffer.from(bytes));return `/${dir}/sponsors/${id}.${ext}`},
  async deleteLogo(url){const m=/\/sponsors\/([a-z0-9]+\.(png|jpg|webp|svg))$/.exec(url);if(m)await rm(at(`sponsors/${m[1]}`),{force:true})},
 };
}
