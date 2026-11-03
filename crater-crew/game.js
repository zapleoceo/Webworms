import {drawEnvironment,drawCharacter,drawOrdnance} from './art.js';
import {brokerTurnOptions,brokerSnapshot} from './broker-ai.js';
import {clearPendingTurn,savePendingTurn,readPendingTurn} from './broker-resume.js';
import {W,H,WATER,R,GRAVITY,WEAPONS,data,AI_PROFILES,clamp,seeded,createTerrain,solid,carve,groundY,blastDamage,selectShot,selectLob,AIM_MIN,AIM_MAX,aimAngle} from './engine.js';
const $=id=>document.getElementById(id), canvas=$('game'),ctx=canvas.getContext('2d');
const names=[['Pip','Bubbles','Mochi'],['Grub','Maverick','Nibbles']];
const mapNames=['SUNSET COVE','CINDER PEAKS','MOONLIT ATOLL'];
const themes=[{sky:['#75c6d5','#ffd292'],hill:'#637f8e',dirt:'#6c4b45',light:'#c68c5a',dark:'#3e343c',water:'#267da6'}, {sky:['#536d95','#f6a073'],hill:'#6b5e71',dirt:'#684551',light:'#b77c72',dark:'#3c364e',water:'#4966a0'}, {sky:['#203d69','#a1a8b1'],hill:'#3e567c',dirt:'#445471',light:'#8c90a1',dark:'#252f50',water:'#315f96'}];
const state={running:false,ended:false,map:0,difficulty:1,aiDriver:'local',brokerController:null,brokerTicket:null,brokerTurnId:null,brokerRequest:null,brokerSavedAt:null,brokerSequence:0,brokerOptions:[],brokerError:'',terrain:null,terrainCanvas:null,worms:[],projectiles:[],particles:[],decor:[],team:0,active:null,lastActiveId:[-1,-1],selected:'bazooka',playerWeapon:'bazooka',phase:'ready',timer:35,round:1,waterLevel:WATER,wind:0,windTarget:0,aim:-0.75,dir:1,power:.5,charging:false,chargeDir:1,used:false,shotgunLeft:0,grenadeFuse:3,grenadeBounce:'high',strikeDir:1,playerGrenadeFuse:3,playerGrenadeBounce:'high',playerStrikeDir:1,jetDropped:false,keys:{},aiTimer:0,aiMoves:0,aiTarget:0,aiMoveTime:0,aiRetreat:0,resolveTimer:0,message:'',messageTimer:0,shake:0,sound:false,musicEnabled:false,fxVolume:.65,musicVolume:.42,audioUnlocked:false,musicStep:0,musicNextTime:0,jetTime:0};
let simRand=seeded(77421),visualRand=seeded(19031);
const simRandom=()=>{state.simDraws=(state.simDraws||0)+1;return simRand()};
const newMatchId=()=>{const bytes=new Uint8Array(8);globalThis.crypto.getRandomValues(bytes);return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')};
let audio=null;
function tone(freq=300,duration=.15,type='triangle',volume=.08,slide=0){if(!state.sound||state.fxVolume===0)return;try{audio??=new AudioContext();const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.setValueAtTime(freq,audio.currentTime);if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(30,slide),audio.currentTime+duration);g.gain.setValueAtTime(volume*state.fxVolume,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+duration)}catch{}}
function noise(duration=.18,volume=.07,cutoff=1400){if(!state.sound||state.fxVolume===0)return;try{audio??=new AudioContext();const frames=Math.ceil(audio.sampleRate*duration),buffer=audio.createBuffer(1,frames,audio.sampleRate),samples=buffer.getChannelData(0);for(let i=0;i<frames;i++)samples[i]=Math.random()*2-1;const source=audio.createBufferSource(),filter=audio.createBiquadFilter(),gain=audio.createGain();source.buffer=buffer;filter.type='lowpass';filter.frequency.value=cutoff;gain.gain.setValueAtTime(volume*state.fxVolume,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);source.connect(filter).connect(gain).connect(audio.destination);source.start();source.stop(audio.currentTime+duration)}catch{}}
const melody=[0,null,3,7,null,10,7,null,5,null,3,0,null,-2,0,null,3,null,7,10,null,12,10,null,7,null,5,3,null,0,3,null,5,null,8,12,null,10,8,null,7,null,5,3,null,0,-2,null,0,null,4,7,null,11,7,null,4,null,2,0,null,-2,0,null];
const bass=[-12,-14,-17,-7];
function musicNote(freq,duration,at,type='triangle',level=.045){const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.setValueAtTime(freq,at);g.gain.setValueAtTime(.001,at);g.gain.exponentialRampToValueAtTime(Math.max(.001,level*state.musicVolume),at+.014);g.gain.exponentialRampToValueAtTime(.001,at+duration);o.connect(g).connect(audio.destination);o.start(at);o.stop(at+duration+.01)}
function musicTick(){if(!state.audioUnlocked||!state.musicEnabled||!state.running||state.musicVolume===0||!audio)return;try{const beat=.215;if(!state.musicNextTime||state.musicNextTime<audio.currentTime-.2)state.musicNextTime=audio.currentTime+.02;while(state.musicNextTime<audio.currentTime+.18){const i=state.musicStep%64,at=state.musicNextTime,semi=melody[i],bar=Math.floor(i/16)%4;if(semi!==null)musicNote(293.66*2**(semi/12),beat*(i%4===0?2.4:1.5),at,'triangle',.04);if(i%4===0)musicNote(146.83*2**(bass[bar]/12),beat*3.1,at,'sawtooth',.055);if(i%8===0)musicNote(105,.12,at,'sine',.07);if(i%8===4)musicNote(190,.07,at,'square',.025);if(i%2===0)musicNote(1400,.024,at,'triangle',.008);state.musicStep++;state.musicNextTime+=beat}}catch{state.musicEnabled=false}}
function unlockAudio(){if(!state.audioUnlocked){try{audio??=new AudioContext();audio.resume?.();state.audioUnlocked=true}catch{return}}if(state.musicEnabled){state.musicStep=0;state.musicNextTime=0}}
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
function buildTerrain(){const t=state.terrain,off=document.createElement('canvas');off.width=W;off.height=H;const c=off.getContext('2d'),im=c.createImageData(W,H),p=im.data,th=themes[state.map];const hex=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));const a=hex(th.dirt),b=hex(th.light),dark=hex(th.dark);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=y*W+x;if(!t.mask[i])continue;const k=i*4,depth=y-t.top[x],rim=y>3&&(!t.mask[(y-3)*W+x]||x>3&&!t.mask[y*W+x-3]||x<W-4&&!t.mask[y*W+x+3]),grain=((x*73856093^y*19349663)>>>0)%97/97,vein=Math.sin(x*.071+y*.037)+Math.sin(x*.019-y*.083),fleck=grain>.94?-.22:grain<.025?.16:0,n=.79+grain*.31+vein*.055+fleck,col=rim?b:depth>95?dark:a;p[k]=clamp(col[0]*n,0,255);p[k+1]=clamp(col[1]*n,0,255);p[k+2]=clamp(col[2]*n,0,255);p[k+3]=255;}
  c.putImageData(im,0,0);state.terrainCanvas=off;
}
function newGame(map=0,difficulty=1,seed=Math.floor(Date.now()%1e9),preservePending=false){
 if(!preservePending)clearPendingTurn();state.brokerController?.abort();state.brokerController=null;state.brokerTicket=null;state.brokerTurnId=null;state.brokerRequest=null;state.brokerSavedAt=null;state.brokerOptions=[];state.brokerSequence=0;$('broker-panel').hidden=true;
 simRand=seeded((seed^0x9e3779b9)>>>0);visualRand=seeded((seed^0x7f4a7c15)>>>0);state.seed=seed;state.matchId=newMatchId();state.simDraws=0;state.map=map;state.difficulty=clamp(Number(difficulty)||0,0,2);state.musicStep=0;state.musicNextTime=0;state.terrain=createTerrain(map,seed);buildTerrain();state.worms=[];state.projectiles=[];state.particles=[];state.decor=[];state.team=0;state.active=null;state.lastActiveId=[0,-1];state.phase='ready';state.timer=35;state.round=1;state.waterLevel=WATER;state.ended=false;state.running=true;state.used=false;state.shotgunLeft=0;state.grenadeFuse=3;state.grenadeBounce='high';state.strikeDir=1;state.playerGrenadeFuse=3;state.playerGrenadeBounce='high';state.playerStrikeDir=1;state.jetDropped=false;state.selected='bazooka';state.playerWeapon='bazooka';state.airTarget=null;state.aim=-.72;state.dir=1;state.power=.5;state.charging=false;state.keys={};state.aiTimer=0;state.resolveTimer=0;state.jetTime=0;state.jetPulse=0;state.shake=0;state.wind=(simRandom()-.5)*72;state.windTarget=state.wind;state.aiMoves=0;state.aiTarget=0;state.aiMoveTime=0;state.aiRetreat=0;
 // Interleaved central rivals make close weapons tactically usable from round one.
 const spots=[[170,340,730],[780,1270,1450]];
 for(let team=0;team<2;team++)for(let i=0;i<3;i++){let x=spots[team][i],y=groundY(state.terrain,x)-R-2;state.worms.push({id:team*3+i,team,name:names[team][i],x,y,vx:0,vy:0,hp:100,alive:true,face:team? -1:1,grounded:true,flash:0,active:false});}
 for(let i=0;i<85;i++)state.decor.push({x:visualRand()*W,y:visualRand()*H*.55,r:visualRand()*3+1,phase:visualRand()*6.28});
 state.active=state.worms[0];state.active.active=true;updateUI();say('YOUR TURN · TAKE AIM',2.5);
}
function living(team){return state.worms.filter(w=>w.team===team&&w.alive)}
function beginTurn(team){
 if(state.ended)return;state.brokerController?.abort();state.brokerController=null;state.brokerTicket=null;state.brokerTurnId=null;state.brokerRequest=null;state.brokerSavedAt=null;state.brokerOptions=[];clearPendingTurn();$('broker-panel').hidden=true;state.team=team;state.timer=35;state.phase='ready';state.used=false;state.shotgunLeft=0;state.jetDropped=false;state.charging=false;state.jetTime=0;state.aiMoves=0;state.aiMoveTime=0;state.aiRetreat=0;state.airTarget=null;if(team===0){state.selected=state.playerWeapon;state.grenadeFuse=state.playerGrenadeFuse;state.grenadeBounce=state.playerGrenadeBounce;state.strikeDir=state.playerStrikeDir}state.windTarget=clamp(state.wind+(simRandom()-.5)*40,-80,80);
 state.worms.forEach(w=>w.active=false);
 const alive=living(team);if(!alive.length){finish(1-team);return}
 const prior=state.lastActiveId[team];state.active=alive.find(w=>w.id>prior)||alive[0];state.active.active=true;state.lastActiveId[team]=state.active.id;state.dir=team? -1:1;state.aim=-.78;state.power=.55;
 updateUI();say(team?'DIRT DEVILS ARE THINKING...':'YOUR TURN · TAKE AIM',1.8);
 state.aiTimer=team?1.1:0;
}
function finish(winner){clearPendingTurn();state.brokerController?.abort();state.brokerController=null;$('broker-panel').hidden=true;state.ended=true;state.running=false;state.phase='ended';state.musicNextTime=0;$('result-caption').textContent=winner===2?'THE ISLAND CLAIMS EVERYONE':winner?'THE DIRT DEVILS WIN':'SKY SQUAD WINS';$('result-title').textContent=winner===2?'DRAW':winner?'DEFEAT':'VICTORY!';$('result-text').textContent=winner===2?'Both teams went under. Try another island!':winner?'The Dirt Devils took this island. Try another tactic!':'The Dirt Devils have been sent packing. The island is yours!';$('result').classList.add('open');tone(winner?180:600,.5,'sine',.1,winner?80:900)}
function nextTurn(){if(state.ended)return;const p=living(0).length,e=living(1).length;if(!p||!e){finish(!p&&!e?2:p?0:1);return}if(state.team===1){state.round++;if(state.round>8){state.waterLevel=Math.max(270,WATER-(state.round-8)*12);say('SUDDEN DEATH · WATER RISING!',1.7)}}beginTurn(1-state.team)}
function cycle(){if(!state.running||state.team!==0||state.used||state.shotgunLeft||state.phase!=='ready')return;const a=living(0),idx=a.indexOf(state.active);state.active.active=false;state.active=a[(idx+1)%a.length];state.active.active=true;state.lastActiveId[0]=state.active.id;updateUI();tone(450,.05)}
function endTurn(){if(!state.running||state.team!==0||state.phase==='resolving')return;state.used=true;state.phase='resolving';state.resolveTimer=.5;state.charging=false;say('TURN PASSED',.8)}
function emit(x,y,color,count=18,speed=180){for(let i=0;i<count;i++){const a=visualRand()*Math.PI*2,v=speed*(.25+visualRand()*.9);state.particles.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-50,life:.35+visualRand()*.6,max:1,r:1.5+visualRand()*5,color});}}
function explosion(x,y,r,damage,source){state.shake=Math.max(state.shake,13);tone(95,.36,'sawtooth',.13,38);noise(.34,.11,750);emit(x,y,'#ffdd82',42,310);emit(x,y,'#634957',22,230);carve(state.terrain,x,y,r*.78);buildTerrain();
 for(const w of state.worms){if(!w.alive)continue;const d=Math.hypot(w.x-x,w.y-y);const hurt=blastDamage(d,r,damage);if(hurt){w.hp=Math.max(0,w.hp-hurt);w.flash=.7;wormCry();const push=(1-d/r)*400;w.vx+=(w.x-x)/(d||1)*push;w.vy-=Math.max(130,push*.7);w.grounded=false;emit(w.x,w.y,w.team?'#ff9980':'#8ef9e4',8,110);if(!w.hp)kill(w);}}
 updateUI();if(state.phase==='retreat')state.phase='resolving';if(state.phase==='resolving')state.resolveTimer=Math.max(state.resolveTimer,1.3);
}
function kill(w){if(!w.alive)return;w.alive=false;w.active=false;emit(w.x,w.y,'#fff8d1',28,220);tone(230,.22,'square',.05,80);chirp();say(w.name.toUpperCase()+' IS OUT!',1.3);if((state.active===w&&state.phase==='ready')||living(w.team).length===0){state.phase='resolving';state.resolveTimer=1.5}updateUI()}
function startResolution(wait=1){state.shotgunLeft=0;state.phase='resolving';state.resolveTimer=wait;state.used=true;state.charging=false}
function setGrenadeFuse(value){if(!state.running||state.team!==0||state.phase!=='ready'||state.selected!=='grenade')return;state.grenadeFuse=clamp(Number(value)||3,1,5);state.playerGrenadeFuse=state.grenadeFuse;updateUI();tone(620,.05,'triangle',.025)}
function toggleGrenadeBounce(){if(!state.running||state.team!==0||state.phase!=='ready'||state.selected!=='grenade')return;state.grenadeBounce=state.grenadeBounce==='high'?'low':'high';state.playerGrenadeBounce=state.grenadeBounce;updateUI();tone(540,.07,'triangle',.025)}
function toggleStrikeDirection(){if(!state.running||state.team!==0||state.phase!=='ready'||state.selected!=='airstrike')return;state.strikeDir*=-1;state.playerStrikeDir=state.strikeDir;updateUI();tone(460,.07,'triangle',.025)}
function dropDynamite(){if(!state.running||state.phase!=='jetpack'||state.jetDropped||!state.active?.alive)return false;const w=state.active;state.projectiles.push({type:'dynamite',x:w.x,y:w.y+R+3,vx:w.vx*.25,vy:w.vy,fuse:3,r:9,bounces:0,bounceFactor:.48,source:w.id,trail:[]});state.jetDropped=true;weaponSound('dynamite');say('DYNAMITE DROPPED!',1);updateUI();return true}
function aimVector(){return {x:Math.cos(state.aim)*state.dir,y:Math.sin(state.aim)}}
function fire(power=state.power){if(!state.running||state.phase!=='ready'||!state.active?.alive)return;const w=state.active,weapon=state.selected,v=aimVector();state.charging=false;weaponSound(weapon);if(weapon==='shotgun')noise(.18,.065,2300);else if(weapon==='bazooka')noise(.1,.035,1400);
 if(weapon==='jetpack'){state.phase='jetpack';state.used=true;state.jetTime=4;if(state.team===1)w.jetUsed=true;say('JETPACK · STEER TO FLY',1.4);tone(480,.2,'sawtooth',.04,170);updateUI();return}
 if(weapon==='punch'){let hit=false;for(const target of state.worms){if(!target.alive||target.team===w.team)continue;const dx=target.x-w.x,dy=target.y-w.y;if(Math.abs(dx)<65&&Math.abs(dy)<48&&Math.sign(dx)===state.dir){target.hp=Math.max(0,target.hp-data.punch.damage);target.vx=state.dir*350;target.vy=-250;target.grounded=false;target.flash=.7;wormCry();emit(target.x,target.y,'#ffda8d',18,170);if(!target.hp)kill(target);hit=true;break}}carve(state.terrain,w.x+state.dir*39,w.y-3,24);buildTerrain();say(hit?'WHAM!':'SWUNG AND MISSED!',1.3);tone(hit?190:350,.12,'square',.08);startResolution(1.3);updateUI();return}
 if(weapon==='shotgun'){if(!state.shotgunLeft)state.shotgunLeft=2;let hits=0;const chips=[];for(let i=0;i<5;i++){const a=state.aim+(simRandom()-.5)*.24,dir={x:Math.cos(a)*state.dir,y:Math.sin(a)},origin={x:w.x+dir.x*22,y:w.y-7+dir.y*22};for(let dist=0;dist<450;dist+=5){const x=origin.x+dir.x*dist,y=origin.y+dir.y*dist;if(x<0||x>=W||y<0||y>=H)break;if(solid(state.terrain,x,y)){chips.push([x,y]);break}let done=false;for(const target of state.worms){if(!target.alive||target===w)continue;if(Math.hypot(x-target.x,y-target.y)<R){target.hp=Math.max(0,target.hp-5);target.vx+=dir.x*32;target.vy-=24;target.flash=.6;hits++;if(!target.hp)kill(target);done=true;break}}if(done)break;}state.particles.push({x:origin.x,y:origin.y,vx:dir.x*340,vy:dir.y*340,life:.15,max:.15,r:2,color:'#fff3c9'});}for(const [x,y]of chips)carve(state.terrain,x,y,3);if(chips.length)buildTerrain();emit(w.x+v.x*25,w.y-7+v.y*25,'#ffda80',17,100);tone(180,.23,'sawtooth',.09,55);const result=hits?`${hits*5} DAMAGE`:'MISSED';if(hits)wormCry();state.shotgunLeft--;if(state.shotgunLeft){say(`SHOTGUN · ${result} · SECOND SHOT!`,1.2);state.aiTimer=.4}else{say(`SHOTGUN · ${result}`,1.2);startResolution(1.2)}updateUI();return}
 if(weapon==='dynamite'){state.projectiles.push({type:'dynamite',x:w.x+state.dir*22,y:w.y-4,vx:0,vy:0,fuse:3,r:9,bounces:0,source:w.id,trail:[]});say('DYNAMITE · TAKE COVER!',1.6);tone(280,.1);state.phase='retreat';state.used=true;state.resolveTimer=3.6;state.aiRetreat=-state.dir;updateUI();return}
 if(weapon==='airstrike'){let tx=state.airTarget??clamp(w.x+state.dir*320,80,W-80);tx=clamp(tx,75,W-75);for(let i=0;i<5;i++)state.projectiles.push({type:'airstrike',x:clamp(tx-state.strikeDir*130+(i-2)*35,5,W-5),y:-170-i*90,vx:state.strikeDir*160,vy:370,fuse:6+i*.2,r:6,source:w.id,trail:[]});say('INCOMING AIRSTRIKE!',1.5);tone(600,.3,'sawtooth',.05,180);startResolution(4.3);updateUI();return}
 const speed=(weapon==='grenade'?300:370)+(weapon==='grenade'?280:390)*power;
 state.projectiles.push({type:weapon,x:w.x+v.x*24,y:w.y-9+v.y*22,vx:v.x*speed,vy:v.y*speed,fuse:weapon==='grenade'?state.grenadeFuse:7,bounceFactor:weapon==='grenade'?(state.grenadeBounce==='high'?.55:.32):.48,r:weapon==='grenade'?8:6,source:w.id,trail:[]});emit(w.x+v.x*30,w.y-8+v.y*20,'#fff6bb',9,70);tone(weapon==='grenade'?330:130,.15,'sawtooth',.08,80);say(weapon==='grenade'?'GRENADE AWAY!':'ROCKET AWAY!',1);startResolution(weapon==='grenade'?state.grenadeFuse+.7:1.8);updateUI();
}
function safeWalk(a,b){const dir=Math.sign(b-a),t=state.terrain;if(!dir)return true;let prior=groundY(t,a);for(let x=a+dir*18;dir>0?x<=b:x>=b;x+=dir*18){const y=groundY(t,x);if(y>state.waterLevel-40||Math.abs(y-prior)>50)return false;prior=y}return groundY(t,b)<state.waterLevel-40}
function aiAct(){if(!state.running||state.team!==1||state.phase!=='ready')return;if(state.aiDriver==='broker'){requestBrokerTurn();return}const profile=AI_PROFILES[state.difficulty]??AI_PROFILES[1];const w=state.active,foes=living(0),friends=living(1),near=foes.reduce((a,b)=>Math.abs(a.x-w.x)<Math.abs(b.x-w.x)?a:b),dx=near.x-w.x,dy=near.y-w.y-7,dist=Math.hypot(dx,dy);
 if(state.shotgunLeft){const target=foes.reduce((a,b)=>Math.abs(a.x-w.x)<Math.abs(b.x-w.x)?a:b);state.selected='shotgun';state.dir=Math.sign(target.x-w.x)||1;state.aim=aimAngle(target.x-w.x,target.y-w.y-7);w.face=state.dir;fire();return}
 if(Math.abs(dx)<58&&Math.abs(dy)<48){state.selected='punch';state.dir=Math.sign(dx)||1;fire();return}
 if(state.aiMoves===0&&!w.jetUsed&&groundY(state.terrain,w.x)>state.waterLevel-70){const candidates=[240,-240,340,-340].map(d=>clamp(w.x+d,65,W-65)),landing=candidates.find(x=>groundY(state.terrain,x)<state.waterLevel-105&&friends.every(f=>f===w||Math.abs(f.x-x)>40));if(landing){state.selected='jetpack';state.aiTarget=landing;state.aiMoves++;fire();return}}
 if(state.difficulty>0&&dist>58&&dist<112&&Math.abs(dy)<60&&w.hp>55&&w.x>220&&w.x<W-220&&safeWalk(w.x,w.x-Math.sign(dx)*190)&&friends.every(f=>f===w||Math.abs(f.x-w.x)>140)){state.selected='dynamite';state.dir=Math.sign(dx);state.aiTarget=w.x-state.dir*190;fire();return}
 if(dist<profile.shotgunRange&&Math.abs(dy)<85){let clear=true;for(let d=25;d<dist-20;d+=7){if(solid(state.terrain,w.x+dx*d/dist,w.y-7+dy*d/dist)){clear=false;break}}if(clear){state.selected='shotgun';state.dir=Math.sign(dx)||1;state.aim=aimAngle(dx,dy)+(simRandom()-.5)*profile.aimError;w.face=state.dir;fire();return}}
 const shot=selectShot(state.terrain,w,foes,friends,state.wind,state.difficulty);
 if(profile.reposition&&state.aiMoves<1&&state.timer>7&&(shot?.score??0)<38){let best=null;for(const offset of [-180,-120,120,180]){const x=w.x+offset;if(x<65||x>W-65||!safeWalk(w.x,x))continue;const probe={x,y:groundY(state.terrain,x)-R-2};if(friends.some(f=>f!==w&&Math.abs(f.x-x)<35))continue;const plan=selectShot(state.terrain,probe,foes,friends.filter(f=>f!==w).concat(probe),state.wind,state.difficulty);if(plan&&(!best||plan.score>best.score))best={x,score:plan.score}}
  if(best&&best.score>(shot?.score??0)+12){state.aiTarget=best.x;state.aiMoveTime=Math.min(2.2,Math.abs(best.x-w.x)/145+.35);state.aiMoves++;state.phase='reposition';say('DIRT DEVILS REPOSITION...',1.2);return}
  if(!w.jetUsed&&(shot?.score??0)<17&&dist>450){const dir=Math.sign(dx),candidates=[260,360,180].map(d=>clamp(w.x+dir*d,65,W-65)),landing=candidates.find(x=>groundY(state.terrain,x)<state.waterLevel-55&&!safeWalk(w.x,x));if(landing){state.selected='jetpack';state.aiTarget=landing;state.aiMoves++;fire();return}}
 }
 const lob=dist<650?selectLob(state.terrain,w,foes,friends,state.wind,state.difficulty):null;
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
function updateWorm(w,dt){if(!w.alive)return;w.flash=Math.max(0,w.flash-dt);const player=state.team===0&&state.active===w&&state.running&&(state.phase==='ready'||state.phase==='jetpack'||state.phase==='retreat');const ai=state.team===1&&state.active===w&&['reposition','jetpack','retreat'].includes(state.phase);const aiDir=state.phase==='retreat'?state.aiRetreat:Math.sign(state.aiTarget-w.x);const aiDrive=ai&&Math.abs(state.aiTarget-w.x)>18||ai&&state.phase==='retreat';const aiLeft=aiDrive&&aiDir<0,aiRight=aiDrive&&aiDir>0;const ahead=w.x+aiDir*35,aiCliff=ai&&aiDir!==0&&(groundY(state.terrain,ahead)>WATER-25||groundY(state.terrain,ahead)-groundY(state.terrain,w.x)>55);const left=player&&(state.keys.left||state.keys.KeyA||state.keys.ArrowLeft)||aiLeft,right=player&&(state.keys.right||state.keys.KeyD||state.keys.ArrowRight)||aiRight,jump=player&&(state.keys.jump||state.keys.KeyW||state.keys.ArrowUp)||aiCliff&&state.phase!=='retreat';
 if(left){w.vx=clamp(w.vx-700*dt,-180,180);w.face=-1}if(right){w.vx=clamp(w.vx+700*dt,-180,180);w.face=1}if(!left&&!right&&w.grounded)w.vx*=Math.max(0,1-7*dt);
 w.stepClock=Math.max(0,(w.stepClock||0)-dt);if(w.grounded&&Math.abs(w.vx)>65&&w.stepClock===0){tone(135,.035,'triangle',.018,85);w.stepClock=.27}
 if(state.phase==='jetpack'&&state.active===w){const thrust=player?jump:(w.y>groundY(state.terrain,w.x)-85||aiCliff);if(thrust){w.vy-=850*dt;emit(w.x,w.y+14,'#ffd47b',1,70)}}else if(jump&&w.grounded){w.vy=-335;w.grounded=false;tone(360,.08,'sine',.035,480)}
 w.vy+=GRAVITY*dt;w.vy=clamp(w.vy,-600,750);
 const nx=clamp(w.x+w.vx*dt,R,W-R);if(!solid(state.terrain,nx+Math.sign(w.vx)*R*.75,w.y-2)&&!solid(state.terrain,nx,w.y-13))w.x=nx;else w.vx=0;
 const dy=w.vy*dt,steps=Math.max(1,Math.ceil(Math.abs(dy)/4));w.grounded=false;
 for(let i=0;i<steps;i++){const ny=w.y+dy/steps;if(w.vy>=0&&(solid(state.terrain,w.x-8,ny+R)||solid(state.terrain,w.x+8,ny+R))){w.vy=0;w.grounded=true;break}if(w.vy<0&&solid(state.terrain,w.x,ny-R)){w.vy=0;break}w.y=ny}
 if(w.y>state.waterLevel-10){w.hp=0;kill(w);say(w.name.toUpperCase()+' TOOK A SWIM!',1.4)}
}
function updateProjectile(p,dt){const oldFuse=p.fuse;p.fuse-=dt;if(p.type==='dynamite'&&Math.ceil(oldFuse)>Math.ceil(p.fuse)&&p.fuse>0)tone(920,.07,'square',.035,650);p.trail.push({x:p.x,y:p.y});if(p.trail.length>12)p.trail.shift();const sub=4;for(let i=0;i<sub;i++){const d=dt/sub;p.vx+=state.wind*(p.type==='airstrike'?0:.7)*d;p.vy+=GRAVITY*d;p.x+=p.vx*d;p.y+=p.vy*d;
  if(p.x<4||p.x>W-4){if(p.type==='grenade'||p.type==='dynamite'){p.vx*=-.55;p.x=clamp(p.x,4,W-4)}else{p.dead=true;return}}
  if(p.y>state.waterLevel){if(p.type==='grenade'||p.type==='dynamite'){p.dead=true;emit(p.x,state.waterLevel,'#d6f5ff',15,110);tone(440,.12,'sine',.04);return}p.dead=true;return}
  if(solid(state.terrain,p.x,p.y+p.r)){if(p.type==='grenade'||p.type==='dynamite'){p.y-=p.r+3;p.vy=-Math.abs(p.vy)*(p.bounceFactor??.48);p.vx*=.74;p.bounces++;if(p.type==='grenade')tone(650,.055,'triangle',.025,340);if(p.bounces>5){p.vx*=.7;p.vy=0}break}else{p.dead=true;explosion(p.x,p.y,data[p.type].radius,data[p.type].damage,p.source);return}}
  if(p.type==='bazooka'){for(const w of state.worms){if(!w.alive||w.id===p.source&&p.fuse>6.8)continue;if(Math.hypot(w.x-p.x,w.y-p.y)<R+p.r){p.dead=true;explosion(p.x,p.y,77,58,p.source);return}}}
 }
 if(p.fuse<=0){p.dead=true;if(p.type==='grenade'||p.type==='dynamite'){explosion(p.x,p.y,data[p.type].radius,data[p.type].damage,p.source)}else if(p.type==='airstrike'){explosion(p.x,p.y,56,40,p.source)}else if(p.type==='bazooka'){p.dead=true}}
}
function update(dt){if(!state.running)return;musicTick();if(state.team===1&&state.aiDriver==='broker'&&['broker-wait','broker-error'].includes(state.phase)){updateUI();return}state.wind+=(state.windTarget-state.wind)*dt*.08;state.shake=Math.max(0,state.shake-25*dt);if(state.messageTimer>0){state.messageTimer-=dt;if(state.messageTimer<=0)$('message').textContent=''}
 if(state.phase==='ready'||state.phase==='jetpack'||state.phase==='reposition'){state.timer-=dt;if(state.timer<=0){state.timer=0;say('TIME IS UP!',1);startResolution(.7)}if(state.phase==='jetpack'){state.jetTime-=dt;state.jetPulse=(state.jetPulse||0)-dt;if(state.jetPulse<=0){noise(.19,.018,1800);state.jetPulse=.44}if(state.jetTime<=0)startResolution(.8)}if(state.phase==='reposition'){state.aiMoveTime-=dt;if(state.aiMoveTime<=0||Math.abs(state.active.x-state.aiTarget)<20){state.phase='ready';state.aiTimer=.25}}}
 if(state.team===1&&state.phase==='ready'){state.aiTimer-=dt;if(state.aiTimer<=0)aiAct()}
 if(state.team===1&&state.phase==='jetpack'&&!state.jetDropped&&state.active?.alive){const w=state.active;const target=living(0).find(f=>Math.abs(f.x-w.x)<62&&f.y-w.y>45);if(target&&living(1).every(f=>f===w||Math.hypot(f.x-w.x,f.y-w.y)>125))dropDynamite()}
 if(state.charging){state.power+=state.chargeDir*dt*.85;if(state.power>=1){state.power=1;state.chargeDir=-1}else if(state.power<=.18){state.power=.18;state.chargeDir=1}}
 if(state.team===0&&state.phase==='ready'){if(state.keys.aimleft||state.keys.KeyQ)state.aim=clamp(state.aim-.95*dt,AIM_MIN,AIM_MAX);if(state.keys.aimright||state.keys.KeyE)state.aim=clamp(state.aim+.95*dt,AIM_MIN,AIM_MAX)}
 for(const w of state.worms)updateWorm(w,dt);
 for(const p of state.projectiles)if(!p.dead)updateProjectile(p,dt);state.projectiles=state.projectiles.filter(p=>!p.dead);
 for(const p of state.particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=350*dt;p.life-=dt}state.particles=state.particles.filter(p=>p.life>0);
 if(state.phase==='resolving'||state.phase==='retreat'){state.resolveTimer-=dt;if(state.resolveTimer<=0&&state.projectiles.length===0&&state.worms.every(w=>!w.alive||w.grounded||w.y>state.waterLevel))nextTurn()}
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
function drawBackground(t){const th=themes[state.map],g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,th.sky[0]);g.addColorStop(1,th.sky[1]);ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
 const sunX=state.map===2?1280:1260,sunY=state.map===2?148:202;ctx.save();ctx.globalAlpha=state.map===2?.65:.7;ctx.fillStyle=state.map===2?'#eff8ff':'#ffefad';ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=58;ctx.beginPath();ctx.arc(sunX,sunY,state.map===2?58:82,0,Math.PI*2);ctx.fill();ctx.restore();
 ctx.fillStyle=th.hill;ctx.globalAlpha=.32;ctx.beginPath();ctx.moveTo(0,540);for(let x=0;x<=W;x+=15)ctx.lineTo(x,530+65*Math.sin(x/180)+24*Math.sin(x/47));ctx.lineTo(W,800);ctx.lineTo(0,800);ctx.fill();ctx.globalAlpha=1;
 for(const d of state.decor){const a=state.map===2?.6:.24;ctx.fillStyle=`rgba(255,255,255,${a})`;ctx.beginPath();ctx.ellipse(d.x,d.y,d.r*4,d.r,0,0,Math.PI*2);ctx.fill()}
 const water=ctx.createLinearGradient(0,WATER,0,H);water.addColorStop(0,th.water);water.addColorStop(1,'#0b3158');ctx.fillStyle=water;ctx.fillRect(0,WATER,W,H-WATER);ctx.fillStyle='#b4f8fa99';for(let i=0;i<30;i++){const x=(i*79+Math.sin(performance.now()*.001+i)*24)%W;ctx.fillRect(x,WATER+8+(i%3)*10,32,2)}
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
function drawAim(){if(!state.running||state.team!==0||state.phase!=='ready'||!state.active?.alive)return;const w=state.active,v=aimVector();ctx.save();ctx.strokeStyle='#fff8d9';ctx.lineWidth=3;ctx.setLineDash([8,8]);ctx.beginPath();ctx.moveTo(w.x+v.x*27,w.y-8+v.y*27);ctx.lineTo(w.x+v.x*125,w.y-8+v.y*125);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#fff9dd';ctx.beginPath();ctx.arc(w.x+v.x*125,w.y-8+v.y*125,6,0,Math.PI*2);ctx.fill();if(state.selected==='airstrike'&&state.airTarget!=null){ctx.strokeStyle='#ffefaa';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(state.airTarget,120);ctx.lineTo(state.airTarget,groundY(state.terrain,state.airTarget)-30);ctx.stroke();ctx.beginPath();ctx.arc(state.airTarget,groundY(state.terrain,state.airTarget)-25,28,0,Math.PI*2);ctx.stroke()}ctx.restore()}
function render(){if(!state.terrain)return;ctx.save();if(state.shake){ctx.translate((visualRand()-.5)*state.shake,(visualRand()-.5)*state.shake)}drawBackground();drawEnvironment(ctx,state,groundY);ctx.drawImage(state.terrainCanvas,0,0);if(state.waterLevel<WATER){ctx.fillStyle='#226fa9aa';ctx.fillRect(0,state.waterLevel,W,H-state.waterLevel);ctx.fillStyle='#b4f8fa';ctx.fillRect(0,state.waterLevel,W,4)}for(const p of state.projectiles)drawOrdnance(ctx,p);for(const w of state.worms)drawCharacter(ctx,w,{active:w===state.active&&state.running,weapon:state.selected,aim:state.aim,phase:state.phase,now:performance.now()});drawAim();for(const p of state.particles){ctx.globalAlpha=clamp(p.life/p.max,0,1);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill()}ctx.globalAlpha=1;ctx.restore()}
let last=performance.now();function loop(now){const dt=Math.min((now-last)/1000,.04);last=now;update(dt);render();requestAnimationFrame(loop)}requestAnimationFrame(loop);
function pointerCoords(ev){const r=canvas.getBoundingClientRect();return{x:(ev.clientX-r.left)/r.width*W,y:(ev.clientY-r.top)/r.height*H}}
function aimAt(ev){if(!state.running||state.team!==0||state.phase!=='ready')return;const m=pointerCoords(ev),w=state.active,dx=m.x-w.x,dy=m.y-w.y+8;if(state.selected==='airstrike'){state.airTarget=m.x;return}state.dir=dx<0?-1:1;state.aim=aimAngle(dx,dy);w.face=state.dir}
function chargeStart(){if(!state.running||state.team!==0||state.phase!=='ready'||state.charging)return;if(['punch','dynamite','airstrike','jetpack','shotgun'].includes(state.selected)){fire();return}state.charging=true;state.chargeDir=1;state.power=.22;tone(480,.08,'sine',.03,650)}
function chargeEnd(){if(state.charging)fire()}
const weaponBox=$('weapons');WEAPONS.forEach((id,i)=>{const b=document.createElement('button');b.className='weapon';b.dataset.weapon=id;b.title=`${data[id].name} - ${data[id].short}`;b.innerHTML=`<span class="glyph">${data[id].icon}</span><span class="name">${data[id].name}</span><span class="key">${i+1}</span>`;b.addEventListener('click',()=>{if(state.team!==0||state.phase!=='ready'||state.shotgunLeft)return;state.selected=id;state.playerWeapon=id;state.airTarget=null;updateUI();tone(530,.06,'sine',.03)});weaponBox.appendChild(b)});
for(const button of document.querySelectorAll('[data-fuse]'))button.addEventListener('click',()=>setGrenadeFuse(button.dataset.fuse));
$('bounce-toggle').addEventListener('click',toggleGrenadeBounce);
$('strike-direction').addEventListener('click',toggleStrikeDirection);
$('drop-dynamite').addEventListener('click',dropDynamite);
canvas.addEventListener('pointermove',aimAt);canvas.addEventListener('pointerdown',e=>{aimAt(e);if(e.pointerType==='mouse'&&e.button===0&&state.selected!=='airstrike')chargeStart()});window.addEventListener('pointerup',chargeEnd);
$('fire').addEventListener('pointerdown',e=>{e.preventDefault();chargeStart()});$('fire').addEventListener('pointerup',e=>{e.preventDefault();chargeEnd()});$('fire').addEventListener('pointerleave',chargeEnd);
$('end-turn').onclick=endTurn;$('touch-switch').onclick=cycle;
for(const b of document.querySelectorAll('[data-hold]')){const k=b.dataset.hold;b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);state.keys[k]=true});for(const event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,()=>state.keys[k]=false)}
window.addEventListener('keydown',e=>{
 if(['Space','ArrowLeft','ArrowRight','ArrowUp','Tab'].includes(e.code))e.preventDefault();
 if(e.repeat&&['Space','Tab','KeyX'].includes(e.code))return;
 state.keys[e.code]=true;
 if(e.code==='Space')chargeStart();if(e.code==='Tab')cycle();if(e.code==='Enter')endTurn();
 if(e.code==='KeyX')dropDynamite();
 if(e.code==='KeyR')toggleStrikeDirection();
 if(e.code==='Minus'||e.code==='Equal')toggleGrenadeBounce();
 if(e.shiftKey&&/^Digit[1-5]$/.test(e.code)){setGrenadeFuse(Number(e.code.slice(-1)));return}
 if(/^Digit[1-7]$/.test(e.code)&&state.team===0&&state.phase==='ready'&&!state.shotgunLeft){state.selected=WEAPONS[Number(e.code.slice(-1))-1];state.playerWeapon=state.selected;state.airTarget=null;updateUI()}
});
window.addEventListener('keyup',e=>{state.keys[e.code]=false;if(e.code==='Space')chargeEnd()});window.addEventListener('blur',()=>{state.keys={};state.charging=false;state.power=.5;updateUI()});
const aiHints=['Easy: aims loosely, favors simple shots and rarely changes position.','Normal: plans shots, uses grenades and moves for a better angle.','Hard: searches more trajectories, protects allies and aims precisely.'];
function updateAiHint(){const base=aiHints[clamp(Number($('difficulty').value)||0,0,2)];$('ai-hint').textContent=$('ai-driver').value==='broker'?base+' Each AI action is chosen by Broker LLM. Requires configured access.':base+' Local algorithm.'}
$('difficulty').onchange=updateAiHint;$('ai-driver').onchange=updateAiHint;
function applyAudioSettings(unlock=false){const priorMusic=state.musicEnabled;state.sound=$('effects-on').checked;state.musicEnabled=$('music-on').checked;state.fxVolume=clamp(Number($('effects-volume').value)/100,0,1);state.musicVolume=clamp(Number($('music-volume').value)/100,0,1);if(unlock){if(!state.audioUnlocked)unlockAudio();else audio?.resume?.()}if(!priorMusic&&state.musicEnabled){state.musicStep=0;state.musicNextTime=0}$('sound').textContent=state.sound||state.musicEnabled?'♫':'×';$('sound').title=state.sound||state.musicEnabled?'Music and effects settings':'Sound off — open settings'}
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
  state.projectiles=[];state.particles=[];state.brokerController=null;state.brokerRequest=record.request;
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
window.__craterCrew={state,newGame,fire,explosion,finish,beginTurn,update,render,cycle,aimAt,aiAct,requestBrokerTurn,restorePendingBrokerTurn,setGrenadeFuse,toggleGrenadeBounce,toggleStrikeDirection,dropDynamite};

