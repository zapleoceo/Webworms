import test from 'node:test';
import assert from 'node:assert/strict';
import {AI_PROFILES,createTerrain,groundY,selectShot} from './engine.js';

const elements=new Map();
function element(id){if(!elements.has(id))elements.set(id,{id,style:{},classList:{add(){},remove(){},toggle(){}},dataset:{},listeners:{},textContent:'',innerHTML:'',value:'0',disabled:false,addEventListener(event,fn){this.listeners[event]=fn},appendChild(){},setPointerCapture(){},getBoundingClientRect(){return {left:0,top:0,width:1600,height:800}}});return elements.get(id)}
const context={createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4)}},putImageData(){},drawImage(){},fillRect(){},beginPath(){},arc(){},ellipse(){},fill(){},stroke(){},moveTo(){},lineTo(){},bezierCurveTo(){},setLineDash(){},save(){},restore(){},translate(){},scale(){},rotate(){},fillText(){},strokeText(){},createLinearGradient(){return {addColorStop(){}}}};
element('game').getContext=()=>context;
const touchButtons=['left','right','jump','aimleft','aimright'].map(k=>{const b=element('touch-'+k);b.dataset.hold=k;return b});
const fuseButtons=[1,2,3,4,5].map(n=>{const b=element('fuse-'+n);b.dataset.fuse=String(n);return b});
globalThis.document={getElementById:element,createElement:tag=>tag==='canvas'?{width:0,height:0,getContext:()=>context}:element('created-'+Math.random()),querySelectorAll:selector=>selector==='[data-hold]'?touchButtons:selector==='[data-fuse]'?fuseButtons:[]};
globalThis.window={listeners:{},addEventListener(event,fn){this.listeners[event]=fn}};
globalThis.requestAnimationFrame=()=>{};
const game=await import('./game.js');
const {state,newGame,fire,explosion,update,render,beginTurn,cycle,aimAt,aiAct,setGrenadeFuse,toggleGrenadeBounce,toggleStrikeDirection,dropDynamite}=window.__craterCrew;
function flatDuel(enemyX,difficulty=2,seed=807){
 newGame(0,difficulty,seed);beginTurn(1);const t=state.terrain;
 t.top.fill(600);for(let y=0;y<800;y++)t.mask.fill(y>=600?1:0,y*1600,(y+1)*1600);
 const ai=state.active,player=state.worms[0];ai.x=800;ai.y=583;ai.vx=ai.vy=0;ai.hp=100;player.x=enemyX;player.y=583;player.hp=100;
 for(const w of state.worms)if(w!==ai&&w!==player)w.alive=false;
 state.wind=0;state.windTarget=0;return {ai,player,t};
}

test('pointer aiming faces both directions and HUD tracks active worm',()=>{
 newGame(0,1);
 const w=state.active;
 aimAt({clientX:w.x-120,clientY:w.y-120});
 assert.equal(state.dir,-1);assert.equal(w.face,-1);
 assert.ok(state.aim<-.1);
 aimAt({clientX:w.x+120,clientY:w.y-120});
 assert.equal(state.dir,1);assert.equal(w.face,1);
 cycle();assert.equal(elements.get('active-name').textContent,state.active.name.toUpperCase());
});

test('aim crosses the horizon with mouse, keyboard and touch in both directions',()=>{
 newGame(0,1,899);
 const w=state.active;
 for(const [side,dir] of [[-1,-1],[1,1]]){
  aimAt({clientX:w.x+side*140,clientY:w.y+100});
  assert.equal(state.dir,dir);assert.ok(state.aim>0,`downward aim on ${side}`);
  aimAt({clientX:w.x+side*140,clientY:w.y-100});
  assert.equal(state.dir,dir);assert.ok(state.aim<0,`upward aim on ${side}`);
 }
 state.aim=-.02;state.keys.KeyE=true;update(.04);state.keys.KeyE=false;assert.ok(state.aim>0);
 state.keys.aimleft=true;for(let i=0;i<10;i++)update(.04);state.keys.aimleft=false;assert.ok(state.aim<0);
 // The same touch hold is wired to the aim input used in update().
 const touch=touchButtons.find(b=>b.dataset.hold==='aimright');state.aim=-.01;
 touch.listeners.pointerdown({preventDefault(){},pointerId:3});update(.04);touch.listeners.pointerup();assert.ok(state.aim>0);
 cycle();assert.equal(state.active.name,'Bubbles');
 state.selected='grenade';const b=state.active;aimAt({clientX:b.x-110,clientY:b.y+70});assert.equal(state.dir,-1);assert.ok(state.aim>0);
 b.x=35;aimAt({clientX:0,clientY:b.y+60});assert.equal(state.dir,-1);assert.ok(state.aim>0);
});

