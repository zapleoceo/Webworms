import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_SETTINGS,defaultSettings,validateSettings,mergeSettings,pickSponsors,validLink,validLogoUrl} from './settings.js';
import {seeded} from './engine.js';

const sponsor=(over={})=>({id:'abc123def456',name:'Acme',logoUrl:'https://x.public.blob.vercel-storage.com/sponsors/abc123def456.png',link:'https://acme.example',weight:3,enabled:true,placements:['billboard','crate','banner'],...over});

test('defaults equal the built-in game behaviour',()=>{
 assert.deepEqual(defaultSettings(),{
  match:{turnTime:35,teleports:2},props:{mines:8,barrels:6,crateChance:.3,crateHeal:25},water:{suddenDeathRound:9,waterRise:12},
  wind:{startMax:36,turnDrift:20,cap:80},maps:{enabled:[0,1,2]},players:{defaults:['human','easy'],offerHard:true,offerUltra:true},
  audio:{music:true,musicVolume:42,effects:true,effectsVolume:65,voices:true},sponsors:[]});
 assert.ok(Object.isFrozen(DEFAULT_SETTINGS));
 const a=defaultSettings();a.match.turnTime=1;assert.equal(defaultSettings().match.turnTime,35);
});

test('validation accepts a full valid document and strips unknown keys',()=>{
 const input={...defaultSettings(),match:{turnTime:45,teleports:0,extra:1},hack:{x:1},maps:{enabled:[2,0]},sponsors:[{...sponsor(),tracker:'x'}]};
 const r=validateSettings(input);
 assert.equal(r.ok,true,r.errors.join('; '));
 assert.equal(r.value.match.turnTime,45);assert.equal(r.value.match.teleports,0);
 assert.equal('extra' in r.value.match,false);assert.equal('hack' in r.value,false);assert.equal('tracker' in r.value.sponsors[0],false);
 assert.deepEqual(r.value.maps.enabled,[0,2]);
});

test('validation rejects bad types, ranges and lengths',()=>{
 const cases=[
  [{match:{turnTime:'35'}},'match.turnTime: must be a number'],
  [{match:{turnTime:35.5}},'match.turnTime: must be a whole number'],
  [{match:{turnTime:5}},'match.turnTime: must be between 10 and 120'],
  [{match:{teleports:10}},'match.teleports'],
  [{props:{crateChance:1.5}},'props.crateChance'],
  [{props:{mines:-1}},'props.mines'],
  [{water:{suddenDeathRound:1}},'water.suddenDeathRound'],
  [{wind:{startMax:90,cap:80}},'wind.startMax: must not exceed wind.cap'],
  [{audio:{music:'yes'}},'audio.music: must be true or false'],
  [{maps:{enabled:[]}},'maps.enabled'],
  [{maps:{enabled:[0,0]}},'maps.enabled'],
  [{maps:{enabled:[3]}},'maps.enabled'],
  [{players:{defaults:['human']}},'players.defaults'],
  [{players:{defaults:['human','god']}},'players.defaults'],
  [{players:{offerUltra:false,defaults:['human','ultra']}},'players.defaults: ultra is not offered'],
  [{match:[]},'match: must be an object'],
  [{sponsors:[sponsor({name:'x'.repeat(41)})]},'sponsors[0].name'],
  [{sponsors:[sponsor({name:'   '})]},'sponsors[0].name'],
  [{sponsors:[sponsor({link:'http://acme.example'})]},'sponsors[0].link'],
  [{sponsors:[sponsor({link:'javascript:alert(1)'})]},'sponsors[0].link'],
  [{sponsors:[sponsor({weight:0})]},'sponsors[0].weight'],
  [{sponsors:[sponsor({placements:['popup']})]},'sponsors[0].placements'],
  [{sponsors:[sponsor({logoUrl:'javascript:alert(1)'})]},'sponsors[0].logoUrl'],
  [{sponsors:[sponsor({id:'../etc'})]},'sponsors[0].id'],
  [{sponsors:[sponsor(),sponsor()]},'sponsors[1].id: duplicate'],
  [{sponsors:Array.from({length:21},(_,i)=>sponsor({id:'abcdefgh'+String(i).padStart(4,'0')}))},'sponsors: a list of at most 20'],
 ];
 for(const [input,msg] of cases){const r=validateSettings(input);assert.equal(r.ok,false,JSON.stringify(input));assert.ok(r.errors.some(e=>e.includes(msg)),`${JSON.stringify(input).slice(0,80)} -> ${r.errors}`)}
 assert.equal(validateSettings(null).ok,false);assert.equal(validateSettings([]).ok,false);
});

test('merge keeps every valid stored value and falls back per field',()=>{
 assert.deepEqual(mergeSettings(null),defaultSettings());
 assert.deepEqual(mergeSettings('garbage'),defaultSettings());
 const m=mergeSettings({match:{turnTime:60,teleports:'lots'},props:{mines:0},maps:{enabled:[5]},players:{defaults:['easy','hard'],offerHard:false},sponsors:[sponsor(),{id:'bad'}],extra:true});
 assert.equal(m.match.turnTime,60);assert.equal(m.match.teleports,2);assert.equal(m.props.mines,0);assert.deepEqual(m.maps.enabled,[0,1,2]);
 assert.deepEqual(m.players.defaults,['easy','easy'],'a level that is not offered falls back to easy');
 assert.equal(m.sponsors.length,1);assert.equal('extra' in m,false);
});

test('links and logo URLs: https only, no credentials, server paths only',()=>{
 assert.equal(validLink('https://acme.example/x?y=1'),true);
 for(const bad of ['http://a.b','https://user:pw@a.b','ftp://a.b','https://a b','//a.b','data:text/html,x'])assert.equal(validLink(bad),false,bad);
 assert.equal(validLogoUrl('https://store.public.blob.vercel-storage.com/sponsors/a.png'),true);
 assert.equal(validLogoUrl('/.local-store/sponsors/abcdef12.png'),true);
 for(const bad of ['//evil.example/x.png','/../x.png','javascript:alert(1)','https://a.b/"onerror=x'])assert.equal(validLogoUrl(bad),false,bad);
});

test('sponsor picks are weighted, deterministic per seed and respect placement and enabled',()=>{
 const list=[sponsor({id:'aaaaaaaa1111',weight:1}),sponsor({id:'bbbbbbbb2222',weight:9}),sponsor({id:'cccccccc3333',enabled:false}),sponsor({id:'dddddddd4444',placements:['crate']})];
 const a=pickSponsors(list,'billboard',3,seeded(7)).map(s=>s.id),b=pickSponsors(list,'billboard',3,seeded(7)).map(s=>s.id);
 assert.deepEqual(a,b);assert.equal(a.length,2);assert.ok(!a.includes('cccccccc3333')&&!a.includes('dddddddd4444'));
 assert.deepEqual(pickSponsors(list,'crate',1,seeded(1)).map(s=>s.id).length,1);
 let heavy=0;const r=seeded(99);for(let i=0;i<1000;i++)if(pickSponsors(list,'billboard',1,r)[0].id==='bbbbbbbb2222')heavy++;
 assert.ok(heavy>820&&heavy<960,`weight 9 of 10 picked ${heavy}/1000`);
 assert.deepEqual(pickSponsors([],'banner',1,Math.random),[]);
});
