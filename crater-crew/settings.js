// Game settings shared by the browser game, the admin page and the server API.
// DEFAULT_SETTINGS equals the game's built-in behaviour, so a missing or broken settings document changes nothing.
// Plain ES module without Node imports: the browser loads this file as is.

export const CONTROLLERS=['human','easy','hard','ultra'];
export const PLACEMENTS=['billboard','crate','banner'];
export const MAP_COUNT=4;
export const MAX_SPONSORS=20;

export const DEFAULT_SETTINGS=Object.freeze({
 match:{turnTime:35,teleports:2},
 props:{mines:8,barrels:6,crateChance:.3,crateHeal:25},
 water:{suddenDeathRound:9,waterRise:12},
 // startMax: the wind at the start of a match is uniform in ±startMax; turnDrift: each turn it moves by up to
 // ±turnDrift; cap: it never exceeds ±cap.
 wind:{startMax:36,turnDrift:20,cap:80},
 maps:{enabled:[0,1,2,3]},
 players:{defaults:['human','easy'],offerHard:true,offerUltra:true},
 audio:{music:true,musicVolume:42,effects:true,effectsVolume:65,voices:true},
 sponsors:[],
});

// Field rules: [kind, ...limits]. Kinds: int, num, bool.
const FIELDS={
 match:{turnTime:['int',10,120],teleports:['int',0,9]},
 props:{mines:['int',0,30],barrels:['int',0,30],crateChance:['num',0,1],crateHeal:['int',0,100]},
 water:{suddenDeathRound:['int',2,99],waterRise:['int',0,60]},
 wind:{startMax:['int',0,100],turnDrift:['int',0,60],cap:['int',0,100]},
 players:{offerHard:['bool'],offerUltra:['bool']},
 audio:{music:['bool'],musicVolume:['int',0,100],effects:['bool'],effectsVolume:['int',0,100],voices:['bool']},
};
export const LIMITS=FIELDS;

const isObj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const clone=v=>JSON.parse(JSON.stringify(v));
export const defaultSettings=()=>clone(DEFAULT_SETTINGS);

function checkField(value,[kind,min,max]){
 if(kind==='bool')return typeof value==='boolean'?null:'must be true or false';
 if(typeof value!=='number'||!Number.isFinite(value))return 'must be a number';
 if(kind==='int'&&!Number.isInteger(value))return 'must be a whole number';
 if(value<min||value>max)return `must be between ${min} and ${max}`;
 return null;
}