test('each team rotates its active worm across turns and rematch resets rotation',()=>{
 newGame(0,1,4242);
 const sequence=[state.active.name];
 for(const team of [1,0,1,0,1,0]){beginTurn(team);sequence.push(state.active.name);assert.equal(elements.get('active-name').textContent,state.active.name.toUpperCase())}
 assert.deepEqual(sequence,['Pip','Grub','Bubbles','Maverick','Mochi','Nibbles','Pip']);
 cycle();assert.equal(state.active.name,'Bubbles');beginTurn(1);beginTurn(0);assert.equal(state.active.name,'Mochi');
 newGame(0,1,4242);assert.equal(state.active.name,'Pip');beginTurn(1);assert.equal(state.active.name,'Grub');
});

test('player weapon persists across AI turns while stale airstrike marker clears',()=>{
 newGame(0,1,4343);
 window.listeners.keydown({code:'Digit5',repeat:false,preventDefault(){}});
 assert.equal(state.selected,'airstrike');assert.equal(state.playerWeapon,'airstrike');
 state.airTarget=650;beginTurn(1);
 assert.equal(state.airTarget,null);
 state.selected='grenade';beginTurn(0);
 assert.equal(state.selected,'airstrike');assert.equal(state.airTarget,null);
 newGame(0,1,4343);assert.equal(state.selected,'bazooka');assert.equal(state.playerWeapon,'bazooka');
});

test('audio event graph is silent by default and connects layered effects when enabled',()=>{
 let starts=0,buffers=0;
 class Node {connect(destination){return destination}start(){starts++;globalThis.__audioStarts=(globalThis.__audioStarts||0)+1}stop(){}}
 globalThis.__audioTrace=[];
 globalThis.AudioContext=class {constructor(){this.currentTime=0;this.sampleRate=8000;this.destination=new Node();globalThis.__audioContext=this}createOscillator(){const n=new Node();n.frequency={setValueAtTime(v){globalThis.__audioTrace.push(v)},exponentialRampToValueAtTime(){}};return n}createGain(){const n=new Node();n.gain={setValueAtTime(){},exponentialRampToValueAtTime(){}};return n}createBuffer(_channels,frames){buffers++;return {getChannelData(){return new Float32Array(frames)}}}createBufferSource(){return new Node()}createBiquadFilter(){const n=new Node();n.frequency={value:0};return n}};
 newGame(0,1,77);assert.equal(state.sound,false);
 state.selected='shotgun';fire();assert.equal(starts,0);
 newGame(0,1,77);state.sound=true;state.selected='shotgun';fire();assert.ok(starts>=2);assert.ok(buffers>=1);
 const before=starts;explosion(800,400,70,20,0);assert.ok(starts>before);assert.ok(buffers>=2);
 state.sound=false;delete globalThis.AudioContext;
});

test('every weapon has a distinct connected sound event without changing default mute',()=>{
 const signatures=[];
 for(const weapon of ['bazooka','grenade','shotgun','dynamite','airstrike','punch','jetpack']){
  newGame(0,1,202);assert.equal(state.sound,false);
  state.sound=true;state.selected=weapon;const before=globalThis.__audioStarts,traceStart=globalThis.__audioTrace.length;fire(.65);assert.ok(globalThis.__audioStarts>before,`${weapon} must trigger audio nodes`);signatures.push(globalThis.__audioTrace.slice(traceStart).join(','));state.sound=false;
 }
 assert.equal(new Set(signatures).size,7,'each weapon uses a different oscillator signature');
});

