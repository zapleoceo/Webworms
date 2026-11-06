import {drawEnvironment,drawCharacter,drawOrdnance,TEAM_COLORS} from './art.js';
import {bakeSoil,paintTerrain,grassDepths} from './terrain-art.js';
import {themes} from './themes.js';
import {drawHud} from './hud.js';
import {weaponIcon} from './icons.js';
import {makeBlast,drawBlast} from './effects.js';
import {bakeBackground,drawBackdrop,drawAmbient,drawWater} from './scenery.js';
import {brokerTurnOptions,brokerSnapshot} from './broker-ai.js';
import {clearPendingTurn,savePendingTurn,readPendingTurn} from './broker-resume.js';
import {W,H,WATER,R,GRAVITY,WEAPONS,data,AI_PROFILES,clamp,seeded,createTerrain,solid,carve,groundY,blastDamage,selectShot,selectLob,AIM_MIN,AIM_MAX,aimAngle,VIEW_W,VIEW_H,spawnSpots,BODIES,stepBody,crawl,wormFits,wormGrounded,WALK_SPEED} from './engine.js';
import {voice,stopVoices,configureVoices,loadVoices} from './voice.js';
import {createMusic} from './music.js';
import {placeProps,dropCrate,blastProps,updateProps,drawProps,propsBusy} from './props.js';
// Match settings, like a classic scheme: map props and how often a health crate drops at turn start.
const scheme={mines:8,barrels:6,crateChance:.3};
const $=id=>document.getElementById(id), canvas=$('game'),ctx=canvas.getContext('2d');
const names=[['Pip','Bubbles','Mochi'],['Grub','Maverick','Nibbles']];
const mapNames=['SUNSET COVE','CINDER PEAKS','MOONLIT ATOLL'];
const state={running:false,ended:false,map:0,difficulty:1,aiDriver:'local',brokerController:null,brokerTicket:null,brokerTurnId:null,brokerRequest:null,brokerSavedAt:null,brokerSequence:0,brokerOptions:[],brokerError:'',terrain:null,terrainCanvas:null,worms:[],projectiles:[],particles:[],blasts:[],decor:[],team:0,active:null,lastActiveId:[-1,-1],selected:'bazooka',playerWeapon:'bazooka',phase:'ready',timer:35,round:1,waterLevel:WATER,wind:0,windTarget:0,aim:-0.75,dir:1,power:.5,charging:false,chargeDir:1,used:false,shotgunLeft:0,grenadeFuse:3,grenadeBounce:'high',strikeDir:1,playerGrenadeFuse:3,playerGrenadeBounce:'high',playerStrikeDir:1,jetDropped:false,keys:{},aiTimer:0,aiMoves:0,aiTarget:0,aiMoveTime:0,aiRetreat:0,resolveTimer:0,message:'',messageTimer:0,shake:0,sound:false,musicEnabled:false,fxVolume:.65,musicVolume:.42,audioUnlocked:false,musicStep:0,musicNextTime:0,jetTime:0};
let simRand=seeded(77421),visualRand=seeded(19031);
const simRandom=()=>{state.simDraws=(state.simDraws||0)+1;return simRand()};
const newMatchId=()=>{const bytes=new Uint8Array(8);globalThis.crypto.getRandomValues(bytes);return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')};
let audio=null;
function tone(freq=300,duration=.15,type='triangle',volume=.08,slide=0){if(!state.sound||state.fxVolume===0)return;try{audio??=new AudioContext();const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.setValueAtTime(freq,audio.currentTime);if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(30,slide),audio.currentTime+duration);g.gain.setValueAtTime(volume*state.fxVolume,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+duration)}catch{}}
function noise(duration=.18,volume=.07,cutoff=1400){if(!state.sound||state.fxVolume===0)return;try{audio??=new AudioContext();const frames=Math.ceil(audio.sampleRate*duration),buffer=audio.createBuffer(1,frames,audio.sampleRate),samples=buffer.getChannelData(0);for(let i=0;i<frames;i++)samples[i]=Math.random()*2-1;const source=audio.createBufferSource(),filter=audio.createBiquadFilter(),gain=audio.createGain();source.buffer=buffer;filter.type='lowpass';filter.frequency.value=cutoff;gain.gain.setValueAtTime(volume*state.fxVolume,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);source.connect(filter).connect(gain).connect(audio.destination);source.start();source.stop(audio.currentTime+duration)}catch{}}
// Music: well-known public-domain tunes synthesised in music.js; one per match, a tense one for sudden death.
const music=createMusic(()=>audio);
function musicTick(){music.tick(state)}
function unlockAudio(){if(!state.audioUnlocked){try{audio??=new AudioContext();audio.resume?.();state.audioUnlocked=true;loadVoices(audio)}catch{return}}if(state.musicEnabled){state.musicStep=0;state.musicNextTime=0}}
function chirp(){tone(720,.12,'sine',.055,1040);tone(360,.17,'triangle',.025,520)}
function wormCry(){tone(510,.11,'sawtooth',.026,290);tone(860,.18,'triangle',.022,420)}
function weaponSound(id){
 if(id==='bazooka'){noise(.22,.065,900);tone(180,.32,'sawtooth',.05,65)}
 else if(id==='grenade'){tone(960,.09,'triangle',.055,520);tone(420,.18,'sine',.03,280)}
 else if(id==='shotgun'){noise(.24,.13,2700);tone(110,.2,'square',.035,48)}
 else if(id==='dynamite'){noise(.4,.024,3800);tone(700,.1,'square',.035,320)}
 else if(id==='airstrike'){tone(800,.7,'sawtooth',.045,110);noise(.3,.03,1100)}
 else if(id==='punch'){noise(.12,.09,400);tone(140,.15,'triangle',.07,55)}
 else if(id==='jetpack'){noise(.55,.07,2400);tone(280,.4,'sawtooth',.025,470)}
}
function say(text,time=2){state.message=text;state.messageTimer=time;$('message').textContent=text}
function buildTerrain(rect=null){
 const t=state.terrain,th=themes[state.map],key=state.seed+':'+state.map;
 if(!state.soil||state.soil.key!==key)state.soil={key,...bakeSoil(state.map,state.seed,W,H,th)};
 if(!state.terrainBuf){const off=document.createElement('canvas');off.width=W;off.height=H;const c=off.getContext('2d');state.terrainBuf={off,c,im:c.createImageData(W,H),run:new Uint16Array(W),grass:grassDepths(W)}}
 const {off,c,im,run,grass}=state.terrainBuf;
 paintTerrain(im.data,run,grass,t.mask,state.soil,th,W,H,rect);
 if(rect){const x=Math.max(0,rect.x0),y=Math.max(0,rect.y0);c.putImageData(im,0,0,x,y,Math.min(W-1,rect.x1)-x+1,H-y)}else c.putImageData(im,0,0);
 state.terrainCanvas=off;
}
function newGame(map=0,difficulty=1,seed=Math.floor(Date.now()%1e9),preservePending=false){
 stopVoices();if(!preservePending)clearPendingTurn();state.brokerController?.abort();state.brokerController=null;state.brokerTicket=null;state.brokerTurnId=null;state.brokerRequest=null;state.brokerSavedAt=null;state.brokerOptions=[];state.brokerSequence=0;$('broker-panel').hidden=true;
 simRand=seeded((seed^0x9e3779b9)>>>0);visualRand=seeded((seed^0x7f4a7c15)>>>0);state.seed=seed;state.matchId=newMatchId();state.simDraws=0;state.map=map;state.difficulty=clamp(Number(difficulty)||0,0,2);state.musicStep=0;state.musicNextTime=0;state.terrain=createTerrain(map,seed);buildTerrain();state.worms=[];state.projectiles=[];state.particles=[];state.blasts=[];state.decor=[];state.team=0;state.active=null;state.lastActiveId=[0,-1];state.phase='ready';state.timer=35;state.round=1;state.waterLevel=WATER;state.ended=false;state.running=true;state.used=false;state.shotgunLeft=0;state.grenadeFuse=3;state.grenadeBounce='high';state.strikeDir=1;state.playerGrenadeFuse=3;state.playerGrenadeBounce='high';state.playerStrikeDir=1;state.jetDropped=false;state.selected='bazooka';state.playerWeapon='bazooka';state.airTarget=null;state.aim=-.72;state.dir=1;state.power=.5;state.charging=false;state.keys={};state.aiTimer=0;state.resolveTimer=0;state.jetTime=0;state.jetPulse=0;state.shake=0;state.wind=(simRandom()-.5)*72;state.windTarget=state.wind;state.aiMoves=0;state.aiTarget=0;state.aiMoveTime=0;state.aiRetreat=0;
 // Random level spots across the big map; teams alternate along it so rivals start within range.
 const spots=spawnSpots(state.terrain,seed);
 for(let team=0;team<2;team++)for(let i=0;i<3;i++){const s=spots[i*2+team]??{x:400+(i*2+team)*500,y:groundY(state.terrain,400+(i*2+team)*500)-R-2};let x=s.x,y=s.y;state.worms.push({id:team*3+i,team,name:names[team][i],x,y,vx:0,vy:0,hp:100,alive:true,face:team? -1:1,grounded:true,flash:0,active:false});}
 for(let i=0;i<42;i++)state.decor.push({x:visualRand()*W,y:visualRand()*H*.55,r:visualRand()*3+1,phase:visualRand()*6.28});
 state.props=placeProps(state.terrain,state.worms,seed,scheme);state.propWait=0;music.next();music.setMood('battle');state.active=state.worms[0];state.active.active=true;state.cam={x:0,y:0,zoom:1,tz:1,free:false};centerCamera();updateUI();say('YOUR TURN · TAKE AIM',2.5);
}
function living(team){return state.worms.filter(w=>w.team===team&&w.alive)}
function beginTurn(team){
 if(state.ended)return;state.brokerController?.abort();state.brokerController=null;state.brokerTicket=null;state.brokerTurnId=null;state.brokerRequest=null;state.brokerSavedAt=null;state.brokerOptions=[];clearPendingTurn();$('broker-panel').hidden=true;state.team=team;state.timer=35;state.phase='ready';state.used=false;state.shotgunLeft=0;state.jetDropped=false;state.charging=false;state.jetTime=0;state.aiMoves=0;state.aiMoveTime=0;state.aiRetreat=0;state.airTarget=null;if(team===0){state.selected=state.playerWeapon;state.grenadeFuse=state.playerGrenadeFuse;state.grenadeBounce=state.playerGrenadeBounce;state.strikeDir=state.playerStrikeDir}state.windTarget=clamp(state.wind+(simRandom()-.5)*40,-80,80);
 state.worms.forEach(w=>w.active=false);
 const alive=living(team);if(!alive.length){finish(1-team);return}
 const prior=state.lastActiveId[team];state.active=alive.find(w=>w.id>prior)||alive[0];state.active.active=true;state.lastActiveId[team]=state.active.id;state.dir=team? -1:1;state.aim=-.78;state.power=.55;
 updateUI();say(team?'DIRT DEVILS ARE THINKING...':'YOUR TURN · TAKE AIM',1.8);voice(state.active,'turn');
 state.aiTimer=team?1.1:0;followAgain();if(scheme.crateChance>0&&simRandom()<scheme.crateChance&&dropCrate(state,simRandom))say('HEALTH CRATE INCOMING!',1.4);
}
function finish(winner){clearPendingTurn();state.brokerController?.abort();state.brokerController=null;$('broker-panel').hidden=true;state.ended=true;state.running=false;state.phase='ended';state.musicNextTime=0;$('result-caption').textContent=winner===2?'THE ISLAND CLAIMS EVERYONE':winner?'THE DIRT DEVILS WIN':'SKY SQUAD WINS';$('result-title').textContent=winner===2?'DRAW':winner?'DEFEAT':'VICTORY!';$('result-text').textContent=winner===2?'Both teams went under. Try another island!':winner?'The Dirt Devils took this island. Try another tactic!':'The Dirt Devils have been sent packing. The island is yours!';$('result').classList.add('open');music.setMood(winner===0?'victory':'defeat');$('rematch').focus?.();tone(winner?180:600,.5,'sine',.1,winner?80:900);const champ=state.worms.find(w=>w.alive&&w.team===winner);if(champ)voice(champ,'win');else if(winner===2)voice(state.worms[0],'tie')}
function nextTurn(){if(state.ended)return;const p=living(0).length,e=living(1).length;if(!p||!e){finish(!p&&!e?2:p?0:1);return}if(state.team===1){state.round++;if(state.round>8){state.waterLevel=Math.max(270,WATER-(state.round-8)*12);music.setMood('tense');say('SUDDEN DEATH · WATER RISING!',1.7)}}beginTurn(1-state.team)}
function cycle(){if(!state.running||state.team!==0||state.used||state.shotgunLeft||state.phase!=='ready')return;const a=living(0),idx=a.indexOf(state.active);state.active.active=false;state.active=a[(idx+1)%a.length];state.active.active=true;state.lastActiveId[0]=state.active.id;updateUI();tone(450,.05)}
function endTurn(){if(!state.running||state.team!==0||state.phase==='resolving')return;state.used=true;state.phase='resolving';state.resolveTimer=.5;state.charging=false;say('TURN PASSED',.8)}
function emit(x,y,color,count=18,speed=180){for(let i=0;i<count;i++){const a=visualRand()*Math.PI*2,v=speed*(.25+visualRand()*.9);state.particles.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-50,life:.35+visualRand()*.6,max:1,r:1.5+visualRand()*5,color});}}
function addBlast(x,y,r){state.blasts.push(makeBlast(x,y,r,visualRand));const th=themes[state.map];emit(x,y,th.dirt,26,330);emit(x,y,th.light,16,260);emit(x,y,th.dark,12,200)}
function explosion(x,y,r,damage,source){state.shake=Math.max(state.shake,13);addBlast(x,y,r);tone(95,.36,'sawtooth',.13,38);noise(.34,.11,750);emit(x,y,'#ffdd82',42,310);emit(x,y,'#634957',22,230);blastProps(state,x,y,r,damage);carve(state.terrain,x,y,r*.78);buildTerrain({x0:Math.floor(x-r-6),x1:Math.ceil(x+r+6),y0:Math.floor(y-r-6)});
 for(const w of state.worms){if(!w.alive)continue;const d=Math.hypot(w.x-x,w.y-y);const hurt=blastDamage(d,r,damage);if(hurt){w.hp=Math.max(0,w.hp-hurt);w.flash=.7;wormCry();const push=(1-d/r)*400;w.vx+=(w.x-x)/(d||1)*push;w.vy-=Math.max(130,push*.7);w.grounded=false;emit(w.x,w.y,w.team?'#ff9980':'#8ef9e4',8,110);if(w.hp)voice(w,w.hp<35?'medic':'hurt');if(!w.hp)kill(w);}}
 for(const p of state.projectiles){if(p.dead||(p.type!=='grenade'&&p.type!=='dynamite'))continue;const d=Math.hypot(p.x-x,p.y-y);if(d<r*1.3){const push=(1-d/(r*1.3))*520;p.vx+=(p.x-x)/(d||1)*push;p.vy+=(p.y-y)/(d||1)*push-120;p.resting=false}}
 updateUI();if(state.phase==='retreat')state.phase='resolving';if(state.phase==='resolving')state.resolveTimer=Math.max(state.resolveTimer,1.3);
}
function kill(w){if(!w.alive)return;voice(w,w.y>state.waterLevel-12?'water':'die');const killer=state.active;if(killer?.alive&&killer.team!==w.team)setTimeout?.(()=>voice(killer,'kill'),1100);w.alive=false;w.active=false;emit(w.x,w.y,'#fff8d1',28,220);tone(230,.22,'square',.05,80);chirp();say(w.name.toUpperCase()+' IS OUT!',1.3);if((state.active===w&&state.phase==='ready')||living(w.team).length===0){state.phase='resolving';state.resolveTimer=1.5}updateUI()}
// Hooks the map props call back into: blasts, heals, mine beeps and splashes.
const propApi={explode:(x,y,r,d)=>explosion(x,y,r,d,-1),heal:(w,a)=>{w.hp+=a;w.flash=0;emit(w.x,w.y-10,'#7dffa8',14,120);tone(880,.12,'sine',.05,1320);say(`${w.name.toUpperCase()} +${a} HP`,1.2);updateUI()},beep:()=>tone(1150,.06,'square',.035),splash:(x,y)=>emit(x,y,'#d6f5ff',12,100)};
function startResolution(wait=1){state.shotgunLeft=0;state.phase='resolving';state.resolveTimer=wait;state.used=true;state.charging=false}
function setGrenadeFuse(value){if(!state.running||state.team!==0||state.phase!=='ready'||state.selected!=='grenade')return;state.grenadeFuse=clamp(Number(value)||3,1,5);state.playerGrenadeFuse=state.grenadeFuse;updateUI();tone(620,.05,'triangle',.025)}
function toggleGrenadeBounce(){if(!state.running||state.team!==0||state.phase!=='ready'||state.selected!=='grenade')return;state.grenadeBounce=state.grenadeBounce==='high'?'low':'high';state.playerGrenadeBounce=state.grenadeBounce;updateUI();tone(540,.07,'triangle',.025)}
function toggleStrikeDirection(){if(!state.running||state.team!==0||state.phase!=='ready'||state.selected!=='airstrike')return;state.strikeDir*=-1;state.playerStrikeDir=state.strikeDir;updateUI();tone(460,.07,'triangle',.025)}
function dropDynamite(){if(!state.running||state.phase!=='jetpack'||state.jetDropped||!state.active?.alive)return false;const w=state.active;state.projectiles.push({type:'dynamite',x:w.x,y:w.y+R+3,vx:w.vx*.25,vy:w.vy,fuse:3,r:9,bounces:0,bounceFactor:.48,source:w.id,trail:[]});state.jetDropped=true;weaponSound('dynamite');say('DYNAMITE DROPPED!',1);updateUI();return true}
function aimVector(){return {x:Math.cos(state.aim)*state.dir,y:Math.sin(state.aim)}}
function fire(power=state.power){if(!state.running||state.phase!=='ready'||!state.active?.alive)return;const w=state.active,weapon=state.selected,v=aimVector();state.charging=false;followAgain();weaponSound(weapon);if(weapon!=='jetpack'&&!state.shotgunLeft)voice(w,weapon==='bazooka'||weapon==='shotgun'?weapon:'fire');if(weapon==='airstrike'){const foe=living(1-w.team)[0];if(foe)setTimeout?.(()=>voice(foe,'incoming'),700)}if(weapon==='shotgun')noise(.18,.065,2300);else if(weapon==='bazooka')noise(.1,.035,1400);
 if(weapon==='jetpack'){state.phase='jetpack';state.used=true;state.jetTime=4;if(state.team===1)w.jetUsed=true;say('JETPACK · STEER TO FLY',1.4);tone(480,.2,'sawtooth',.04,170);updateUI();return}
 if(weapon==='punch'){let hit=false;for(const target of state.worms){if(!target.alive||target.team===w.team)continue;const dx=target.x-w.x,dy=target.y-w.y;if(Math.abs(dx)<65&&Math.abs(dy)<48&&Math.sign(dx)===state.dir){target.hp=Math.max(0,target.hp-data.punch.damage);target.vx=state.dir*350;target.vy=-250;target.grounded=false;target.flash=.7;wormCry();voice(target,'hurt');emit(target.x,target.y,'#ffda8d',18,170);if(!target.hp)kill(target);hit=true;break}}carve(state.terrain,w.x+state.dir*39,w.y-3,24);buildTerrain();say(hit?'WHAM!':'SWUNG AND MISSED!',1.3);if(!hit)voice(w,'miss');tone(hit?190:350,.12,'square',.08);startResolution(1.3);updateUI();return}
 if(weapon==='shotgun'){if(!state.shotgunLeft)state.shotgunLeft=2;let hits=0;const chips=[];for(let i=0;i<5;i++){const a=state.aim+(simRandom()-.5)*.24,dir={x:Math.cos(a)*state.dir,y:Math.sin(a)},origin={x:w.x+dir.x*22,y:w.y-7+dir.y*22};for(let dist=0;dist<450;dist+=5){const x=origin.x+dir.x*dist,y=origin.y+dir.y*dist;if(x<0||x>=W||y<0||y>=H)break;if(solid(state.terrain,x,y)){chips.push([x,y]);break}let done=false;for(const target of state.worms){if(!target.alive||target===w)continue;if(Math.hypot(x-target.x,y-target.y)<R){target.hp=Math.max(0,target.hp-5);target.vx+=dir.x*32;target.vy-=24;target.flash=.6;hits++;if(!target.hp)kill(target);done=true;break}}if(done)break;}state.particles.push({x:origin.x,y:origin.y,vx:dir.x*340,vy:dir.y*340,life:.15,max:.15,r:2,color:'#fff3c9'});}for(const [x,y]of chips)carve(state.terrain,x,y,3);if(chips.length)buildTerrain();emit(w.x+v.x*25,w.y-7+v.y*25,'#ffda80',17,100);tone(180,.23,'sawtooth',.09,55);const result=hits?`${hits*5} DAMAGE`:'MISSED';if(!hits)voice(w,'miss');if(hits)wormCry();state.shotgunLeft--;if(state.shotgunLeft){say(`SHOTGUN · ${result} · SECOND SHOT!`,1.2);state.aiTimer=.4}else{say(`SHOTGUN · ${result}`,1.2);startResolution(1.2)}updateUI();return}
 if(weapon==='dynamite'){state.projectiles.push({type:'dynamite',x:w.x+state.dir*22,y:w.y-4,vx:0,vy:0,fuse:3,r:9,bounces:0,source:w.id,trail:[]});say('DYNAMITE · TAKE COVER!',1.6);tone(280,.1);state.phase='retreat';state.used=true;state.resolveTimer=3.6;state.aiRetreat=-state.dir;updateUI();return}
 if(weapon==='airstrike'){let tx=state.airTarget??clamp(w.x+state.dir*320,80,W-80);tx=clamp(tx,75,W-75);for(let i=0;i<5;i++)state.projectiles.push({type:'airstrike',x:clamp(tx-state.strikeDir*130+(i-2)*35,5,W-5),y:-170-i*90,vx:state.strikeDir*160,vy:370,fuse:6+i*.2,r:6,source:w.id,trail:[]});say('INCOMING AIRSTRIKE!',1.5);tone(600,.3,'sawtooth',.05,180);startResolution(4.3);updateUI();return}
 const speed=(weapon==='grenade'?300:370)+(weapon==='grenade'?280:390)*power;
 state.projectiles.push({type:weapon,x:w.x+v.x*24,y:w.y-9+v.y*22,vx:v.x*speed,vy:v.y*speed,fuse:weapon==='grenade'?state.grenadeFuse:7,bounceFactor:weapon==='grenade'?(state.grenadeBounce==='high'?.55:.32):.48,r:weapon==='grenade'?8:6,source:w.id,trail:[]});emit(w.x+v.x*30,w.y-8+v.y*20,'#fff6bb',9,70);tone(weapon==='grenade'?330:130,.15,'sawtooth',.08,80);say(weapon==='grenade'?'GRENADE AWAY!':'ROCKET AWAY!',1);startResolution(weapon==='grenade'?state.grenadeFuse+.7:1.8);updateUI();
}
function safeWalk(a,b){const dir=Math.sign(b-a),t=state.terrain;if(!dir)return true;let prior=groundY(t,a);for(let x=a+dir*18;dir>0?x<=b:x>=b;x+=dir*18){const y=groundY(t,x);// Climbs must stay within what crawl() can manage; drops can be steeper.
 if(y>state.waterLevel-40||prior-y>30||y-prior>50)return false;prior=y}return groundY(t,b)<state.waterLevel-40}