const SPONSOR_ID=/^[a-z0-9]{8,32}$/;
// Logos are only ever written by the server: an https URL (Vercel Blob) or a same-origin local-dev path.
export const validLogoUrl=s=>typeof s==='string'&&s.length<=500&&(/^https:\/\/[^\s"'<>\\]+$/.test(s)||/^\/[a-z0-9._\/-]+$/i.test(s)&&!s.includes('..')&&!s.startsWith('//'));
export function validLink(s){
 if(typeof s!=='string'||s.length>300||/\s/.test(s))return false;
 try{const u=new URL(s);return u.protocol==='https:'&&Boolean(u.hostname)&&!u.username&&!u.password}catch{return false}
}

function checkSponsor(s,i,errors){
 const at=`sponsors[${i}]`;
 if(!isObj(s)){errors.push(`${at}: must be an object`);return null}
 const out={};let bad=false;const fail=m=>{errors.push(`${at}.${m}`);bad=true};
 if(typeof s.id!=='string'||!SPONSOR_ID.test(s.id))fail('id: invalid');else out.id=s.id;
 const name=typeof s.name==='string'?s.name.trim():null;
 if(!name||name.length>40)fail('name: 1 to 40 characters');else out.name=name;
 if(!validLogoUrl(s.logoUrl))fail('logoUrl: invalid');else out.logoUrl=s.logoUrl;
 const link=s.link===undefined||s.link===null?'':s.link;
 if(link!==''&&!validLink(link))fail('link: must be an https:// address');else out.link=link;
 const weight=s.weight===undefined?1:s.weight;
 if(!Number.isInteger(weight)||weight<1||weight>100)fail('weight: whole number 1 to 100');else out.weight=weight;
 const enabled=s.enabled===undefined?true:s.enabled;
 if(typeof enabled!=='boolean')fail('enabled: must be true or false');else out.enabled=enabled;
 const placements=s.placements===undefined?[...PLACEMENTS]:s.placements;
 if(!Array.isArray(placements)||!placements.every(p=>PLACEMENTS.includes(p))||new Set(placements).size!==placements.length)fail(`placements: subset of ${PLACEMENTS.join(', ')}`);
 else out.placements=PLACEMENTS.filter(p=>placements.includes(p));
 return bad?null:out;
}

// Strict validation for an admin save: every present value must be valid, unknown keys are dropped, missing
// sections and fields take their defaults. Returns {ok, value, errors}.
export function validateSettings(input){
 const errors=[],value=defaultSettings();
 if(!isObj(input))return {ok:false,value,errors:['settings: must be an object']};
 for(const [section,fields] of Object.entries(FIELDS)){
  const src=input[section];if(src===undefined)continue;
  if(!isObj(src)){errors.push(`${section}: must be an object`);continue}
  for(const [key,rule] of Object.entries(fields)){
   if(src[key]===undefined)continue;
   const e=checkField(src[key],rule);if(e)errors.push(`${section}.${key}: ${e}`);else value[section][key]=src[key];
  }
 }
 if(input.maps!==undefined){
  const en=isObj(input.maps)?input.maps.enabled:undefined;
  if(!Array.isArray(en)||!en.length||!en.every(n=>Number.isInteger(n)&&n>=0&&n<MAP_COUNT)||new Set(en).size!==en.length)errors.push(`maps.enabled: a non-empty list of distinct map numbers 0..${MAP_COUNT-1}`);
  else value.maps.enabled=[...en].sort((a,b)=>a-b);
 }
 if(isObj(input.players)&&input.players.defaults!==undefined){
  const d=input.players.defaults;
  if(!Array.isArray(d)||d.length!==2||!d.every(c=>CONTROLLERS.includes(c)))errors.push(`players.defaults: two of ${CONTROLLERS.join(', ')}`);
  else value.players.defaults=[...d];
 }
 if(input.sponsors!==undefined){
  if(!Array.isArray(input.sponsors)||input.sponsors.length>MAX_SPONSORS)errors.push(`sponsors: a list of at most ${MAX_SPONSORS}`);
  else{const ids=new Set();value.sponsors=[];input.sponsors.forEach((s,i)=>{const v=checkSponsor(s,i,errors);if(!v)return;if(ids.has(v.id)){errors.push(`sponsors[${i}].id: duplicate`);return}ids.add(v.id);value.sponsors.push(v)})}
 }
 // Cross-field rules.
 if(value.wind.startMax>value.wind.cap)errors.push('wind.startMax: must not exceed wind.cap');
 for(const [lvl,flag] of [['hard','offerHard'],['ultra','offerUltra']])if(!value.players[flag]&&value.players.defaults.includes(lvl))errors.push(`players.defaults: ${lvl} is not offered`);
 return {ok:errors.length===0,value,errors};
}

// Lenient merge for reading: any invalid stored value falls back to its default field by field, so one bad value
// never disables the rest. Used by GET /api/settings and by the game on whatever it fetched.
export function mergeSettings(stored){
 const out=defaultSettings();if(!isObj(stored))return out;
 for(const [section,fields] of Object.entries(FIELDS)){
  const src=stored[section];if(!isObj(src))continue;
  for(const [key,rule] of Object.entries(fields))if(src[key]!==undefined&&!checkField(src[key],rule))out[section][key]=src[key];
 }
 if(stored.maps!==undefined){const r=validateSettings({maps:stored.maps});if(r.ok)out.maps=r.value.maps}
 if(isObj(stored.players)&&stored.players.defaults!==undefined){const r=validateSettings({players:{defaults:stored.players.defaults}});if(r.ok)out.players.defaults=r.value.players.defaults}
 if(Array.isArray(stored.sponsors)){const errs=[],ids=new Set();out.sponsors=stored.sponsors.slice(0,MAX_SPONSORS).map((s,i)=>checkSponsor(s,i,errs)).filter(s=>s&&!ids.has(s.id)&&ids.add(s.id))}
 if(out.wind.startMax>out.wind.cap)out.wind.startMax=out.wind.cap;
 if(!out.players.offerHard||!out.players.offerUltra)out.players.defaults=out.players.defaults.map(c=>c==='hard'&&!out.players.offerHard||c==='ultra'&&!out.players.offerUltra?'easy':c);
 return out;
}

// Deterministic weighted pick of up to `count` distinct sponsors for one placement (seeded by the match seed).
export function pickSponsors(sponsors,placement,count,rand){
 const pool=(sponsors||[]).filter(s=>s&&s.enabled!==false&&s.placements?.includes(placement)),out=[];
 while(out.length<count&&pool.length){
  const total=pool.reduce((a,s)=>a+(s.weight||1),0);let r=rand()*total,i=0;
  for(;i<pool.length-1;i++){r-=pool[i].weight||1;if(r<0)break}
  out.push(pool.splice(i,1)[0]);
 }
 return out;
}