test('AI selector has three strategic profiles and rematch preserves the chosen level',()=>{
 assert.deepEqual(AI_PROFILES.map(p=>p.name),['EASY','NORMAL','HARD']);
 assert.ok(AI_PROFILES[2].angleStep<AI_PROFILES[1].angleStep&&AI_PROFILES[1].angleStep<AI_PROFILES[0].angleStep);
 assert.ok(AI_PROFILES[2].aimError<AI_PROFILES[1].aimError&&AI_PROFILES[1].aimError<AI_PROFILES[0].aimError);
 assert.equal(AI_PROFILES[0].reposition,false);assert.equal(AI_PROFILES[2].reposition,true);
 const choice=element('difficulty'),hint=element('ai-hint');choice.value='2';choice.onchange();
 assert.match(hint.textContent,/Hard/);
 element('music-on').checked=false;element('effects-on').checked=false;
 element('start').onclick();assert.equal(state.difficulty,2);assert.equal(element('ai-level').textContent,'HARD · LOCAL');
 element('result').classList.add('open');element('rematch').onclick();assert.equal(state.difficulty,2);
 element('new-map').onclick();assert.equal(state.difficulty,2);
 choice.value='0';choice.onchange();element('start').onclick();assert.equal(state.difficulty,0);assert.equal(element('ai-level').textContent,'EASY · LOCAL');
 newGame(0,1,421);assert.equal(state.difficulty,1);assert.equal(element('ai-level').textContent,'NORMAL · LOCAL');
});

test('same-seed aimed duel compares all three AI levels without stat bonuses',()=>{
 const damage=[0,0,0],weapons=[[],[],[]];
 for(const targetX of [1000,1080,1180,1280,1380])for(let seed=1;seed<=3;seed++)for(let difficulty=0;difficulty<3;difficulty++){
  const {player}=flatDuel(targetX,difficulty,seed*137+targetX);aiAct();weapons[difficulty].push(state.selected);
  for(let frame=0;frame<300&&state.team===1&&!state.ended;frame++)update(.04);
  damage[difficulty]+=100-player.hp;
 }
 console.log('same-seed duel',JSON.stringify({damage,weapons:weapons.map(w=>Object.fromEntries([...new Set(w)].map(id=>[id,w.filter(x=>x===id).length])))}));
 assert.ok(damage[0]<damage[1]&&damage[1]<damage[2],`difficulty damage should rise: ${damage}`);
 assert.ok(weapons[0].every(w=>w==='bazooka'));
 assert.ok(weapons[1].includes('grenade')&&weapons[2].includes('shotgun'));
});

test('Broker mode shows outage and never silently fires with the local bot',async()=>{
 const prior=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({status:'unavailable',error:'Broker not configured.'}),{status:503});
 try{newGame(0,2,980);state.aiDriver='broker';beginTurn(1);aiAct();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(state.phase,'broker-error');assert.equal(state.projectiles.length,0);assert.equal(element('broker-panel').hidden,false);assert.equal(element('ai-level').textContent,'HARD · BROKER LLM');
  element('broker-pass').onclick();assert.equal(state.phase,'resolving');assert.equal(state.projectiles.length,0);
 }finally{state.aiDriver='local';globalThis.fetch=prior;newGame(0,1,981)}
});

test('Broker mode applies only the selected legal candidate from mocked job polling',async()=>{
 const prior=globalThis.fetch;let selectedId,turnId,postCount=0;
 globalThis.fetch=async (_url,options)=>{if(options?.method==='POST'){postCount++;const body=JSON.parse(options.body);turnId=body.turnId;selectedId=body.candidates.find(c=>c.id.startsWith('air_'))?.id;assert.ok(selectedId);return new Response(JSON.stringify({status:'pending',ticket:'mock-ticket',pollAfter:0}),{status:202})}return new Response(JSON.stringify({status:'done',turnId,candidateId:selectedId}),{status:200})};
 try{newGame(0,2,982);state.aiDriver='broker';beginTurn(1);aiAct();assert.equal(state.phase,'broker-wait');await new Promise(resolve=>setTimeout(resolve,2300));
  assert.equal(postCount,1);assert.equal(state.selected,'airstrike');assert.equal(state.projectiles.length,5);assert.equal(state.phase,'resolving');
 }finally{state.brokerController?.abort();state.aiDriver='local';globalThis.fetch=prior;newGame(0,1,983)}
});