function aiAct(){if(!state.running||state.team!==1||state.phase!=='ready')return;if(state.aiDriver==='broker'){requestBrokerTurn();return}const profile=AI_PROFILES[state.difficulty]??AI_PROFILES[1];const w=state.active,foes=living(0),friends=living(1),near=foes.reduce((a,b)=>Math.abs(a.x-w.x)<Math.abs(b.x-w.x)?a:b),dx=near.x-w.x,dy=near.y-w.y-7,dist=Math.hypot(dx,dy);
 if(state.shotgunLeft){const target=foes.reduce((a,b)=>Math.abs(a.x-w.x)<Math.abs(b.x-w.x)?a:b);state.selected='shotgun';state.dir=Math.sign(target.x-w.x)||1;state.aim=aimAngle(target.x-w.x,target.y-w.y-7);w.face=state.dir;fire();return}
 if(Math.abs(dx)<58&&Math.abs(dy)<48){state.selected='punch';state.dir=Math.sign(dx)||1;fire();return}
 if(state.aiMoves===0&&!w.jetUsed&&groundY(state.terrain,w.x)>state.waterLevel-70){const candidates=[240,-240,340,-340].map(d=>clamp(w.x+d,65,W-65)),landing=candidates.find(x=>groundY(state.terrain,x)<state.waterLevel-105&&friends.every(f=>f===w||Math.abs(f.x-x)>40));if(landing){state.selected='jetpack';state.aiTarget=landing;state.aiMoves++;fire();return}}
 if(state.difficulty>0&&dist>58&&dist<112&&Math.abs(dy)<60&&w.hp>55&&w.x>220&&w.x<W-220&&safeWalk(w.x,w.x-Math.sign(dx)*190)&&friends.every(f=>f===w||Math.abs(f.x-w.x)>140)){state.selected='dynamite';state.dir=Math.sign(dx);state.aiTarget=w.x-state.dir*190;fire();return}
 if(dist<profile.shotgunRange&&Math.abs(dy)<85){let clear=true;for(let d=25;d<dist-20;d+=7){if(solid(state.terrain,w.x+dx*d/dist,w.y-7+dy*d/dist)){clear=false;break}}if(clear){state.selected='shotgun';state.dir=Math.sign(dx)||1;state.aim=aimAngle(dx,dy)+(simRandom()-.5)*profile.aimError;w.face=state.dir;fire();return}}
 const shot=selectShot(state.terrain,w,foes,friends,state.wind,state.difficulty,state.waterLevel);
 if(profile.reposition&&state.aiMoves<1&&state.timer>7&&(shot?.score??0)<38){let best=null;for(const offset of [-180,-120,120,180]){const x=w.x+offset;if(x<65||x>W-65||!safeWalk(w.x,x))continue;const probe={x,y:groundY(state.terrain,x)-R-2};if(friends.some(f=>f!==w&&Math.abs(f.x-x)<35))continue;const plan=selectShot(state.terrain,probe,foes,friends.filter(f=>f!==w).concat(probe),state.wind,state.difficulty,state.waterLevel);if(plan&&(!best||plan.score>best.score))best={x,score:plan.score}}
  if(best&&best.score>(shot?.score??0)+12){state.aiTarget=best.x;state.aiMoveTime=Math.min(2.2,Math.abs(best.x-w.x)/145+.35);state.aiMoves++;state.phase='reposition';say('DIRT DEVILS REPOSITION...',1.2);return}
  if(!w.jetUsed&&(shot?.score??0)<17&&dist>450){const dir=Math.sign(dx),candidates=[260,360,180].map(d=>clamp(w.x+dir*d,65,W-65)),landing=candidates.find(x=>groundY(state.terrain,x)<state.waterLevel-55&&!safeWalk(w.x,x));if(landing){state.selected='jetpack';state.aiTarget=landing;state.aiMoves++;fire();return}}
 }
 const lob=dist<650?selectLob(state.terrain,w,foes,friends,state.wind,state.difficulty,state.waterLevel):null;
 const useLob=state.difficulty>0&&lob&&lob.score>profile.grenadeThreshold&&lob.score>(shot?.score??0)-(state.difficulty===2?8:3);
 if(useLob||shot&&shot.score>=12){const pick=useLob?lob:shot;state.selected=useLob?'grenade':'bazooka';if(useLob){state.grenadeFuse=3;state.grenadeBounce='high'}state.dir=pick.dir;state.aim=clamp(pick.angle*Math.PI/180+(simRandom()-.5)*profile.aimError,AIM_MIN,AIM_MAX);state.power=clamp(pick.power+(simRandom()-.5)*profile.aimError,.35,1);w.face=state.dir;updateUI();fire();return}
 state.selected='airstrike';const target=foes.reduce((a,b)=>state.difficulty===0?Math.abs(a.x-w.x)<Math.abs(b.x-w.x)?a:b:a.hp<b.hp?a:b);state.strikeDir=target.x>w.x?1:-1;state.airTarget=clamp(target.x-state.strikeDir*(state.difficulty===2?48:25)+(simRandom()-.5)*profile.airError,75,W-75);fire();
}
function brokerFailure(message){state.phase='broker-error';state.brokerError=message;$('broker-error').textContent=message;$('broker-panel').hidden=false;say('BROKER LLM UNAVAILABLE',3);updateUI()}
function applyBrokerChoice(id){const choice=state.brokerOptions.find(o=>o.id===id),a=choice?.action;if(!a||!state.active?.alive||state.team!==1||state.aiDriver!=='broker')return false;if(state.shotgunLeft&&a.weapon!=='shotgun')return false;
 state.phase='ready';state.selected=a.weapon;if(a.dir)state.dir=a.dir;if(Number.isFinite(a.aim))state.aim=clamp(a.aim,AIM_MIN,AIM_MAX);if(Number.isFinite(a.power))state.power=clamp(a.power,.18,1);if(a.fuse)state.grenadeFuse=a.fuse;if(a.bounce)state.grenadeBounce=a.bounce;if(a.strikeDir)state.strikeDir=a.strikeDir;if(Number.isFinite(a.targetX)){state.aiTarget=a.targetX;if(a.weapon==='airstrike')state.airTarget=a.targetX}state.active.face=state.dir;state.brokerTicket=null;state.brokerRequest=null;state.brokerSavedAt=null;state.brokerOptions=[];clearPendingTurn();$('broker-panel').hidden=true;fire();return true}
