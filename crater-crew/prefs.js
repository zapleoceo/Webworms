// Player preferences kept on this device: music and effects (on/off, volume), who plays each team and the map.
// One versioned localStorage key. Storage can be missing or blocked (private mode, disabled cookies, sandboxed
// frames): every access is guarded, so the game then simply starts with its defaults and remembers nothing.
// Plain ES module without Node imports: the browser loads this file as is.

export const PREFS_KEY='craterCrew.prefs.v1';
// Before v1 only the controllers were remembered, under their own key; read once as a fallback.
export const LEGACY_CONTROLLERS_KEY='craterCrew.controllers';

function storage(){try{return globalThis.localStorage??null}catch{return null}}
function readJson(store,key){try{const raw=store?.getItem(key);return raw?JSON.parse(raw):null}catch{return null}}
const isObj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const volume=v=>Number.isFinite(v)?Math.round(Math.min(100,Math.max(0,v))):undefined;

// Keeps only well-formed fields; anything else (old shapes, hand edits) is dropped, not trusted.
export function cleanPrefs(raw){
 const out={};if(!isObj(raw))return out;
 if(isObj(raw.audio)){
  const a=raw.audio,audio={};
  if(typeof a.music==='boolean')audio.music=a.music;
  if(typeof a.effects==='boolean')audio.effects=a.effects;
  const mv=volume(a.musicVolume),ev=volume(a.effectsVolume);if(mv!=null)audio.musicVolume=mv;if(ev!=null)audio.effectsVolume=ev;
  if(Object.keys(audio).length)out.audio=audio;
 }
 if(Array.isArray(raw.controllers)&&raw.controllers.length===2&&raw.controllers.every(c=>typeof c==='string'&&c.length<=20))out.controllers=[...raw.controllers];
 if(Number.isInteger(raw.map)&&raw.map>=0&&raw.map<100)out.map=raw.map;
 return out;
}

export function readPrefs(store=storage()){
 const prefs=cleanPrefs(readJson(store,PREFS_KEY));
 if(!prefs.controllers){const legacy=cleanPrefs({controllers:readJson(store,LEGACY_CONTROLLERS_KEY)});if(legacy.controllers)prefs.controllers=legacy.controllers}
 return prefs;
}

// Merges a change into what is stored; returns false when storage is unavailable.
export function savePrefs(patch,store=storage()){
 try{
  if(!store)return false;
  const now=readPrefs(store),next=cleanPrefs({...now,...patch,audio:{...now.audio,...patch?.audio}});
  store.setItem(PREFS_KEY,JSON.stringify(next));return true;
 }catch{return false}
}