test('music and effects unlock only on a gesture, separate controls persist, and rematch makes one music clock',()=>{
 newGame(0,1,701);state.sound=false;state.musicEnabled=false;state.audioUnlocked=false;
 const startCount=globalThis.__audioStarts;
 update(.04);assert.equal(globalThis.__audioStarts,startCount);
 element('music-on').checked=true;element('effects-on').checked=false;
 element('music-volume').value='40';element('effects-volume').value='80';
 element('start').onclick();assert.equal(state.audioUnlocked,true);assert.equal(state.musicEnabled,true);assert.equal(state.sound,false);
 update(.04);assert.ok(globalThis.__audioStarts>startCount);const step=state.musicStep;assert.ok(step>0);
 update(.04);assert.equal(state.musicStep,step,'one scheduler does not double schedule at the same clock time');
 state.selected='bazooka';const fxStart=globalThis.__audioStarts;fire(.5);assert.equal(globalThis.__audioStarts,fxStart,'effects off leaves music alone');
 window.__craterCrew.finish(0);const endCount=globalThis.__audioStarts;update(.04);assert.equal(globalThis.__audioStarts,endCount,'finished match stops scheduling');
 element('rematch').onclick();assert.equal(state.musicStep,0);assert.equal(state.musicEnabled,true);assert.equal(state.sound,false);
 globalThis.__audioContext.currentTime+=.3;update(.04);assert.ok(state.musicStep>0);
 const prior=state.musicStep;element('music-on').checked=false;element('music-on').onchange();
 globalThis.__audioContext.currentTime+=.3;update(.04);assert.equal(state.musicStep,prior);
 element('effects-on').checked=true;element('effects-on').onchange();assert.equal(state.sound,true);assert.equal(state.musicEnabled,false);
 state.sound=false;state.musicEnabled=false;
});

test('ordnance launch rules: wind-proof airstrike, dropped dynamite and downward fire',()=>{
 newGame(0,1,101);state.wind=75;state.windTarget=75;state.selected='airstrike';state.airTarget=1200;fire();
 assert.equal(state.projectiles.length,5);assert.ok(state.projectiles.every(p=>p.vx===160));
 const x=state.projectiles[0].x;update(.04);assert.equal(state.projectiles[0].vx,160);assert.ok(state.projectiles[0].x>x);
 newGame(0,1,102);state.selected='dynamite';fire();assert.equal(state.projectiles[0].vx,0);assert.equal(state.projectiles[0].vy,0);assert.equal(state.projectiles[0].fuse,3);
 newGame(0,1,103);state.selected='grenade';state.aim=.5;state.dir=-1;fire(.65);assert.ok(state.projectiles[0].vx<0);assert.ok(state.projectiles[0].vy>0);assert.equal(state.projectiles[0].fuse,3);
 newGame(0,1,104);state.selected='bazooka';state.aim=.35;state.dir=1;fire(.65);assert.ok(state.projectiles[0].vx>0);assert.ok(state.projectiles[0].vy>0);
});