function brokerWait(ms,signal){return new Promise((resolve,reject)=>{if(signal.aborted){reject(Error('aborted'));return}const timer=setTimeout(resolve,ms);signal.addEventListener('abort',()=>{clearTimeout(timer);reject(Error('aborted'))},{once:true})})}
async function requestBrokerTurn(resume=false){
 if(!state.running||state.team!==1||state.aiDriver!=='broker'||!['ready','broker-error'].includes(state.phase))return;
 if(!resume||!state.brokerRequest){
  state.brokerOptions=brokerTurnOptions(state);
  state.brokerTurnId=`t${state.matchId}_${state.round}_${state.active.id}_${++state.brokerSequence}`;
  state.brokerRequest={turnId:state.brokerTurnId,difficulty:state.difficulty,snapshot:brokerSnapshot(state),candidates:state.brokerOptions.map(({id,description})=>({id,description}))};
  state.brokerTicket=null;state.brokerSavedAt=Date.now();
 }
 const turnId=state.brokerTurnId,activeId=state.active.id,controller=new AbortController();
 const current=()=>state.running&&state.active?.id===activeId&&state.brokerTurnId===turnId&&state.phase==='broker-wait';
 state.brokerController=controller;state.phase='broker-wait';$('broker-panel').hidden=true;say('BROKER LLM IS THINKING...',20);updateUI();
 const deadline=setTimeout(()=>controller.abort(),28000);
 try{
  let result;
  if(!savePendingTurn(state))throw Error('Cannot safely save this pending Broker turn in the browser.');
  if(!state.brokerTicket){
   const response=await fetch('/api/ai/turn',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(state.brokerRequest),signal:controller.signal});
   result=await response.json();if(!current())return;
   if(!response.ok||!['pending','done'].includes(result.status))throw Error(result.error||'Broker is not configured.');
   if(result.status==='pending'){
    if(!result.ticket)throw Error('Broker returned no job ticket.');
    state.brokerTicket=result.ticket;
    if(!savePendingTurn(state))throw Error('Cannot save the Broker job ticket for recovery.');
   }
  }
  const until=Date.now()+25_000;
  while(result?.status!=='done'&&Date.now()<until){
   await brokerWait(Math.max(800,Math.min(5000,(Number(result?.pollAfter)||2)*1000)),controller.signal);
   if(!current())return;
   const response=await fetch('/api/ai/turn?ticket='+encodeURIComponent(state.brokerTicket),{signal:controller.signal});
   result=await response.json();if(!current())return;
   if(result.status==='error')throw Error(result.error||'Broker turn failed.');
   if(!response.ok)throw Error(result.error||'Broker unavailable.');
  }
  if(result?.status!=='done')throw Error('Broker is taking too long. Retry to read the same job.');
  if(!current())return;
  if(result.turnId!==turnId||!applyBrokerChoice(result.candidateId))throw Error('Broker returned an invalid move.');
 }catch(error){if(current())brokerFailure(error.name==='AbortError'?'Broker timed out. Retry this turn.':error.name==='SyntaxError'?'Broker endpoint unavailable on this server.':String(error.message||'Broker unavailable.').slice(0,140))}
 finally{clearTimeout(deadline);if(state.brokerController===controller)state.brokerController=null}
}
function updateWorm(w,dt){if(!w.alive)return;w.flash=Math.max(0,w.flash-dt);const player=state.team===0&&state.active===w&&state.running&&(state.phase==='ready'||state.phase==='jetpack'||state.phase==='retreat');const ai=state.team===1&&state.active===w&&['reposition','jetpack','retreat'].includes(state.phase);const aiDir=state.phase==='retreat'?state.aiRetreat:Math.sign(state.aiTarget-w.x);const aiDrive=ai&&Math.abs(state.aiTarget-w.x)>18||ai&&state.phase==='retreat';const aiLeft=aiDrive&&aiDir<0,aiRight=aiDrive&&aiDir>0;const ahead=w.x+aiDir*35,aiCliff=ai&&aiDir!==0&&(groundY(state.terrain,ahead)>state.waterLevel-25||groundY(state.terrain,ahead)-groundY(state.terrain,w.x)>55);const left=player&&(state.keys.left||state.keys.KeyA||state.keys.ArrowLeft)||aiLeft,right=player&&(state.keys.right||state.keys.KeyD||state.keys.ArrowRight)||aiRight,jump=player&&(state.keys.jump||state.keys.KeyW||state.keys.ArrowUp)||aiCliff&&state.phase!=='retreat';
 const t=state.terrain,jet=state.phase==='jetpack'&&state.active===w,dir=left&&!right?-1:right&&!left?1:0,backflip=player&&state.keys.Backspace;
 w.stepClock=Math.max(0,(w.stepClock||0)-dt);w.walking=false;
 if(w.grounded&&!jet){
  // Grounded worms crawl pixel by pixel (see crawl in engine.js); a knocked worm skids to a stop.
  if(jump||backflip){w.vy=backflip?-440:-320;w.vx=backflip?-w.face*55:w.face*135;w.grounded=false;w.sliding=false;voice(w,'jump');tone(360,.08,'sine',.035,480)}
  else if(dir){w.face=dir;w.sliding=false;const st=crawl(t,w,dir,WALK_SPEED*dt);w.vx=st==='blocked'?0:dir*WALK_SPEED;w.walking=st!=='blocked';if(st==='fell'){w.grounded=false;w.vy=0}}
  else if(w.sliding&&Math.abs(w.vx)>18){const st=crawl(t,w,Math.sign(w.vx),Math.abs(w.vx)*dt);w.vx*=Math.max(0,1-4.5*dt);if(st==='blocked')w.vx=0;if(st==='fell'){w.grounded=false;w.vy=0}}
  else{w.vx=0;w.sliding=false}
  if(w.grounded&&!wormGrounded(t,w.x,w.y)){w.grounded=false;w.vy=0}
  if(w.walking&&w.stepClock===0){tone(135,.035,'triangle',.018,85);w.stepClock=.27}
 }
 if(!w.grounded||jet){
  if(jet){if(dir){w.vx=clamp(w.vx+dir*700*dt,-180,180);w.face=dir}const thrust=player?jump:(w.y>groundY(t,w.x)-85||aiCliff);if(thrust){w.vy-=850*dt;emit(w.x,w.y+14,'#ffd47b',1,70)}}
  w.vy+=GRAVITY*dt;w.vy=clamp(w.vy,-600,750);w.grounded=false;
  for(let k=0;k<14&&!wormFits(t,w.x,w.y);k++)w.y--;
  const steps=Math.max(1,Math.ceil(Math.hypot(w.vx,w.vy)*dt/3));
  for(let i=0;i<steps;i++){
   const nx=clamp(w.x+w.vx*dt/steps,R,W-R),ny=w.y+w.vy*dt/steps;
   if(wormFits(t,nx,ny)){w.x=nx;w.y=ny;continue}
   if(w.vy>0&&!wormFits(t,w.x,ny)){land(w,jet);if(wormFits(t,nx,w.y))w.x=nx;break}
   if(!wormFits(t,nx,w.y)){w.vx=-w.vx*.3;if(wormFits(t,w.x,ny))w.y=ny;continue}
   w.vy=0;w.x=nx;
  }
 }
 if(w.y>state.waterLevel-10){w.hp=0;kill(w);say(w.name.toUpperCase()+' TOOK A SWIM!',1.4)}
}
// Landing: hard hits bounce once and skid like the original ragdoll; long falls hurt.
function land(w,jet){
 const t=state.terrain;
 // Caught only by a side probe on a corner: shove off it and keep falling instead of hanging.
 // Balanced on a corner over a drop: roll off it. A worm wedged in a crevice (no free side, or many shoves) settles.
 let gap=0;while(gap<8&&!solid(t,w.x,w.y+R+gap))gap++;
 if(gap>=8){const away=solid(t,w.x-7,w.y+R-3)||solid(t,w.x-9,w.y-1)?1:-1,nx=clamp(w.x+away*2,R,W-R);if(wormFits(t,nx,w.y)&&(w.shoves=(w.shoves||0)+1)<40){w.x=nx;w.vx=away*Math.max(40,Math.abs(w.vx)*.5);w.vy=Math.min(w.vy,40);return}}
 w.shoves=0;w.climbDebt=0;const impact=w.vy;
 if(!jet&&impact>560&&state.running){const hurt=Math.min(30,Math.round((impact-560)/8));w.hp=Math.max(0,w.hp-hurt);w.flash=.6;voice(w,'hurt');emit(w.x,w.y+R,themes[state.map].dirt,10,120);if(!w.hp)kill(w);updateUI()}
 if(!jet&&impact>300){w.vy=-impact*.25;w.vx*=.6;return}
 // Settle on a whole pixel touching the ground, so the grounded test agrees next frame.
 w.y=Math.floor(w.y);for(let k=0;k<3&&!wormGrounded(t,w.x,w.y)&&wormFits(t,w.x,w.y+1);k++)w.y++;
 w.vy=0;w.grounded=true;w.sliding=!jet&&Math.abs(w.vx)>60;if(!w.sliding)w.vx=0;
}
function updateProjectile(p,dt){const oldFuse=p.fuse;p.fuse-=dt;if(p.type==='dynamite'&&Math.ceil(oldFuse)>Math.ceil(p.fuse)&&p.fuse>0)tone(920,.07,'square',.035,650);p.trail.push({x:p.x,y:p.y});if(p.trail.length>12)p.trail.shift();if(p.type==='grenade'||p.type==='dynamite'){const body=p.type==='dynamite'?BODIES.dynamite:(p.bounceFactor??.55)<.4?BODIES.grenadeLow:BODIES.grenadeHigh,hit=stepBody(state.terrain,p,dt,{body,water:state.waterLevel}).impact;if(hit>70){p.bounces++;if(p.type==='grenade')tone(650,.055,'triangle',clamp(hit/900,.008,.028),340);else tone(240,.05,'square',.018,160)}if(p.sunk||p.y>state.waterLevel){p.dead=true;emit(p.x,state.waterLevel,'#d6f5ff',15,110);tone(440,.12,'sine',.04);return}}
 else{const sub=4;for(let i=0;i<sub;i++){const d=dt/sub;p.vx+=state.wind*(p.type==='airstrike'?0:.7)*d;p.vy+=GRAVITY*d;p.x+=p.vx*d;p.y+=p.vy*d;
  if(p.x<4||p.x>W-4){p.dead=true;return}
  if(p.y>state.waterLevel){p.dead=true;return}
  if(solid(state.terrain,p.x,p.y+p.r)){p.dead=true;explosion(p.x,p.y,data[p.type].radius,data[p.type].damage,p.source);return}
  if(p.type==='bazooka'){for(const w of state.worms){if(!w.alive||w.id===p.source&&p.fuse>6.8)continue;if(Math.hypot(w.x-p.x,w.y-p.y)<R+p.r){p.dead=true;explosion(p.x,p.y,77,58,p.source);return}}}
 }}
 if(p.fuse<=0){p.dead=true;if(p.type==='grenade'||p.type==='dynamite'){explosion(p.x,p.y,data[p.type].radius,data[p.type].damage,p.source)}else if(p.type==='airstrike'){explosion(p.x,p.y,56,40,p.source)}else if(p.type==='bazooka'){p.dead=true}}
}
function update(dt){if(!state.running)return;musicTick();if(state.team===1&&state.aiDriver==='broker'&&['broker-wait','broker-error'].includes(state.phase)){updateUI();return}state.wind+=(state.windTarget-state.wind)*dt*.08;state.shake=Math.max(0,state.shake-25*dt);if(state.messageTimer>0){state.messageTimer-=dt;if(state.messageTimer<=0)$('message').textContent=''}
 if(state.phase==='ready'||state.phase==='jetpack'||state.phase==='reposition'){{const before=state.timer;state.timer-=dt;if(before>5&&state.timer<=5&&state.active?.alive)voice(state.active,'hurry')}if(state.timer<=0){state.timer=0;say('TIME IS UP!',1);startResolution(.7)}if(state.phase==='jetpack'){state.jetTime-=dt;state.jetPulse=(state.jetPulse||0)-dt;if(state.jetPulse<=0){noise(.19,.018,1800);state.jetPulse=.44}if(state.jetTime<=0)startResolution(.8)}if(state.phase==='reposition'){state.aiMoveTime-=dt;if(state.aiMoveTime<=0||Math.abs(state.active.x-state.aiTarget)<20){state.phase='ready';state.aiTimer=.25}}}
 if(state.team===1&&state.phase==='ready'){state.aiTimer-=dt;if(state.aiTimer<=0)aiAct()}
 if(state.team===1&&state.phase==='jetpack'&&!state.jetDropped&&state.active?.alive){const w=state.active;const target=living(0).find(f=>Math.abs(f.x-w.x)<62&&f.y-w.y>45);if(target&&living(1).every(f=>f===w||Math.hypot(f.x-w.x,f.y-w.y)>125))dropDynamite()}
 if(state.charging){state.power+=state.chargeDir*dt*.85;if(state.power>=1){state.power=1;state.chargeDir=-1}else if(state.power<=.18){state.power=.18;state.chargeDir=1}}
 if(state.team===0&&state.phase==='ready'){if(state.keys.aimleft||state.keys.KeyQ)state.aim=clamp(state.aim-.95*dt,AIM_MIN,AIM_MAX);if(state.keys.aimright||state.keys.KeyE)state.aim=clamp(state.aim+.95*dt,AIM_MIN,AIM_MAX)}
 for(const w of state.worms)updateWorm(w,dt);
 for(const p of state.projectiles)if(!p.dead)updateProjectile(p,dt);state.projectiles=state.projectiles.filter(p=>!p.dead);
 updateProps(state,dt,propApi);
 for(const p of state.particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=350*dt;p.life-=dt}state.particles=state.particles.filter(p=>p.life>0);state.blasts=state.blasts.filter(b=>(b.t+=dt)<1.3);
 if(state.phase==='resolving'||state.phase==='retreat'){state.resolveTimer-=dt;state.propWait=propsBusy(state)?state.propWait+dt:0;if(state.resolveTimer<=0&&state.projectiles.length===0&&(state.propWait===0||state.propWait>5)&&state.worms.every(w=>!w.alive||w.grounded||w.y>state.waterLevel))nextTurn()}
 updateUI();
}
function updateWeaponSettings(){
 const player=state.running&&state.team===0;
 $('grenade-settings').hidden=!(player&&state.phase==='ready'&&state.selected==='grenade');
 $('airstrike-settings').hidden=!(player&&state.phase==='ready'&&state.selected==='airstrike');
 $('jetpack-settings').hidden=!(player&&state.phase==='jetpack');
 for(const b of document.querySelectorAll('[data-fuse]'))b.classList.toggle('selected',Number(b.dataset.fuse)===state.grenadeFuse);
 $('bounce-toggle').textContent='BOUNCE: '+state.grenadeBounce.toUpperCase();
 $('strike-direction').textContent=state.strikeDir>0?'FROM LEFT →':'FROM RIGHT ←';
 $('drop-dynamite').disabled=state.jetDropped||!state.active?.alive;
 $('drop-dynamite').textContent=state.jetDropped?'DYNAMITE DROPPED':'DROP DYNAMITE · X';
}
function updateUI(){const p=living(0),e=living(1);$('p-count').textContent=`${p.length} WORM${p.length===1?'':'IES'}`;$('e-count').textContent=`${e.length} WORM${e.length===1?'':'IES'}`;$('p-health').style.width=`${p.reduce((s,w)=>s+w.hp,0)/3}%`;$('e-health').style.width=`${e.reduce((s,w)=>s+w.hp,0)/3}%`;$('timer').textContent=Math.ceil(state.timer);$('turn-label').textContent=state.team?(state.aiDriver==='broker'&&(state.phase==='broker-wait'||state.phase==='broker-error')?'LLM THINKING':'AI TURN'):'YOUR TURN';$('active-name').textContent=state.active?.alive?state.active.name.toUpperCase():'K.O.';$('wind').textContent=`WIND · ${Math.abs(Math.round(state.wind))} ${state.wind<0?'←':'→'}`;$('power').style.width=`${Math.round(state.power*100)}%`;$('power-text').textContent=`${Math.round(state.power*100)}%`;$('map-name').textContent=mapNames[state.map];$('round').textContent=`ROUND ${state.round}`;$('ai-level').textContent=AI_PROFILES[state.difficulty].name+(state.aiDriver==='broker'?' · BROKER LLM':' · LOCAL');document.querySelectorAll('.weapon').forEach(b=>b.classList.toggle('selected',b.dataset.weapon===state.selected));$('fire').disabled=!state.running||state.team!==0||state.phase!=='ready';$('end-turn').disabled=!state.running||state.team!==0||state.phase==='resolving';updateWeaponSettings()}
let lastFrame=0,frameDt=.016;
function graveY(w){const gy=groundY(state.terrain,w.x);if(w.y>state.waterLevel-6||gy>state.waterLevel-6)return null;if(w.gy==null)w.gy=Math.min(w.y+14,gy);if(w.gy<gy)w.gy=Math.min(gy,w.gy+420*frameDt);return w.gy}
// Sky and far ridges live in screen space and scroll slower than the battlefield (parallax).
const SKY_W=VIEW_W+800,MIN_ZOOM=Math.max(VIEW_W/W,VIEW_H/H);
function drawSky(now){
 const th=themes[state.map];
 if(!state.bg||state.bg.map!==state.map)state.bg={map:state.map,...bakeBackground(()=>document.createElement('canvas'),state.map,th,SKY_W,VIEW_H)};
 const c=state.cam,span=Math.max(1,W-VIEW_W/c.zoom);
 ctx.save();ctx.translate(-(c.x/span)*(SKY_W-VIEW_W),0);drawBackdrop(ctx,state,state.bg,SKY_W,now,frameDt);ctx.restore();
}
function drawWorldBack(now){const th=themes[state.map];drawAmbient(ctx,state,th,W,H,now,frameDt);drawWater(ctx,state,th,W,H,now,false)}
// Camera: follows the shot in flight, otherwise the active worm. Wheel or Z zooms out to the whole map,
// right-drag looks around freely (the turn clock keeps running), C or the next shot snaps back.
function camFocus(){return state.projectiles.find(p=>!p.dead&&p.type!=='airstrike')||state.projectiles.find(p=>!p.dead&&p.y>0)||state.active}
function clampCam(c){c.x=clamp(c.x,0,Math.max(0,W-VIEW_W/c.zoom));c.y=clamp(c.y,0,Math.max(0,H-VIEW_H/c.zoom))}
function centerCamera(){const c=state.cam,f=camFocus();if(!c||!f)return;c.x=f.x-VIEW_W/c.zoom/2;c.y=f.y-VIEW_H/c.zoom*.55;clampCam(c)}
function updateCamera(dt){
 const c=state.cam;if(!c)return;
 if(Math.abs(c.tz-c.zoom)>1e-3){const mx=c.x+VIEW_W/c.zoom/2,my=c.y+VIEW_H/c.zoom/2;c.zoom+=(c.tz-c.zoom)*Math.min(1,dt*9);c.x=mx-VIEW_W/c.zoom/2;c.y=my-VIEW_H/c.zoom/2}
 if(!c.free){const f=camFocus();if(f){const k=Math.min(1,dt*(f===state.active?4:7));c.x+=(f.x-VIEW_W/c.zoom/2-c.x)*k;c.y+=(f.y-VIEW_H/c.zoom*.55-c.y)*k}}
 clampCam(c);
}
function zoomBy(factor){const c=state.cam;if(c)c.tz=clamp(c.tz*factor,MIN_ZOOM,1.25)}
function followAgain(){if(state.cam){state.cam.free=false}}
// Arrows on the screen edge point at worms outside the view.
function drawOffscreen(){
 const c=state.cam;if(!c)return;
 for(const w of state.worms){
  if(!w.alive)continue;const sx=(w.x-c.x)*c.zoom,sy=(w.y-c.y)*c.zoom;if(sx>=-10&&sx<=VIEW_W+10&&sy>=-10&&sy<=VIEW_H+10)continue;
  const ex=clamp(sx,22,VIEW_W-22),ey=clamp(sy,22,VIEW_H-120);
  ctx.save();ctx.translate(ex,ey);ctx.rotate(Math.atan2(sy-ey,sx-ex));ctx.beginPath();ctx.moveTo(13,0);ctx.lineTo(-8,-9);ctx.lineTo(-8,9);ctx.lineTo(13,0);
  ctx.fillStyle=TEAM_COLORS[w.team?1:0];ctx.fill();ctx.lineWidth=2.5;ctx.strokeStyle='#1c1420';ctx.stroke();ctx.restore();
 }
}
function drawWorm(w){if(!w.alive)return;const active=w===state.active&&state.running;ctx.save();ctx.translate(w.x,w.y);if(w.flash>0&&Math.sin(w.flash*30)>0)ctx.globalAlpha=.55;
 if(active){ctx.strokeStyle=w.team?'#ffbb80':'#fff2a0';ctx.lineWidth=3;ctx.setLineDash([5,5]);ctx.beginPath();ctx.ellipse(0,4,24,29,0,0,Math.PI*2);ctx.stroke();ctx.setLineDash([])}
 ctx.fillStyle='#19334544';ctx.beginPath();ctx.ellipse(0,17,21,5,0,0,Math.PI*2);ctx.fill();
 const body=w.team?'#f68969':'#58d6bd',shade=w.team?'#b45560':'#319e9e';ctx.fillStyle=shade;ctx.beginPath();ctx.ellipse(0,4,16,17,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=body;ctx.beginPath();ctx.ellipse(-2,-1,15,16,-.12,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff1d1';ctx.beginPath();ctx.ellipse(w.face*7,-5,7,7,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#23384d';ctx.beginPath();ctx.arc(w.face*10,-5,2.4,0,Math.PI*2);ctx.fill();ctx.fillStyle='#e77369';ctx.beginPath();ctx.ellipse(w.face*13,3,3,2,0,0,Math.PI*2);ctx.fill();
 ctx.fillStyle=w.team?'#923e50':'#236f80';ctx.beginPath();ctx.ellipse(-2,-15,17,5,-.1,0,Math.PI*2);ctx.fill();ctx.fillRect(-10,-21,16,7);ctx.fillStyle='#ffdc89';ctx.fillRect(-6,-20,7,3);
 ctx.restore();ctx.save();ctx.textAlign='center';ctx.font='bold 12px Trebuchet MS';ctx.lineWidth=3;ctx.strokeStyle='#12384c';ctx.fillStyle='#fff';ctx.strokeText(w.name.toUpperCase(),w.x,w.y-37);ctx.fillText(w.name.toUpperCase(),w.x,w.y-37);ctx.fillStyle='#17394a';ctx.fillRect(w.x-21,w.y-31,42,5);ctx.fillStyle=w.team?'#ff8975':'#71f0c9';ctx.fillRect(w.x-21,w.y-31,42*w.hp/100,5);ctx.restore();
}
function drawWormDetails(w){
 if(!w.alive)return;
 const active=w===state.active&&state.running,step=Math.abs(w.vx)>25&&w.grounded?Math.sin(performance.now()*.017+w.id):0;
 ctx.save();ctx.translate(w.x,w.y);
 ctx.fillStyle=w.team?'#d66b61':'#36baa9';
 ctx.beginPath();ctx.moveTo(-w.face*11,5);ctx.lineTo(-w.face*23,10);ctx.lineTo(-w.face*13,14);ctx.fill();
 ctx.fillStyle='#ffefce';ctx.beginPath();ctx.ellipse(w.face*2,-7,4.4,5.2,0,0,Math.PI*2);ctx.fill();
 ctx.fillStyle='#18374b';ctx.beginPath();ctx.arc(w.face*4,-7,1.8,0,Math.PI*2);ctx.fill();
 ctx.strokeStyle='#633d48';ctx.lineWidth=1.7;ctx.beginPath();ctx.arc(w.face*9,5,3.5,.15,Math.PI-.15);ctx.stroke();
 ctx.fillStyle=w.team?'#f6a17f':'#77e5c6';ctx.beginPath();ctx.ellipse(-7,15+step,6,3,0,0,Math.PI*2);ctx.ellipse(8,15-step,6,3,0,0,Math.PI*2);ctx.fill();
 if(active){
  const weapon=state.selected,face=w.face,angle=Math.atan2(Math.sin(state.aim),Math.cos(state.aim)*state.dir);
  if(weapon==='jetpack'){
   ctx.fillStyle='#a9bfd0';ctx.fillRect(-face*21,-8,9,19);ctx.fillStyle='#27465a';ctx.fillRect(-face*20,-6,7,10);
   if(state.phase==='jetpack'){ctx.fillStyle='#ffdf89';ctx.beginPath();ctx.moveTo(-face*18,12);ctx.lineTo(-face*23,27+step*4);ctx.lineTo(-face*13,12);ctx.fill()}
  }else if(weapon==='airstrike'){
   ctx.fillStyle='#314c68';ctx.fillRect(face*10,-1,12,13);ctx.fillStyle='#ffda7c';ctx.fillRect(face*12,2,7,3);ctx.strokeStyle='#d9e9e8';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(face*18,-2);ctx.lineTo(face*20,-12);ctx.stroke();
  }else if(weapon==='grenade'){
   ctx.fillStyle='#597b53';ctx.beginPath();ctx.arc(face*17,-4,7,0,Math.PI*2);ctx.fill();ctx.fillStyle='#dfd5aa';ctx.fillRect(face*16,-12,5,3);
  }else if(weapon==='dynamite'){
   ctx.fillStyle='#d55356';ctx.fillRect(face*11,-10,12,17);ctx.fillStyle='#ffe2ac';ctx.fillRect(face*13,-9,4,2);ctx.strokeStyle='#edc878';ctx.beginPath();ctx.moveTo(face*17,-10);ctx.lineTo(face*21,-16);ctx.stroke();
  }else if(weapon==='punch'){
   ctx.fillStyle='#ffbf6f';ctx.beginPath();ctx.arc(face*18,0,9,0,Math.PI*2);ctx.fill();ctx.fillStyle='#f8dbaa';ctx.fillRect(face*15,-7,3,5);
  }else{
   ctx.save();ctx.rotate(angle);ctx.fillStyle=weapon==='bazooka'?'#4c6755':'#344d5c';ctx.fillRect(4,-5,weapon==='bazooka'?29:31,weapon==='bazooka'?10:6);ctx.fillStyle='#f2cc7f';ctx.fillRect(25,-6,6,weapon==='bazooka'?12:8);ctx.fillStyle='#2a3c49';ctx.fillRect(9,4,8,7);ctx.restore();
  }
  ctx.fillStyle=w.team?'#f9a481':'#80ead0';ctx.beginPath();ctx.arc(face*11,3,4.2,0,Math.PI*2);ctx.fill();
 }
 ctx.restore();
}
function drawProjectile(p){ctx.save();if(p.trail.length){ctx.beginPath();ctx.moveTo(p.trail[0].x,p.trail[0].y);for(const point of p.trail)ctx.lineTo(point.x,point.y);ctx.lineTo(p.x,p.y);ctx.strokeStyle=p.type==='airstrike'?'#fff6a6aa':'#fff9dda6';ctx.lineWidth=p.type==='airstrike'?5:3;ctx.stroke()}ctx.translate(p.x,p.y);ctx.rotate(Math.atan2(p.vy,p.vx));ctx.fillStyle=p.type==='grenade'?'#4e796a':p.type==='dynamite'?'#db6260':p.type==='airstrike'?'#fff0a5':'#fbdf89';ctx.beginPath();ctx.ellipse(0,0,p.type==='dynamite'?10:12,5,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fcf5d7';ctx.fillRect(-6,-2,5,4);ctx.restore()}
function drawAim(){if(!state.running||state.team!==0||state.phase!=='ready'||!state.active?.alive)return;const w=state.active,v=aimVector();ctx.save();ctx.strokeStyle='#fff8d9';ctx.lineWidth=3;ctx.setLineDash([8,8]);ctx.beginPath();ctx.moveTo(w.x+v.x*27,w.y-8+v.y*27);ctx.lineTo(w.x+v.x*125,w.y-8+v.y*125);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#fff9dd';ctx.beginPath();ctx.arc(w.x+v.x*125,w.y-8+v.y*125,6,0,Math.PI*2);ctx.fill();const ax=state.airTarget??state.airHover;if(state.selected==='airstrike'&&ax!=null){ctx.strokeStyle='#ffefaa';ctx.lineWidth=2;if(state.airTarget==null)ctx.setLineDash?.([6,6]);ctx.beginPath();ctx.moveTo(ax,120);ctx.lineTo(ax,groundY(state.terrain,ax)-30);ctx.stroke();ctx.beginPath();ctx.arc(ax,groundY(state.terrain,ax)-25,28,0,Math.PI*2);ctx.stroke();ctx.setLineDash?.([])}ctx.restore()}
function render(){if(!state.terrain)return;const now=performance.now();frameDt=lastFrame?Math.min(.05,(now-lastFrame)/1000):.016;lastFrame=now;updateCamera(frameDt);drawSky(now);const cam=state.cam;ctx.save();ctx.scale(cam.zoom,cam.zoom);ctx.translate(-cam.x,-cam.y);if(state.shake){ctx.translate((visualRand()-.5)*state.shake,(visualRand()-.5)*state.shake)}drawWorldBack(now);drawEnvironment(ctx,state,groundY);ctx.drawImage(state.terrainCanvas,0,0);drawProps(ctx,state.props,now);for(const p of state.projectiles)drawOrdnance(ctx,p);for(const w of state.worms)drawCharacter(ctx,w,{active:w===state.active&&state.running,weapon:state.selected,aim:state.aim,phase:state.phase,now,graveY:w.alive?null:graveY(w)});for(const b of state.blasts)drawBlast(ctx,b);drawAim();for(const p of state.particles){ctx.globalAlpha=clamp(p.life/p.max,0,1);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();if(p.r>3.4){ctx.lineWidth=1.5;ctx.strokeStyle='#2b1a1c';ctx.stroke()}}ctx.globalAlpha=1;drawWater(ctx,state,themes[state.map],W,H,now,true);ctx.restore();drawOffscreen();drawHud(ctx,state,VIEW_W,VIEW_H,now)}
let last=performance.now();function loop(now){const dt=Math.min((now-last)/1000,.04);last=now;update(dt);render();requestAnimationFrame(loop)}requestAnimationFrame(loop);
function pointerCoords(ev){const r=canvas.getBoundingClientRect(),c=state.cam,sx=(ev.clientX-r.left)/r.width*VIEW_W,sy=(ev.clientY-r.top)/r.height*VIEW_H;return{x:c.x+sx/c.zoom,y:c.y+sy/c.zoom}}
function aimAt(ev){if(!state.running||state.team!==0||state.phase!=='ready')return;const m=pointerCoords(ev),w=state.active,dx=m.x-w.x,dy=m.y-w.y+8;if(state.selected==='airstrike'){if(ev.type==='pointerdown'&&(ev.button===0||ev.pointerType!=='mouse')){state.airTarget=m.x;state.airHover=null}else if(state.airTarget==null)state.airHover=m.x;return}state.dir=dx<0?-1:1;state.aim=aimAngle(dx,dy);w.face=state.dir}
function chargeStart(){if(!state.running||state.team!==0||state.phase!=='ready'||state.charging)return;if(['punch','dynamite','airstrike','jetpack','shotgun'].includes(state.selected)){fire();return}state.charging=true;state.chargeDir=1;state.power=.22;tone(480,.08,'sine',.03,650)}
function chargeEnd(){if(state.charging)fire()}
const weaponBox=$('weapons');WEAPONS.forEach((id,i)=>{const b=document.createElement('button');b.className='weapon';b.dataset.weapon=id;b.title=`${data[id].name} - ${data[id].short}`;b.innerHTML=`<span class="glyph">${weaponIcon(id)||data[id].icon}</span><span class="name">${data[id].name}</span><span class="key">${i+1}</span>`;b.addEventListener('click',()=>{if(state.team!==0||state.phase!=='ready'||state.shotgunLeft)return;state.selected=id;state.playerWeapon=id;state.airTarget=null;state.airHover=null;updateUI();tone(530,.06,'sine',.03)});weaponBox.appendChild(b)});
for(const button of document.querySelectorAll('[data-fuse]'))button.addEventListener('click',()=>setGrenadeFuse(button.dataset.fuse));
$('bounce-toggle').addEventListener('click',toggleGrenadeBounce);
$('strike-direction').addEventListener('click',toggleStrikeDirection);
$('drop-dynamite').addEventListener('click',dropDynamite);
let panFrom=null;
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('wheel',e=>{e.preventDefault();zoomBy(e.deltaY>0?.88:1/.88)},{passive:false});
canvas.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&(e.button===2||e.button===1)&&state.cam){panFrom={x:e.clientX,y:e.clientY,cx:state.cam.x,cy:state.cam.y};canvas.setPointerCapture?.(e.pointerId)}});
window.addEventListener('pointerup',e=>{if(e.button===2||e.button===1)panFrom=null});
canvas.addEventListener('pointermove',e=>{if(!panFrom)return;const r=canvas.getBoundingClientRect(),c=state.cam,k=VIEW_W/r.width/c.zoom;c.free=true;c.x=panFrom.cx-(e.clientX-panFrom.x)*k;c.y=panFrom.cy-(e.clientY-panFrom.y)*k;clampCam(c)});
canvas.addEventListener('pointermove',aimAt);canvas.addEventListener('pointerdown',e=>{document.activeElement?.blur?.();aimAt(e);if(e.pointerType==='mouse'&&e.button===0)chargeStart()});window.addEventListener('pointerup',chargeEnd);
$('fire').addEventListener('pointerdown',e=>{e.preventDefault();chargeStart()});$('fire').addEventListener('pointerup',e=>{e.preventDefault();chargeEnd();$('fire').blur?.()});$('fire').addEventListener('focus',()=>{const y=window.scrollY;requestAnimationFrame?.(()=>window.scrollTo?.(0,y))});$('fire').addEventListener('pointerleave',chargeEnd);
document.addEventListener?.('click',e=>{const b=e.target?.closest?.('button');if(b&&!b.closest('.modal')&&e.detail>0)b.blur()});
$('end-turn').onclick=endTurn;$('touch-switch').onclick=cycle;
for(const b of document.querySelectorAll('[data-hold]')){const k=b.dataset.hold;b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);state.keys[k]=true});for(const event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,()=>state.keys[k]=false)}
window.addEventListener('keydown',e=>{
 // Menus, dialogs and form fields keep their own keys; the battlefield takes them only in play.
 const el=e.target,field=el?.closest?.('input:not([type=checkbox]):not([type=range]),select,textarea,[contenteditable="true"]'),modal=document.querySelector?.('.modal.open');
 if(!state.running||modal||field||(e.code==='Enter'&&el?.closest?.('button')))return;
 if(['Space','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','PageDown','PageUp','Tab','Backspace'].includes(e.code))e.preventDefault();
 if(e.repeat&&['Space','Tab','KeyX'].includes(e.code))return;
 state.keys[e.code]=true;
 if(e.code==='Space')chargeStart();if(e.code==='Tab')cycle();if(e.code==='Enter')endTurn();
 if(e.code==='KeyX')dropDynamite();
 if(e.code==='KeyC'&&state.cam){followAgain();state.cam.tz=1}
 if(e.code==='KeyZ'&&state.cam){followAgain();state.cam.tz=state.cam.tz>MIN_ZOOM+.01?MIN_ZOOM:1}
 if(e.code==='KeyR')toggleStrikeDirection();
 if(e.code==='Minus'||e.code==='Equal')toggleGrenadeBounce();
 if(e.shiftKey&&/^Digit[1-5]$/.test(e.code)){setGrenadeFuse(Number(e.code.slice(-1)));return}
 if(/^Digit[1-7]$/.test(e.code)&&state.team===0&&state.phase==='ready'&&!state.shotgunLeft){state.selected=WEAPONS[Number(e.code.slice(-1))-1];state.playerWeapon=state.selected;state.airTarget=null;updateUI()}
});
window.addEventListener('keyup',e=>{state.keys[e.code]=false;if(e.code==='Space')chargeEnd()});window.addEventListener('blur',()=>{state.keys={};state.charging=false;state.power=.5;updateUI()});
const aiHints=['Easy: aims loosely, favors simple shots and rarely changes position.','Normal: plans shots, uses grenades and moves for a better angle.','Hard: searches more trajectories, protects allies and aims precisely.'];
function updateAiHint(){const base=aiHints[clamp(Number($('difficulty').value)||0,0,2)];$('ai-hint').textContent=$('ai-driver').value==='broker'?base+' Each AI action is chosen by Broker LLM. Requires configured access.':base+' Local algorithm.'}
$('difficulty').onchange=updateAiHint;$('ai-driver').onchange=updateAiHint;
function applyAudioSettings(unlock=false){const priorMusic=state.musicEnabled;state.sound=$('effects-on').checked;state.musicEnabled=$('music-on').checked;state.fxVolume=clamp(Number($('effects-volume').value)/100,0,1);state.musicVolume=clamp(Number($('music-volume').value)/100,0,1);configureVoices({enabled:state.sound,volume:state.fxVolume});if(unlock){if(!state.audioUnlocked)unlockAudio();else audio?.resume?.()}if(!priorMusic&&state.musicEnabled){state.musicStep=0;state.musicNextTime=0}$('sound').textContent=state.sound||state.musicEnabled?'♫':'×';$('sound').title=state.sound||state.musicEnabled?'Music and effects settings':'Sound off — open settings'}
for(const id of ['music-on','effects-on'])$(id).onchange=()=>applyAudioSettings(true);
for(const id of ['music-volume','effects-volume'])$(id).oninput=()=>applyAudioSettings(true);
$('start').onclick=()=>{applyAudioSettings(true);state.aiDriver=$('ai-driver').value==='broker'?'broker':'local';$('intro').classList.remove('open');newGame(Number($('map-choice').value),Number($('difficulty').value))};
$('rematch').onclick=()=>{$('result').classList.remove('open');newGame(state.map,state.difficulty)};
$('new-map').onclick=()=>{$('result').classList.remove('open');newGame((state.map+1)%3,state.difficulty)};
$('broker-retry').onclick=()=>requestBrokerTurn(true);$('broker-pass').onclick=()=>{if(state.phase==='broker-error'){state.brokerTicket=null;state.brokerRequest=null;clearPendingTurn();$('broker-panel').hidden=true;startResolution(.1)}};$('broker-local').onclick=()=>{if(state.phase==='broker-error'){state.aiDriver='local';state.brokerTicket=null;state.brokerRequest=null;clearPendingTurn();$('broker-panel').hidden=true;state.phase='ready';updateUI();aiAct()}};
$('sound').onclick=()=>{$('audio-panel').hidden=!$('audio-panel').hidden};$('help').onclick=()=>$('help-panel').classList.toggle('open');$('close-help').onclick=()=>$('help-panel').classList.remove('open');
function restorePendingBrokerTurn(record){
 if(!record)return false;
 try{
  const {terrain,worms,activeId,top,maskRuns,...values}=record.game;
  Object.assign(state,values);state.terrain=terrain;state.worms=worms;state.active=worms[activeId];
  state.worms.forEach(w=>w.active=w===state.active);state.team=1;state.aiDriver='broker';state.running=true;state.ended=false;
  state.projectiles=[];state.particles=[];state.blasts=[];state.brokerController=null;state.brokerRequest=record.request;
  state.brokerTurnId=record.request.turnId;state.brokerTicket=record.ticket;state.brokerSavedAt=record.savedAt;
  state.brokerOptions=brokerTurnOptions(state);
  const offered=state.brokerOptions.map(({id,description})=>({id,description}));
  if(JSON.stringify(offered)!==JSON.stringify(record.request.candidates)||JSON.stringify(brokerSnapshot(state))!==JSON.stringify(record.request.snapshot))throw Error('stale pending state');
  simRand=seeded((state.seed^0x9e3779b9)>>>0);for(let i=0;i<state.simDraws;i++)simRand();
  buildTerrain();state.phase='broker-error';state.brokerError='Pending Broker turn recovered. Retry to read the same job.';
  $('broker-error').textContent=state.brokerError;$('broker-panel').hidden=false;$('intro').classList.remove('open');updateUI();return true;
 }catch{clearPendingTurn();return false}
}
const pendingOnLoad=readPendingTurn();
newGame(0,1,undefined,Boolean(pendingOnLoad));
if(!restorePendingBrokerTurn(pendingOnLoad)){state.running=false;$('intro').classList.add('open')}
window.__craterCrew={scheme,state,newGame,fire,explosion,finish,beginTurn,update,render,cycle,aimAt,aiAct,requestBrokerTurn,restorePendingBrokerTurn,setGrenadeFuse,toggleGrenadeBounce,toggleStrikeDirection,dropDynamite};

