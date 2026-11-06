import test from 'node:test';
import assert from 'node:assert/strict';
import {PREFS_KEY,LEGACY_CONTROLLERS_KEY,cleanPrefs,readPrefs,savePrefs} from './prefs.js';

const memory=(items={})=>{const m=new Map(Object.entries(items));return {m,getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)}};
const blocked={getItem(){throw new DOMException('blocked','SecurityError')},setItem(){throw new DOMException('quota','QuotaExceededError')}};

test('preferences round-trip under one versioned key and merge partial changes',()=>{
 const s=memory();
 assert.deepEqual(readPrefs(s),{});
 assert.equal(savePrefs({audio:{music:false,effects:true,musicVolume:10,effectsVolume:90}},s),true);
 assert.equal(savePrefs({controllers:['easy','hard']},s),true);
 assert.equal(savePrefs({map:2},s),true);
 assert.equal(savePrefs({audio:{musicVolume:55}},s),true);
 assert.deepEqual([...s.m.keys()],[PREFS_KEY]);
 assert.deepEqual(readPrefs(s),{audio:{music:false,effects:true,musicVolume:55,effectsVolume:90},controllers:['easy','hard'],map:2});
});

test('malformed or hostile stored values are dropped field by field',()=>{
 assert.deepEqual(cleanPrefs(null),{});assert.deepEqual(cleanPrefs([1,2]),{});
 assert.deepEqual(cleanPrefs({audio:{music:'yes',effects:false,musicVolume:250,effectsVolume:-4},controllers:['human'],map:-1}),{audio:{effects:false,musicVolume:100,effectsVolume:0}});
 assert.deepEqual(cleanPrefs({controllers:['human',{}],map:1.5,audio:{musicVolume:'40'}}),{});
 assert.deepEqual(readPrefs(memory({[PREFS_KEY]:'{not json'})),{});
});

test('controllers saved by the old build are picked up once there is no v1 record',()=>{
 const s=memory({[LEGACY_CONTROLLERS_KEY]:JSON.stringify(['easy','ultra'])});
 assert.deepEqual(readPrefs(s),{controllers:['easy','ultra']});
 savePrefs({controllers:['human','hard']},s);assert.deepEqual(readPrefs(s).controllers,['human','hard']);
});

test('blocked or missing storage never throws: nothing is read, saves report false',()=>{
 assert.deepEqual(readPrefs(blocked),{});assert.equal(savePrefs({map:1},blocked),false);
 assert.deepEqual(readPrefs(null),{});assert.equal(savePrefs({map:1},null),false);
 // No localStorage global at all (as in Node): the defaults apply.
 assert.deepEqual(readPrefs(),{});assert.equal(savePrefs({map:1}),false);
});