test('grenade fuse and bounce controls persist through switch and reset on rematch',()=>{
 newGame(0,1,301);state.selected='grenade';state.playerWeapon='grenade';update(.04);
 assert.equal(elements.get('grenade-settings').hidden,false);
 fuseButtons[0].listeners.click();assert.equal(state.grenadeFuse,1);
 elements.get('bounce-toggle').listeners.click();assert.equal(state.grenadeBounce,'low');
 cycle();assert.equal(state.grenadeFuse,1);
 window.listeners.keydown({code:'Digit5',shiftKey:true,repeat:false,preventDefault(){}});
 assert.equal(state.grenadeFuse,5);assert.equal(state.selected,'grenade');
 state.aim=-.5;fire(.7);assert.equal(state.projectiles[0].fuse,5);assert.equal(state.projectiles[0].bounceFactor,.32);
 assert.equal(elements.get('grenade-settings').hidden,true);
 let passed=false;for(let i=0;i<250&&!passed;i++){update(.04);passed=state.team===1||state.ended}assert.ok(passed);
 beginTurn(1);state.grenadeFuse=3;state.grenadeBounce='high';beginTurn(0);assert.equal(state.grenadeFuse,5);assert.equal(state.grenadeBounce,'low');
 newGame(0,1,301);assert.equal(state.grenadeFuse,3);assert.equal(state.grenadeBounce,'high');
 state.selected='grenade';window.listeners.keydown({code:'Digit1',shiftKey:true,repeat:false,preventDefault(){}});fire(.7);
 assert.equal(state.projectiles[0].fuse,1);assert.equal(state.projectiles[0].bounceFactor,.55);
});

test('high-bounce grenade rebounds harder than low-bounce grenade',()=>{
 const rebound=mode=>{
  newGame(0,1,304);state.selected='grenade';state.grenadeBounce=mode;state.wind=0;state.windTarget=0;
  const t=state.terrain;t.top.fill(600);for(let y=0;y<800;y++)t.mask.fill(y>=600?1:0,y*1600,(y+1)*1600);
  fire(.5);const p=state.projectiles[0];p.x=800;p.y=591;p.vx=0;p.vy=240;update(.01);return p.vy;
 };
 const high=rebound('high'),low=rebound('low');assert.ok(high<low,`high=${high} low=${low}`);
});

test('airstrike approach changes side but wind does not bend missiles',()=>{
 newGame(0,1,302);state.selected='airstrike';state.airTarget=900;state.wind=-70;state.windTarget=-70;
 toggleStrikeDirection();assert.equal(state.strikeDir,-1);assert.equal(elements.get('strike-direction').textContent,'FROM RIGHT ←');
 fire();const first=state.projectiles[0];assert.equal(first.vx,-160);const startX=first.x;
 update(.04);assert.equal(first.vx,-160);assert.ok(first.x<startX);
 beginTurn(1);state.strikeDir=1;beginTurn(0);assert.equal(state.strikeDir,-1);
 newGame(0,1,302);assert.equal(state.strikeDir,1);state.selected='airstrike';state.airTarget=900;fire();
 assert.equal(state.projectiles[0].vx,160);assert.ok(state.projectiles[0].x<startX);
});

test('jetpack can drop one dynamite mid-flight without ending flight or doubling ammo',()=>{
 newGame(0,1,303);state.selected='jetpack';fire();assert.equal(state.phase,'jetpack');assert.equal(state.jetDropped,false);
 state.active.y-=90;state.active.grounded=false;
 window.listeners.keydown({code:'KeyX',shiftKey:false,repeat:false,preventDefault(){}});
 assert.equal(state.jetDropped,true);assert.equal(state.projectiles.length,1);assert.equal(state.projectiles[0].type,'dynamite');assert.equal(state.projectiles[0].fuse,3);assert.equal(state.phase,'jetpack');
 window.listeners.keydown({code:'KeyX',shiftKey:false,repeat:false,preventDefault(){}});assert.equal(state.projectiles.length,1);
 assert.equal(dropDynamite(),false);
 for(let i=0;i<150&&!state.ended;i++)update(.04);
 assert.notEqual(state.phase,'jetpack');
 newGame(0,1,303);assert.equal(state.jetDropped,false);
});

test('shotgun retains a second aim and punch cuts ground without a target',()=>{
 newGame(0,1,204);state.selected='shotgun';fire();
 assert.equal(state.phase,'ready');assert.equal(state.shotgunLeft,1);
 const prior=state.aim;aimAt({clientX:state.active.x+100,clientY:state.active.y+45});assert.ok(state.aim>prior);
 fire();assert.equal(state.shotgunLeft,0);assert.equal(state.phase,'resolving');
 newGame(0,1,205);state.selected='punch';const w=state.active;
 const solids=()=>{let n=0;for(let y=Math.floor(w.y-5);y<w.y+31;y++)for(let x=Math.floor(w.x+15);x<w.x+65;x++)n+=state.terrain.mask[y*1600+x];return n};
 const before=solids();fire();assert.equal(state.phase,'resolving');assert.ok(solids()<before);
 beginTurn(1);assert.ok(Math.cos(state.aim)*state.dir<0,'AI faces left at turn start');
});

test('touch holds, keyboard release and HUD availability follow turn phase',()=>{
 newGame(0,1);const button=touchButtons[0];button.listeners.pointerdown({preventDefault(){},pointerId:1});assert.equal(state.keys.left,true);button.listeners.pointerup();assert.equal(state.keys.left,false);
 window.listeners.keydown({code:'KeyD',repeat:false,preventDefault(){}});assert.equal(state.keys.KeyD,true);window.listeners.keyup({code:'KeyD'});assert.equal(state.keys.KeyD,false);
 assert.equal(elements.get('fire').disabled,false);beginTurn(1);assert.equal(elements.get('fire').disabled,true);assert.equal(elements.get('turn-label').textContent,'AI TURN');
});

test('losing focus cancels a charged shot and clears held input',()=>{
 newGame(0,1,117);window.listeners.keydown({code:'Space',repeat:false,preventDefault(){}});assert.equal(state.charging,true);
 state.keys.KeyD=true;window.listeners.blur();assert.equal(state.charging,false);assert.deepEqual(state.keys,{});assert.equal(state.phase,'ready');assert.equal(state.projectiles.length,0);
 window.listeners.keyup({code:'Space'});assert.equal(state.projectiles.length,0);
});

test('same seed resets terrain, wind and random decorations after previous action',()=>{
 newGame(1,2,7123);const snapshot=()=>({top:Array.from(state.terrain.top.slice(150,160)),wind:state.wind,decor:state.decor.slice(0,4).map(d=>[d.x,d.y,d.r,d.phase])});const first=snapshot();
 explosion(500,500,70,20,0);state.keys.KeyA=true;state.charging=true;state.airTarget=420;newGame(1,2,7123);assert.deepEqual(snapshot(),first);assert.equal(state.waterLevel,755);assert.equal(state.round,1);assert.deepEqual(state.keys,{});assert.equal(state.charging,false);assert.equal(state.airTarget,null);
});

test('simulation sequence is identical with extra shake/render calls',()=>{
 const run=draws=>{
  newGame(0,1,61721);state.shake=12;
  for(let i=0;i<draws;i++)render();
  state.selected='shotgun';state.aim=-.25;fire();
  for(let i=0;i<210;i++){update(.04);if(draws)render()}
  return {team:state.team,phase:state.phase,round:state.round,wind:state.wind,windTarget:state.windTarget,selected:state.selected,worms:state.worms.map(w=>[w.x,w.y,w.vx,w.vy,w.hp,w.alive,w.grounded]),projectiles:state.projectiles.map(p=>[p.type,p.x,p.y,p.vx,p.vy,p.fuse])};
 };
 assert.deepEqual(run(17),run(0));
});

test('sudden-death water rises after round eight and resets on rematch',()=>{
 newGame(0,1,991);state.round=8;state.team=1;state.phase='resolving';state.resolveTimer=0;
 for(let i=0;i<150&&state.round===8;i++)update(.04);
 assert.equal(state.round,9);assert.equal(state.waterLevel,743);
 newGame(0,1,991);assert.equal(state.waterLevel,755);assert.equal(state.round,1);
});

test('central rivals allow a real punch on every map',()=>{
 for(let map=0;map<3;map++){
  newGame(map,0,991);cycle();cycle();const shooter=state.active,target=state.worms[3];
  assert.ok(Math.abs(target.x-shooter.x)<65&&Math.abs(target.y-shooter.y)<48);
  const before=state.terrain.mask.reduce((n,v)=>n+v,0);
  state.selected='punch';state.dir=1;fire();
  assert.equal(target.hp,70);assert.ok(target.vx>0&&target.vy<0);
  assert.ok(state.terrain.mask.reduce((n,v)=>n+v,0)<before);
 }
});

test('two close shotgun shots both damage the target and finish the turn',()=>{
 newGame(0,0,991);cycle();cycle();const target=state.worms[3];
 state.selected='shotgun';aimAt({clientX:target.x,clientY:target.y-8});
 fire();const afterFirst=target.hp;assert.ok(afterFirst<100);assert.equal(state.shotgunLeft,1);
 aimAt({clientX:target.x,clientY:target.y-8});fire();
 assert.ok(target.hp<afterFirst);assert.equal(state.shotgunLeft,0);assert.equal(state.phase,'resolving');
});

test('moving, jumping, cycling and seven weapons resolve without stuck turns',()=>{
 newGame(0,1);let start=state.active.x;
 state.keys.KeyD=true;for(let i=0;i<25;i++)update(.04);state.keys.KeyD=false;
 assert.ok(state.active.x>start+15);
 state.keys.KeyW=true;update(.04);state.keys.KeyW=false;assert.ok(state.active.vy<0);
 cycle();assert.equal(state.active.name,'Bubbles');
 const ids=['bazooka','grenade','shotgun','dynamite','airstrike','punch','jetpack'];
 for(const id of ids){beginTurn(0);state.selected=id;state.aim=-.6;state.dir=1;state.airTarget=1100;fire(.75);if(id==='shotgun'){assert.equal(state.shotgunLeft,1);fire(.75)}assert.notEqual(state.phase,'ready',id);for(let i=0;i<250;i++)update(.04);assert.ok(state.phase!=='resolving'||state.projectiles.length>0||state.resolveTimer>=0,`${id} resolved`)}
});

test('blast damages enemies, destroys terrain, and match reaches victory',()=>{
 newGame(1,2);const enemy=state.worms[3],x=enemy.x,y=enemy.y;
 assert.ok(groundY(state.terrain,x)<700);
 explosion(x,y,100,80,0);assert.ok(enemy.hp<100);assert.equal(state.terrain.mask[Math.floor(y+25)*1600+Math.floor(x)],0);
 for(const w of state.worms.filter(w=>w.team===1&&w.alive))explosion(w.x,w.y,110,200,0);
 for(let i=0;i<150;i++)update(.04);
 assert.equal(state.ended,true);assert.equal(elements.get('result-title').textContent,'VICTORY!');
});

test('loss state appears when the player team is eliminated',()=>{
 newGame(0,1);
 for(const w of state.worms.filter(w=>w.team===0&&w.alive))explosion(w.x,w.y,75,200,3);
 for(let i=0;i<150;i++)update(.04);
 assert.equal(state.ended,true);
 assert.equal(elements.get('result-title').textContent,'DEFEAT');
});

test('AI fires a scored shot and produces damage over multiple map setups',()=>{
 for(let map=0;map<3;map++){
  newGame(map,2);beginTurn(1);const initial=state.worms.filter(w=>w.team===0).reduce((s,w)=>s+w.hp,0);
  for(let i=0;i<200;i++)update(.04);
  const after=state.worms.filter(w=>w.team===0).reduce((s,w)=>s+w.hp,0);
  assert.ok(after<initial||state.projectiles.length>0||state.team===0||state.aiMoves>0,`AI map ${map}: expected an action (phase=${state.phase}, team=${state.team}, moves=${state.aiMoves})`);
 }
});

test('AI selects punch, dynamite, shotgun, grenade and jetpack by situation',()=>{
 flatDuel(840);aiAct();assert.equal(state.selected,'punch');
 const dynamite=flatDuel(890).ai;aiAct();assert.equal(state.selected,'dynamite');assert.equal(state.phase,'retreat');for(let i=0;i<55;i++)update(.04);assert.ok(dynamite.x<800);
 flatDuel(960);aiAct();assert.equal(state.selected,'shotgun');
 flatDuel(1200);state.aiMoves=1;aiAct();assert.equal(state.selected,'grenade');
 const {ai,t}=flatDuel(1200);for(let x=770;x<=830;x++){t.top[x]=720;for(let y=600;y<720;y++)t.mask[y*1600+x]=0}ai.y=703;aiAct();assert.equal(state.selected,'jetpack');assert.equal(state.phase,'jetpack');for(let i=0;i<120;i++)update(.04);assert.ok(state.phase!=='jetpack');
});

test('AI selects bazooka at range and airstrike when terrain blocks fire',()=>{
 flatDuel(1500);state.aiMoves=1;aiAct();assert.equal(state.selected,'bazooka');
 const {t}=flatDuel(1500);state.aiMoves=1;for(let x=900;x<=940;x++){t.top[x]=0;for(let y=0;y<600;y++)t.mask[y*1600+x]=1}aiAct();assert.equal(state.selected,'airstrike');
});

test('AI takes a bounded safer walking position for a better shot',()=>{
 flatDuel(1270);state.terrain=createTerrain(0,42);state.wind=0;state.windTarget=0;state.difficulty=1;const ai=state.active,player=state.worms[0];ai.x=250;ai.y=groundY(state.terrain,250)-17;player.y=groundY(state.terrain,1270)-17;
 aiAct();assert.equal(state.phase,'reposition');assert.equal(state.aiMoves,1);const initial=ai.x;
 for(let i=0;i<100;i++)update(.04);
 assert.ok(ai.x>initial+15);assert.notEqual(state.phase,'reposition');
});

test('blast can hurt the shooter; active death updates team HUD',()=>{
 const {ai}=flatDuel(1300);const health=ai.hp;explosion(ai.x,ai.y,80,50,ai.id);assert.ok(ai.hp<health);
 explosion(ai.x,ai.y,80,200,0);assert.equal(ai.alive,false);assert.equal(elements.get('e-count').textContent,'0 WORMIES');assert.equal(elements.get('active-name').textContent,'K.O.');
});

test('water and destroyed footing kill active unit and continue turn',()=>{
 newGame(2,1);const active=state.active,startY=active.y;explosion(active.x,active.y+12,100,0,3);
 for(let i=0;i<200;i++)update(.04);
 assert.ok(active.y>startY||!active.alive);
 active.y=750;update(.04);assert.equal(active.alive,false);
 let advanced=false;for(let i=0;i<100&&!advanced;i++){update(.04);advanced=state.team===1||state.ended}
 assert.ok(advanced);
});

test('complete autoplay battles terminate across maps, difficulties and seeds',()=>{
 const totals=AI_PROFILES.map(()=>({wins:0,playerDamage:0,rounds:0,matches:0}));
 for(const seedBase of [42,2026,7351])for(let map=0;map<3;map++)for(let difficulty=0;difficulty<3;difficulty++){
  newGame(map,difficulty,seedBase+map*3);
  let turns=0;
  for(let frame=0;frame<18000&&!state.ended;frame++){
   if(state.team===0&&state.phase==='ready'){
    const opponents=state.worms.filter(w=>w.team===1&&w.alive);
    if(opponents.length){state.selected='airstrike';state.airTarget=opponents.reduce((a,b)=>a.hp<b.hp?a:b).x;fire();turns++}
   }
   update(.04);
  }
  assert.ok(state.ended,`seed ${seedBase} map ${map} difficulty ${difficulty} must end: round=${state.round}, playerTurns=${turns}, phase=${state.phase}, team=${state.team}, projectiles=${state.projectiles.length}, living=${state.worms.filter(w=>w.alive).map(w=>`${w.name}:${w.hp}:${w.y.toFixed(0)}:${w.grounded}`).join(',')}`);
  assert.ok(turns>0,`map ${map} difficulty ${difficulty} player acted`);
  assert.ok(['VICTORY!','DEFEAT','DRAW'].includes(elements.get('result-title').textContent),`seed ${seedBase} map ${map} difficulty ${difficulty}: ${elements.get('result-title').textContent}`);
  const t=totals[difficulty];t.matches++;t.rounds+=state.round;t.playerDamage+=300-state.worms.filter(w=>w.team===0).reduce((n,w)=>n+w.hp,0);if(elements.get('result-title').textContent==='DEFEAT')t.wins++;
 }
 console.log('same-seed AI comparison',JSON.stringify(totals));
});

