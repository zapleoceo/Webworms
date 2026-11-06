import {drawEnvironment,drawCharacter,drawOrdnance,TEAM_COLORS} from './art.js';
import {bakeSoil,paintTerrain,grassDepths} from './terrain-art.js';
import {themes} from './themes.js';
import {drawHud} from './hud.js';
import {weaponIcon} from './icons.js';
import {makeBlast,drawBlast} from './effects.js';
import {bakeBackground,drawBackdrop,drawAmbient,drawWater} from './scenery.js';
import {brokerTurnOptions,brokerSnapshot} from './broker-ai.js';
import {clearPendingTurn,savePendingTurn,readPendingTurn} from './broker-resume.js';
import {JOURNAL_MAX,openTurn,noteAction,noteTarget,noteLanding,closeTurn,targetFromCandidate} from './journal.js';
import {W,H,WATER,R,GRAVITY,WEAPONS,data,AI_PROFILES,clamp,seeded,createTerrain,solid,carve,groundY,blastDamage,selectShot,selectLob,AIM_MIN,AIM_MAX,aimAngle,VIEW_W,VIEW_H,spawnSpots,BODIES,stepBody,crawl,wormFits,wormGrounded,WALK_SPEED,wormDrowned} from './engine.js';
import {voice as speak,stopVoices,configureVoices,loadVoices} from './voice.js';
import {createMusic} from './music.js';
import {placeProps,dropCrate,blastProps,updateProps,drawProps,propsBusy} from './props.js';
import {fireRope,stepRope,releaseRope,ropePoints} from './rope.js';
import {planTeleport,planCrate,planRope,executeRopeInputs} from './ai-utility.js';
import {mergeSettings,pickSponsors} from './settings.js';
import {loadSponsorImages,sponsorImage,safeLink,placeBillboards,drawBillboards,placeBattleAds,drawBattleAds} from './sponsors.js';
// Match settings, like a classic scheme: map props and how often a health crate drops at turn start.
const scheme={mines:8,barrels:6,crateChance:.3};
// Admin-tunable rules (settings.js, served by /api/settings); the defaults are the built-in game. A new match reads
// them in newGame; settings that arrive mid-match wait for the next one.
const rules={turnTime:35,teleports:2,crateHeal:25,suddenDeathRound:9,waterRise:12,windStart:36,windDrift:20,windCap:80,maps:[0,1,2],voices:true,sponsors:[]};
let pendingSettings=null,ctrlsSaved=false,audioTouched=false,brokerDown=false,offered={hard:true,ultra:true,god:true};
const $=id=>document.getElementById(id), canvas=$('game'),ctx=canvas.getContext('2d');
const names=[['Pip','Bubbles','Mochi'],['Grub','Maverick','Nibbles']],TEAM_NAMES=['SKY SQUAD','DIRT DEVILS'],TEAM_TITLES=['Sky Squad','Dirt Devils'];
// Who plays each team: 'human', 'easy' (the local algorithm at its sharpest), 'hard' (Broker LLM that ignores
// the wind), 'ultra' (Broker LLM with every game parameter) or 'god' (ultra plus the match journal: every earlier
// turn and its outcome, see journal.js). Without a setup choice the legacy
// single-player defaults apply: humans are team 0, the AI is team 1 driven by state.aiDriver.
const ctrl=t=>state.controllers?.[t]??(t?(state.aiDriver==='broker'?'ultra':'local'):'human');
const isHuman=t=>ctrl(t)==='human',isBot=t=>!isHuman(t),usesBroker=t=>['hard','ultra','god'].includes(ctrl(t));
export const CONTROLLER_LABELS={human:'HUMAN',easy:'PC EASY',hard:'PC HARD',ultra:'PC ULTRA',god:'PC GOD'};
const mapNames=['SUNSET COVE','RUST RIDGE','CRYSTAL ATOLL','GRAND EXPEDITION'];
const state={running:false,ended:false,map:0,difficulty:1,aiDriver:'local',brokerController:null,brokerTicket:null,brokerTurnId:null,brokerRequest:null,brokerSavedAt:null,brokerSequence:0,brokerOptions:[],brokerError:'',terrain:null,terrainCanvas:null,worms:[],projectiles:[],particles:[],blasts:[],decor:[],team:0,active:null,lastActiveId:[-1,-1],selected:'bazooka',playerWeapon:'bazooka',phase:'ready',timer:35,round:1,waterLevel:WATER,wind:0,windTarget:0,aim:-0.75,dir:1,power:.5,charging:false,chargeDir:1,used:false,shotgunLeft:0,grenadeFuse:3,grenadeBounce:'high',strikeDir:1,playerGrenadeFuse:3,playerGrenadeBounce:'high',playerStrikeDir:1,jetDropped:false,keys:{},aiTimer:0,aiMoves:0,aiTarget:0,aiMoveTime:0,aiRetreat:0,resolveTimer:0,message:'',messageTimer:0,shake:0,sound:false,musicEnabled:false,fxVolume:.65,musicVolume:.42,audioUnlocked:false,musicStep:0,musicNextTime:0,jetTime:0};
let simRand=seeded(77421),visualRand=seeded(19031);
const simRandom=()=>{state.simDraws=(state.simDraws||0)+1;return simRand()};
const newMatchId=()=>{const bytes=new Uint8Array(8);globalThis.crypto.getRandomValues(bytes);return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')};
let audio=null;
// Sandbox runs (state.sim) stay silent and invisible.
const voice=(w,event)=>!state.sim&&speak(w,event);
function tone(freq=300,duration=.15,type='triangle',volume=.08,slide=0){if(state.sim)return;if(!state.sound||state.fxVolume===0)return;try{audio??=new AudioContext();const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.setValueAtTime(freq,audio.currentTime);if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(30,slide),audio.currentTime+duration);g.gain.setValueAtTime(volume*state.fxVolume,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+duration)}catch{}}
function noise(duration=.18,volume=.07,cutoff=1400){if(state.sim)return;if(!state.sound||state.fxVolume===0)return;try{audio??=new AudioContext();const frames=Math.ceil(audio.sampleRate*duration),buffer=audio.createBuffer(1,frames,audio.sampleRate),samples=buffer.getChannelData(0);for(let i=0;i<frames;i++)samples[i]=Math.random()*2-1;const source=audio.createBufferSource(),filter=audio.createBiquadFilter(),gain=audio.createGain();source.buffer=buffer;filter.type='lowpass';filter.frequency.value=cutoff;gain.gain.setValueAtTime(volume*state.fxVolume,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);source.connect(filter).connect(gain).connect(audio.destination);source.start();source.stop(audio.currentTime+duration)}catch{}}
// Music: well-known public-domain tunes synthesised in music.js; one per match, a tense one for sudden death.
const music=createMusic(()=>audio);
function musicTick(){if(!state.sim)music.tick(state)}
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
function say(text,time=2,color=''){if(state.sim)return;state.message=text;state.messageTimer=time;$('message').textContent=text;$('message').style.color=color}
function buildTerrain(rect=null){if(state.sim)return;
 const t=state.terrain,th=themes[state.map],key=state.seed+':'+state.map;
 if(!state.soil||state.soil.key!==key)state.soil={key,...bakeSoil(state.map,state.seed,W,H,th)};
 if(!state.terrainBuf||state.terrainBuf.off.width!==W||state.terrainBuf.off.height!==H){const off=document.createElement('canvas');off.width=W;off.height=H;const c=off.getContext('2d');state.terrainBuf={off,c,run:new Uint16Array(W),grass:grassDepths(W)}}
 const {off,c,run,grass}=state.terrainBuf;
 // Painted in column strips the size of the changed area, so no full W x H RGBA copy stays in memory.
 const x0=rect?Math.max(0,rect.x0):0,x1=rect?Math.min(W-1,rect.x1):W-1,y0=rect?Math.max(0,rect.y0):0;
 if(y0<H)for(let sx=x0;sx<=x1;sx+=512){const ex=Math.min(x1,sx+511),im=c.createImageData(ex-sx+1,H-y0);paintTerrain(im.data,run,grass,t.mask,state.soil,th,W,H,{x0:sx,x1:ex,y0,local:true});c.putImageData(im,sx,y0)}
 state.terrainCanvas=off;
}
function newGame(map=0,difficulty=1,seed=Math.floor(Date.now()%1e9),preservePending=false){
 if(pendingSettings){const s=pendingSettings;pendingSettings=null;useSettings(s)}
 stopVoices();if(!preservePending)clearPendingTurn();state.brokerController?.abort();state.brokerController=null;state.brokerTicket=null;state.brokerTurnId=null;state.brokerRequest=null;state.brokerSavedAt=null;state.brokerOptions=[];state.brokerSequence=0;state.journal=[];state.turnLog=null;$('broker-panel').hidden=true;
 simRand=seeded((seed^0x9e3779b9)>>>0);visualRand=seeded((seed^0x7f4a7c15)>>>0);state.seed=seed;state.matchId=newMatchId();state.simDraws=0;state.map=map;state.difficulty=clamp(Number(difficulty)||0,0,2);state.musicStep=0;state.musicNextTime=0;state.terrain=createTerrain(map,seed);buildTerrain();state.worms=[];state.projectiles=[];state.particles=[];state.blasts=[];state.decor=[];state.team=0;state.active=null;state.lastActiveId=[0,-1];state.phase='ready';state.timer=rules.turnTime;state.round=1;state.waterLevel=WATER;state.ended=false;state.running=true;state.used=false;state.shotgunLeft=0;state.grenadeFuse=3;state.grenadeBounce='high';state.strikeDir=1;state.playerGrenadeFuse=3;state.playerGrenadeBounce='high';state.playerStrikeDir=1;state.jetDropped=false;state.selected='bazooka';state.playerWeapon='bazooka';state.airTarget=null;state.aim=-.72;state.dir=1;state.power=.5;state.charging=false;state.keys={};state.aiTimer=0;state.resolveTimer=0;state.jetTime=0;state.jetPulse=0;state.shake=0;state.wind=(simRandom()-.5)*rules.windStart*2;state.crateHeal=rules.crateHeal;state.suddenDeathRound=rules.suddenDeathRound;state.windTarget=state.wind;state.aiMoves=0;state.aiTarget=0;state.aiMoveTime=0;state.aiRetreat=0;
 // Random level spots across the big map; teams alternate along it so rivals start within range.
 const spots=spawnSpots(state.terrain,seed);
 for(let team=0;team<2;team++)for(let i=0;i<3;i++){const s=spots[i*2+team]??{x:400+(i*2+team)*500,y:groundY(state.terrain,400+(i*2+team)*500)-R-2};let x=s.x,y=s.y;state.worms.push({id:team*3+i,team,name:names[team][i],x,y,vx:0,vy:0,hp:100,alive:true,face:team? -1:1,grounded:true,flash:0,active:false});}
 for(let i=0;i<42;i++)state.decor.push({x:visualRand()*W,y:visualRand()*H*.55,r:visualRand()*3+1,phase:visualRand()*6.28});
 // Bigger maps get proportionally more mines and barrels.
 const area=W*H/(3600*1400);state.props=placeProps(state.terrain,state.worms,seed,{...scheme,mines:Math.round(scheme.mines*area),barrels:Math.round(scheme.barrels*area)});state.billboards=placeBillboards(state.terrain,seed,rules.sponsors,state.worms);state.crateSponsor=pickSponsors(rules.sponsors,'crate',1,seeded((seed^0x3c6ef372)>>>0))[0]||null;state.battleAds=placeBattleAds(state.terrain,seed,rules.sponsors,state.worms,state.billboards.map(b=>b.x));state.stats=newStats();state.calm=0;state.settleWait=0;state.camHoldId=null;music.next();music.setMood('battle');state.active=state.worms[0];state.active.active=true;state.turnLog=openTurn(state);state.cam={x:0,y:0,zoom:1,tz:1,free:false,auto:true};state.camTargetId=null;state.ammo=[{teleport:rules.teleports},{teleport:rules.teleports}];centerCamera();updateUI();say('YOUR TURN · TAKE AIM',2.5);
}
function living(team){return state.worms.filter(w=>w.team===team&&w.alive)}
function beginTurn(team){
 if(state.ended)return;state.brokerController?.abort();state.brokerController=null;state.brokerTicket=null;state.brokerTurnId=null;state.brokerRequest=null;state.brokerSavedAt=null;state.brokerOptions=[];clearPendingTurn();$('broker-panel').hidden=true;state.team=team;state.timer=rules.turnTime;state.phase='ready';state.used=false;state.shotgunLeft=0;state.jetDropped=false;state.charging=false;state.jetTime=0;state.aiMoves=0;state.aiMoveTime=0;state.aiRetreat=0;state.airTarget=null;if(isHuman(team)){state.selected=state.playerWeapon;state.grenadeFuse=state.playerGrenadeFuse;state.grenadeBounce=state.playerGrenadeBounce;state.strikeDir=state.playerStrikeDir}state.windTarget=clamp(state.wind+(simRandom()-.5)*rules.windDrift*2,-rules.windCap,rules.windCap);
 state.worms.forEach(w=>w.active=false);
 const alive=living(team);if(!alive.length){finish(1-team);return}
 // Bots: the local algorithm always plays its sharpest profile; Broker levels name themselves in the prompt.
 if(state.controllers&&isBot(team))state.difficulty=ctrl(team)==='hard'?1:2;
 const prior=state.lastActiveId[team];state.active=alive.find(w=>w.id>prior)||alive[0];state.active.active=true;state.lastActiveId[team]=state.active.id;state.dir=team? -1:1;state.aim=-.78;state.power=.55;state.turnLog=openTurn(state);
 updateUI();say(isBot(team)?thinkingText():(isBot(1-team)?'YOUR TURN · TAKE AIM':TEAM_NAMES[team]+' · YOUR TURN'),1.8,TEAM_COLORS[team]);voice(state.active,'turn');
 // The Broker model needs several seconds, so its request leaves the moment the AI turn starts.
 state.aiTimer=team?(usesBroker(state.team)?0:1.1):0;pickTarget(null);state.rope=null;state.aiRope=null;state.aiUtilityUsed=false;state.aiFollowUp=false;if(scheme.crateChance>0&&simRandom()<scheme.crateChance&&dropCrate(state,simRandom))say('HEALTH CRATE INCOMING!',1.4);
}
function finish(winner){clearPendingTurn();state.brokerController?.abort();state.brokerController=null;$('broker-panel').hidden=true;state.ended=true;state.running=false;state.phase='ended';state.musicNextTime=0;// Results read from the human's side; a bot-vs-bot match and a two-player match just name the winner.
 const solo=isHuman(0)!==isHuman(1),humanWon=solo&&winner!==2&&isHuman(winner),loser=TEAM_TITLES[1-winner];
 $('result-caption').textContent=winner===2?'THE ISLAND CLAIMS EVERYONE':TEAM_NAMES[winner]+' WIN';$('result-title').textContent=winner===2?'DRAW':!solo?TEAM_NAMES[winner]+'!':humanWon?'VICTORY!':'DEFEAT';$('result-text').textContent=winner===2?'Both teams went under. Try another island!':solo&&!humanWon?`The ${TEAM_TITLES[winner]} took this island. Try another tactic!`:`The ${loser} have been sent packing. The island is theirs!`;$('result-stats').innerHTML=resultStats(winner);$('result').classList.toggle('team-sky',winner===0);$('result').classList.toggle('team-dirt',winner===1);$('result').classList.add('open');music.setMood(winner!==2&&(isHuman(winner)||isBot(1-winner)&&isBot(winner))?'victory':'defeat');$('rematch').focus?.();tone(winner?180:600,.5,'sine',.1,winner?80:900);// The closing line speaks for the human side: cheers when a human team wins, "game over" when the bots win.
 const champ=state.worms.find(w=>w.alive&&w.team===winner);if(winner===2)voice(state.worms[0],'tie');else if(isBot(winner)&&isHuman(1-winner))voice({team:1-winner,id:0},'die');else if(champ&&isHuman(winner))voice(champ,'win')}// the win clips address a player ("you win"); a bot-vs-bot match ends on the fanfare alone
function nextTurn(){if(state.ended)return;if(!state.sim&&state.turnLog){closeTurn(state.turnLog,state,state.journal??=[]);state.turnLog=null}const p=living(0).length,e=living(1).length;if(!p||!e){finish(!p&&!e?2:p?0:1);return}if(isBot(state.team)){state.round++;if(state.round>=rules.suddenDeathRound){state.waterLevel=Math.max(270,WATER-(state.round-rules.suddenDeathRound+1)*rules.waterRise);music.setMood('tense');say('SUDDEN DEATH · WATER RISING!',1.7)}}beginTurn(1-state.team)}
function cycle(){if(!state.running||!isHuman(state.team)||state.used||state.shotgunLeft||state.phase!=='ready')return;const a=living(state.team),idx=a.indexOf(state.active);state.active.active=false;state.active=a[(idx+1)%a.length];state.active.active=true;state.lastActiveId[0]=state.active.id;updateUI();tone(450,.05)}
function endTurn(){if(!state.running||!isHuman(state.team)||state.phase==='resolving')return;state.used=true;state.phase='resolving';state.resolveTimer=.5;state.charging=false;say('TURN PASSED',.8)}
function emit(x,y,color,count=18,speed=180){if(state.sim)return;for(let i=0;i<count;i++){const a=visualRand()*Math.PI*2,v=speed*(.25+visualRand()*.9);state.particles.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-50,life:.35+visualRand()*.6,max:1,r:1.5+visualRand()*5,color});}}
function addBlast(x,y,r){if(state.sim)return;state.blasts.push(makeBlast(x,y,r,visualRand));const th=themes[state.map];emit(x,y,th.dirt,26,330);emit(x,y,th.light,16,260);emit(x,y,th.dark,12,200)}
// Match statistics for the results screen. A kill goes to whoever hit the worm last, so a knock into the
// water or a fatal fall still counts for the attacker.
function newStats(){return {start:Date.now(),teams:[0,1].map(()=>({dmg:0,kills:0,shots:0,lost:0,drowned:0,friendly:0})),worms:{},best:null}}
function record(w,amount,sourceId){
 if(!state.stats||!(amount>0))return;const src=state.worms.find(x=>x.id===sourceId);if(!src)return;
 w.lastHitBy=src.id;const t=state.stats.teams[src.team];
 if(src.team===w.team){t.friendly+=amount;return}
 t.dmg+=amount;const ws=state.stats.worms[src.id]??={dmg:0,kills:0};ws.dmg+=amount;
 if(!state.stats.best||amount>state.stats.best.amount)state.stats.best={amount,by:src.name,team:src.team,on:w.name};
}
function recordDeath(w,drowned){
 const s=state.stats;if(!s)return;s.teams[w.team].lost++;if(drowned)s.teams[w.team].drowned++;
 const by=state.worms.find(x=>x.id===w.lastHitBy);if(by&&by.team!==w.team){s.teams[by.team].kills++;(s.worms[by.id]??={dmg:0,kills:0}).kills++}
}
function resultStats(winner){
 const s=state.stats;if(!s)return '';const e=v=>String(v).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
 const card=t=>`<div class="rt ${t?'dirt':'sky'} ${winner===2?'draw':winner===t?'won':'lost'}"><b>${TEAM_NAMES[t]}</b><span>${winner===2?'DRAW':winner===t?'WINNER':'DEFEATED'}</span><small>${e(CONTROLLER_LABELS[ctrl(t)]||'')} · ${living(t).length} left</small></div>`;
 const rows=[['Damage dealt','dmg'],['Kills','kills'],['Shots','shots'],['Worms lost','lost'],['Drowned','drowned'],['Friendly fire','friendly']];
 const best=Object.entries(s.worms).map(([id,v])=>({w:state.worms.find(x=>x.id===Number(id)),...v})).filter(x=>x.w).sort((a,b)=>b.kills*60+b.dmg-(a.kills*60+a.dmg))[0];
 const secs=Math.round((Date.now()-s.start)/1000);
 return `<div class="result-teams">${card(0)}<i>VS</i>${card(1)}</div>`+
  `<table class="result-stats"><tr><th></th><th class="sky">SKY</th><th class="dirt">DIRT</th></tr>${rows.map(([label,k])=>`<tr><td>${label}</td><td>${Math.round(s.teams[0][k])}</td><td>${Math.round(s.teams[1][k])}</td></tr>`).join('')}</table>`+
  `<p class="result-meta">${best?`MVP <b class="${best.w.team?'dirt':'sky'}">${e(best.w.name)}</b> · ${Math.round(best.dmg)} dmg, ${best.kills} kill${best.kills===1?'':'s'} · `:''}${s.best?`Best hit ${Math.round(s.best.amount)} by ${e(s.best.by)} on ${e(s.best.on)} · `:''}${state.round} rounds · ${Math.floor(secs/60)}:${String(secs%60).padStart(2,'0')}</p>`;
}
// Banner shown while a bot thinks: the worm, its team and level, in the team colour.
function thinkingText(seconds){const w=state.active;return `${w?w.name.toUpperCase()+' · ':''}${TEAM_NAMES[state.team]} · ${CONTROLLER_LABELS[ctrl(state.team)]||'AI'} IS THINKING${seconds==null?'...':' · '+seconds+'s'}`}
function explosion(x,y,r,damage,source){state.shake=Math.max(state.shake,13);addBlast(x,y,r);tone(95,.36,'sawtooth',.13,38);noise(.34,.11,750);emit(x,y,'#ffdd82',42,310);emit(x,y,'#634957',22,230);blastProps(state,x,y,r,damage);carve(state.terrain,x,y,r*.78);buildTerrain({x0:Math.floor(x-r-6),x1:Math.ceil(x+r+6),y0:Math.floor(y-r-6)});
 for(const w of state.worms){if(!w.alive)continue;const d=Math.hypot(w.x-x,w.y-y);const hurt=blastDamage(d,r,damage);if(hurt){{const before=w.hp;w.hp=Math.max(0,w.hp-hurt);record(w,before-w.hp,source)}w.flash=.7;wormCry();const push=(1-d/r)*400;w.vx+=(w.x-x)/(d||1)*push;w.vy-=Math.max(130,push*.7);w.grounded=false;emit(w.x,w.y,w.team?'#ff9980':'#8ef9e4',8,110);if(w.hp)voice(w,w.hp<35?'medic':'hurt');if(!w.hp)kill(w);}}
 for(const p of state.projectiles){if(p.dead||(p.type!=='grenade'&&p.type!=='dynamite'))continue;const d=Math.hypot(p.x-x,p.y-y);if(d<r*1.3){const push=(1-d/(r*1.3))*520;p.vx+=(p.x-x)/(d||1)*push;p.vy+=(p.y-y)/(d||1)*push-120;p.resting=false}}
 updateUI();if(state.phase==='retreat')state.phase='resolving';if(state.phase==='resolving')state.resolveTimer=Math.max(state.resolveTimer,1.3);
}
function kill(w){if(!w.alive)return;const drowned=wormDrowned(w,state.waterLevel);recordDeath(w,drowned);voice(w,drowned?'water':'die');const killer=state.active;if(!state.sim&&killer?.alive&&killer.team!==w.team)setTimeout?.(()=>voice(killer,'kill'),1100);w.alive=false;w.active=false;emit(w.x,w.y,'#fff8d1',28,220);tone(230,.22,'square',.05,80);chirp();say(w.name.toUpperCase()+' IS OUT!',1.3);if((state.active===w&&state.phase==='ready')||living(w.team).length===0){state.phase='resolving';state.resolveTimer=1.5}updateUI()}
// Hooks the map props call back into: blasts, heals, mine beeps and splashes.
const propApi={explode:(x,y,r,d)=>explosion(x,y,r,d,-1),heal:(w,a)=>{w.hp+=a;w.flash=0;emit(w.x,w.y-10,'#7dffa8',14,120);tone(880,.12,'sine',.05,1320);say(`${w.name.toUpperCase()} +${a} HP`,1.2);updateUI()},beep:()=>tone(1150,.06,'square',.035),splash:(x,y)=>emit(x,y,'#d6f5ff',12,100)};
// A worm still flying, falling, sinking or skidding after a hit.
const wormMoving=w=>w.alive&&(!w.grounded||w.sliding&&Math.abs(w.vx)>18);
// After a shot the turn waits until nothing moves: no ordnance in flight, no prop rolling or ticking, no worm
// flying, skidding or sinking; then a short beat so the aftermath is seen. A body that never quite settles
// cannot hold the match: past SETTLE_CAP seconds of waiting the turn hands over anyway.
const SETTLE_PAUSE=.6,SETTLE_CAP=8;
function settled(dt){
 const busy=state.projectiles.length>0||propsBusy(state)||state.worms.some(wormMoving);
 state.calm=busy?0:(state.calm||0)+dt;
 if(state.resolveTimer>0)return false;state.settleWait=(state.settleWait||0)+dt;
 if(state.projectiles.length)return false;
 return state.calm>0&&(state.sim||state.calm>=SETTLE_PAUSE-1e-9)||state.settleWait>=SETTLE_CAP;
}
function startResolution(wait=1){if(state.rope&&state.active){releaseRope(state.active,state.rope);state.active.grounded=false}state.rope=null;state.shotgunLeft=0;state.phase='resolving';state.resolveTimer=wait;state.used=true;state.charging=false}
function setGrenadeFuse(value){if(!state.running||!isHuman(state.team)||state.phase!=='ready'||state.selected!=='grenade')return;state.grenadeFuse=clamp(Number(value)||3,1,5);state.playerGrenadeFuse=state.grenadeFuse;updateUI();tone(620,.05,'triangle',.025)}
function toggleGrenadeBounce(){if(!state.running||!isHuman(state.team)||state.phase!=='ready'||state.selected!=='grenade')return;state.grenadeBounce=state.grenadeBounce==='high'?'low':'high';state.playerGrenadeBounce=state.grenadeBounce;updateUI();tone(540,.07,'triangle',.025)}
function toggleStrikeDirection(){if(!state.running||!isHuman(state.team)||state.phase!=='ready'||state.selected!=='airstrike')return;state.strikeDir*=-1;state.playerStrikeDir=state.strikeDir;updateUI();tone(460,.07,'triangle',.025)}
function dropDynamite(){if(!state.running||state.phase!=='jetpack'||state.jetDropped||!state.active?.alive)return false;const w=state.active;state.projectiles.push({type:'dynamite',x:w.x,y:w.y+R+3,vx:w.vx*.25,vy:w.vy,fuse:3,r:9,bounces:0,bounceFactor:.48,source:w.id,trail:[]});state.jetDropped=true;weaponSound('dynamite');say('DYNAMITE DROPPED!',1);updateUI();return true}
function aimVector(){return {x:Math.cos(state.aim)*state.dir,y:Math.sin(state.aim)}}
function fire(power=state.power){if(!state.running||state.phase!=='ready'||!state.active?.alive)return;const w=state.active,weapon=state.selected,v=aimVector();state.charging=false;if(!state.sim)noteAction(state.turnLog,state,weapon,power);followAgain();if(state.stats&&!['jetpack','rope','teleport'].includes(weapon)&&!(weapon==='shotgun'&&state.shotgunLeft===1))state.stats.teams[w.team].shots++;weaponSound(weapon);if(!['jetpack','rope','teleport'].includes(weapon)&&!state.shotgunLeft)voice(w,weapon==='bazooka'||weapon==='shotgun'?weapon:'fire');if(weapon==='airstrike'){const foe=living(1-w.team)[0];if(foe&&!state.sim)setTimeout?.(()=>voice(foe,'incoming'),700)}if(weapon==='shotgun')noise(.18,.065,2300);else if(weapon==='bazooka')noise(.1,.035,1400);
 if(weapon==='rope'){
  // Space or click fires the hook along the aim; again while hooked lets go and keeps the momentum.
  if(state.rope){releaseRope(w,state.rope);state.rope=null;w.grounded=false;tone(520,.06,'triangle',.03);return}
  const v=aimVector();state.rope=fireRope(state.terrain,w,v.x,v.y);tone(900,.08,'square',.03,400);say('ROPE · A/D SWING · W/S REEL · SPACE LET GO',1.6);return}
 if(state.rope){releaseRope(w,state.rope);state.rope=null;w.grounded=false}
 if(weapon==='teleport'){
  // Utility: does not end the turn, two per team per match, only into open air above the water.
  const tx=state.airTarget,ty=state.airTargetY,ammo=state.ammo?.[w.team];
  if(tx==null){say('CLICK WHERE TO TELEPORT',1.2);return}
  if(!ammo?.teleport){say('NO TELEPORTS LEFT',1.2);state.airTarget=null;return}
  if(!wormFits(state.terrain,tx,ty)||ty>state.waterLevel-40||ty<R){say("CAN'T TELEPORT THERE",1.1);tone(200,.12,'square',.04);state.airTarget=null;return}
  ammo.teleport--;emit(w.x,w.y,'#c9a2ff',26,170);w.x=tx;w.y=ty;w.vx=0;w.vy=0;w.grounded=false;w.sliding=false;emit(tx,ty,'#c9a2ff',26,170);
  tone(300,.25,'sine',.05,1400);say(ammo.teleport?'TELEPORTED!':'TELEPORTED · LAST ONE',1.1);state.airTarget=null;state.selected=state.playerWeapon='bazooka';updateUI();return}
 if(weapon==='jetpack'){state.phase='jetpack';state.used=true;state.jetTime=4;if(isBot(state.team))w.jetUsed=true;say('JETPACK · STEER TO FLY',1.4);tone(480,.2,'sawtooth',.04,170);updateUI();return}
 if(weapon==='punch'){let hit=false;for(const target of state.worms){if(!target.alive||target.team===w.team)continue;const dx=target.x-w.x,dy=target.y-w.y;if(Math.abs(dx)<65&&Math.abs(dy)<48&&Math.sign(dx)===state.dir){{const before=target.hp;target.hp=Math.max(0,target.hp-data.punch.damage);record(target,before-target.hp,w.id)}target.vx=state.dir*350;target.vy=-250;target.grounded=false;target.flash=.7;wormCry();voice(target,'hurt');emit(target.x,target.y,'#ffda8d',18,170);if(!target.hp)kill(target);hit=true;break}}carve(state.terrain,w.x+state.dir*39,w.y-3,24);buildTerrain();say(hit?'WHAM!':'SWUNG AND MISSED!',1.3);if(!hit)voice(w,'miss');tone(hit?190:350,.12,'square',.08);startResolution(1.3);updateUI();return}
 if(weapon==='shotgun'){if(!state.shotgunLeft)state.shotgunLeft=2;let hits=0;const chips=[];for(let i=0;i<5;i++){const a=state.aim+(simRandom()-.5)*.24,dir={x:Math.cos(a)*state.dir,y:Math.sin(a)},origin={x:w.x+dir.x*22,y:w.y-7+dir.y*22};for(let dist=0;dist<450;dist+=5){const x=origin.x+dir.x*dist,y=origin.y+dir.y*dist;if(x<0||x>=W||y<0||y>=H)break;if(solid(state.terrain,x,y)){chips.push([x,y]);break}let done=false;for(const target of state.worms){if(!target.alive||target===w)continue;if(Math.hypot(x-target.x,y-target.y)<R){{const before=target.hp;target.hp=Math.max(0,target.hp-5);record(target,before-target.hp,w.id)}target.vx+=dir.x*32;target.vy-=24;target.flash=.6;hits++;if(!target.hp)kill(target);done=true;break}}if(done)break;}state.particles.push({x:origin.x,y:origin.y,vx:dir.x*340,vy:dir.y*340,life:.15,max:.15,r:2,color:'#fff3c9'});}for(const [x,y]of chips)carve(state.terrain,x,y,3);if(chips.length)buildTerrain();emit(w.x+v.x*25,w.y-7+v.y*25,'#ffda80',17,100);tone(180,.23,'sawtooth',.09,55);const result=hits?`${hits*5} DAMAGE`:'MISSED';if(!hits)voice(w,'miss');if(hits)wormCry();state.shotgunLeft--;if(state.shotgunLeft){say(`SHOTGUN · ${result} · SECOND SHOT!`,1.2);state.aiTimer=.4}else{say(`SHOTGUN · ${result}`,1.2);startResolution(1.2)}updateUI();return}
 if(weapon==='dynamite'){state.projectiles.push({type:'dynamite',x:w.x+state.dir*22,y:w.y-4,vx:0,vy:0,fuse:3,r:9,bounces:0,source:w.id,trail:[]});say('DYNAMITE · TAKE COVER!',1.6);tone(280,.1);state.phase='retreat';state.used=true;state.resolveTimer=3.6;state.aiRetreat=-state.dir;updateUI();return}
 if(weapon==='airstrike'){let tx=state.airTarget??clamp(w.x+state.dir*320,80,W-80);tx=clamp(tx,75,W-75);for(let i=0;i<5;i++)state.projectiles.push({type:'airstrike',x:clamp(tx-state.strikeDir*130+(i-2)*35,5,W-5),y:-170-i*90,vx:state.strikeDir*160,vy:370,fuse:6+i*.2,r:6,source:w.id,trail:[]});say('INCOMING AIRSTRIKE!',1.5);tone(600,.3,'sawtooth',.05,180);startResolution(4.3);updateUI();return}
 const speed=(weapon==='grenade'?300:370)+(weapon==='grenade'?280:390)*power;
 state.projectiles.push({type:weapon,x:w.x+v.x*24,y:w.y-9+v.y*22,vx:v.x*speed,vy:v.y*speed,fuse:weapon==='grenade'?state.grenadeFuse:7,bounceFactor:weapon==='grenade'?(state.grenadeBounce==='high'?.55:.32):.48,r:weapon==='grenade'?8:6,source:w.id,trail:[]});emit(w.x+v.x*30,w.y-8+v.y*20,'#fff6bb',9,70);tone(weapon==='grenade'?330:130,.15,'sawtooth',.08,80);say(weapon==='grenade'?'GRENADE AWAY!':'ROCKET AWAY!',1);startResolution(weapon==='grenade'?state.grenadeFuse+.7:1.8);updateUI();
}
function safeWalk(a,b){const dir=Math.sign(b-a),t=state.terrain;if(!dir)return true;let prior=groundY(t,a);for(let x=a+dir*18;dir>0?x<=b:x>=b;x+=dir*18){const y=groundY(t,x);// Climbs must stay within what crawl() can manage; drops can be steeper.
 if(y>state.waterLevel-40||prior-y>30||y-prior>50)return false;prior=y}return groundY(t,b)<state.waterLevel-40}
function aiAct(){if(!state.running||!isBot(state.team)||state.phase!=='ready')return;
 // Mid-utility (on the rope, still flying after a teleport or rope) the AI waits before acting again.
 if(state.rope||!state.active?.grounded){state.aiTimer=.3;return}
 if(usesBroker(state.team)&&!state.aiFollowUp){requestBrokerTurn();return}const profile=AI_PROFILES[state.difficulty]??AI_PROFILES[1];const w=state.active,foes=living(1-w.team),friends=living(w.team),near=foes.reduce((a,b)=>Math.abs(a.x-w.x)<Math.abs(b.x-w.x)?a:b),dx=near.x-w.x,dy=near.y-w.y-7,dist=Math.hypot(dx,dy);
 // PC Easy plays every legal move in the sandbox first and makes the one with the best real outcome.
 if(!state.shotgunLeft&&state.controllers&&ctrl(state.team)==='easy'){const best=rankOptions(brokerTurnOptions(state).filter(o=>!o.action.utility))[0];if(best?.sim&&best.sim.value>=15){applyAction(best.action);return}}
 if(state.shotgunLeft){const target=foes.reduce((a,b)=>Math.abs(a.x-w.x)<Math.abs(b.x-w.x)?a:b);state.selected='shotgun';state.dir=Math.sign(target.x-w.x)||1;state.aim=aimAngle(target.x-w.x,target.y-w.y-7);w.face=state.dir;fire();return}
 if(Math.abs(dx)<58&&Math.abs(dy)<48){state.selected='punch';state.dir=Math.sign(dx)||1;fire();return}
 if(state.aiMoves===0&&!w.jetUsed&&groundY(state.terrain,w.x)>state.waterLevel-70){const candidates=[240,-240,340,-340].map(d=>clamp(w.x+d,65,W-65)),landing=candidates.find(x=>groundY(state.terrain,x)<state.waterLevel-105&&friends.every(f=>f===w||Math.abs(f.x-x)>40));if(landing){state.selected='jetpack';state.aiTarget=landing;state.aiMoves++;fire();return}}
 if(state.difficulty>0&&dist>58&&dist<112&&Math.abs(dy)<60&&w.hp>55&&w.x>220&&w.x<W-220&&safeWalk(w.x,w.x-Math.sign(dx)*190)&&friends.every(f=>f===w||Math.abs(f.x-w.x)>140)){state.selected='dynamite';state.dir=Math.sign(dx);state.aiTarget=w.x-state.dir*190;fire();return}
 if(dist<profile.shotgunRange&&Math.abs(dy)<85){let clear=true;for(let d=25;d<dist-20;d+=7){if(solid(state.terrain,w.x+dx*d/dist,w.y-7+dy*d/dist)){clear=false;break}}if(clear){state.selected='shotgun';state.dir=Math.sign(dx)||1;state.aim=aimAngle(dx,dy)+(simRandom()-.5)*profile.aimError;w.face=state.dir;fire();return}}
 const shot=selectShot(state.terrain,w,foes,friends,state.wind,state.difficulty,state.waterLevel);
 // Healing first: a hurt worm walks or teleports to a nearby health crate before it shoots.
 if(!state.aiUtilityUsed&&state.difficulty>0){const crate=planCrate(state);if(crate&&startAiUtility({kind:crate.how==='walk'?'crate-walk':'crate-teleport',...crate}))return}
 if(profile.reposition&&state.aiMoves<1&&state.timer>7&&(shot?.score??0)<38){let best=null;for(const offset of [-180,-120,120,180]){const x=w.x+offset;if(x<65||x>W-65||!safeWalk(w.x,x))continue;const probe={x,y:groundY(state.terrain,x)-R-2};if(friends.some(f=>f!==w&&Math.abs(f.x-x)<35))continue;const plan=selectShot(state.terrain,probe,foes,friends.filter(f=>f!==w).concat(probe),state.wind,state.difficulty,state.waterLevel);if(plan&&(!best||plan.score>best.score))best={x,score:plan.score}}
  if(best&&best.score>(shot?.score??0)+12){state.aiTarget=best.x;state.aiMoveTime=Math.min(2.2,Math.abs(best.x-w.x)/145+.35);state.aiMoves++;state.phase='reposition';say('DIRT DEVILS REPOSITION...',1.2);return}
  if(!w.jetUsed&&(shot?.score??0)<17&&dist>450){const dir=Math.sign(dx),candidates=[260,360,180].map(d=>clamp(w.x+dir*d,65,W-65)),landing=candidates.find(x=>groundY(state.terrain,x)<state.waterLevel-55&&!safeWalk(w.x,x));if(landing){state.selected='jetpack';state.aiTarget=landing;state.aiMoves++;fire();return}}
 }
 const lob=dist<650?selectLob(state.terrain,w,foes,friends,state.wind,state.difficulty,state.waterLevel):null;
 const useLob=state.difficulty>0&&lob&&lob.score>profile.grenadeThreshold&&lob.score>(shot?.score??0)-(state.difficulty===2?8:3);
 if(useLob||shot&&shot.score>=12){const pick=useLob?lob:shot;state.selected=useLob?'grenade':'bazooka';if(useLob){state.grenadeFuse=3;state.grenadeBounce='high'}state.dir=pick.dir;state.aim=clamp(pick.angle*Math.PI/180+(simRandom()-.5)*profile.aimError,AIM_MIN,AIM_MAX);state.power=clamp(pick.power+(simRandom()-.5)*profile.aimError,.35,1);w.face=state.dir;updateUI();fire();return}
 // No usable shot even after walking: spend a teleport or take the rope when that sets up a strong shot.
 if(!state.aiUtilityUsed&&state.difficulty>0){const u=pickUtility(Math.max(shot?.score??0,lob?.score??0),near);if(u&&(u.kind!=='teleport'||u.score>=45)&&startAiUtility(u))return}
 state.selected='airstrike';const target=foes.reduce((a,b)=>state.difficulty===0?Math.abs(a.x-w.x)<Math.abs(b.x-w.x)?a:b:a.hp<b.hp?a:b);state.strikeDir=target.x>w.x?1:-1;state.airTarget=clamp(target.x-state.strikeDir*(state.difficulty===2?48:25)+(simRandom()-.5)*profile.airError,75,W-75);fire();
}
// Utilities for the AI: heal at a crate when hurt; when no decent shot exists, teleport or rope to a better spot.
// The move keeps the turn, and the AI shoots afterwards from where it ends up.
function pickUtility(baseScore,target){
 if(baseScore>=25)return null;
 const tp=planTeleport(state,{baseScore});if(tp)return {kind:'teleport',...tp};
 const rope=planRope(state,{target});if(rope)return {kind:'rope',...rope};
 return null;
}
function startAiUtility(u){
 const w=state.active;state.aiUtilityUsed=true;
 if(u.kind==='teleport'||u.kind==='crate-teleport'){state.selected='teleport';state.airTarget=u.x;state.airTargetY=u.y;fire();state.aiTimer=.7;return state.active.x===u.x}
 if(u.kind==='crate-walk'){state.aiTarget=u.x;state.aiMoveTime=Math.min(5,Math.abs(u.x-w.x)/90+.6);state.phase='reposition';say('DIRT DEVILS GO FOR THE CRATE',1.2);return true}
 if(u.kind==='rope'){state.selected='rope';state.dir=Math.sign(u.dirX)||1;state.aim=clamp(Math.atan2(u.dirY,Math.abs(u.dirX)),AIM_MIN,AIM_MAX);w.face=state.dir;fire();if(!state.rope)return false;state.aiRope={plan:u,t:0};say('DIRT DEVILS TAKE THE ROPE',1.2);return true}
 return false;
}
function brokerFailure(message){state.phase='broker-error';state.brokerError=message;$('broker-error').textContent=message;$('broker-panel').hidden=false;say('BROKER LLM UNAVAILABLE',3);updateUI()}
// ---- AI sandbox: play a candidate move on a throwaway copy of the match with the full game physics (flight,
// blast, knockback, water, falls, chained props) and read the exact outcome. Nothing visible or audible
// happens (state.sim mutes effects, UI, terrain repaint and camera) and the match is restored bit for bit,
// including the simulation random stream.
function applyAction(a){
 state.phase='ready';state.selected=a.weapon;if(a.dir)state.dir=a.dir;if(Number.isFinite(a.aim))state.aim=clamp(a.aim,AIM_MIN,AIM_MAX);if(Number.isFinite(a.power))state.power=clamp(a.power,.18,1);
 if(a.fuse)state.grenadeFuse=a.fuse;if(a.bounce)state.grenadeBounce=a.bounce;if(a.strikeDir)state.strikeDir=a.strikeDir;
 if(Number.isFinite(a.targetX)){state.aiTarget=a.targetX;if(a.weapon==='airstrike')state.airTarget=a.targetX}
 if(state.active)state.active.face=state.dir;fire();
}
let simMask=null;
function simulateAction(a,{maxSeconds=9}={}){
 const t=state.terrain;if(simMask?.length!==t.mask.length)simMask=new Uint8Array(t.mask.length);simMask.set(t.mask);const mask=simMask,top=t.top.slice(),snap={...state};
 const worms=state.worms.map(w=>({...w})),props=state.props.map(p=>({...p})),propList=state.props.slice();
 // Arrays the move pushes into (fire() adds to state.projectiles in place) are restored from copies.
 const deep={stats:state.stats&&structuredClone(state.stats),ammo:state.ammo&&structuredClone(state.ammo),cam:state.cam&&{...state.cam},keys:{...state.keys},projectiles:state.projectiles.slice(),particles:state.particles.slice(),blasts:state.blasts.slice()};
 const before=state.worms.map(w=>({id:w.id,team:w.team,name:w.name,hp:w.hp,alive:w.alive}));
 let after;
 try{
  state.sim=true;state.simDone=false;state.particles=[];state.blasts=[];
  applyAction(a);
  for(let time=0;time<maxSeconds&&!state.simDone&&state.running;time+=1/30)update(1/30);
  after=state.worms.map(w=>({hp:w.hp,alive:w.alive,drowned:!w.alive&&wormDrowned(w,state.waterLevel)}));
 }finally{
  t.mask.set(mask);t.top.set(top);
  for(const k of Object.keys(state))if(!(k in snap))delete state[k];Object.assign(state,snap);
  state.worms.forEach((w,i)=>{for(const k of Object.keys(w))if(!(k in worms[i]))delete w[k];Object.assign(w,worms[i])});
  propList.forEach((p,i)=>Object.assign(p,props[i]));state.props=propList;
  Object.assign(state,deep);
  simRand=seeded((state.seed^0x9e3779b9)>>>0);for(let i=0;i<(state.simDraws||0);i++)simRand();
 }
 const me=state.active,res={enemyDmg:0,allyDmg:0,kills:[],losses:[],drowned:[],hits:[]};
 before.forEach((b,i)=>{
  const a2=after[i],lost=Math.max(0,b.hp-(a2.alive?a2.hp:0));if(!b.alive||lost<=0)return;
  const foe=b.team!==me.team,died=b.alive&&!a2.alive;
  if(foe){res.enemyDmg+=lost;if(died)res.kills.push(b.name)}else{res.allyDmg+=lost;if(died)res.losses.push(b.id===me.id?'SELF':b.name)}
  if(a2.drowned)res.drowned.push(b.name);
  res.hits.push(`${b.id===me.id?'SELF':(foe?'':'ally ')+b.name} -${Math.round(lost)}${died?(a2.drowned?' DROWNED':' KILL'):''}`);
 });
 res.value=res.enemyDmg+70*res.kills.length-1.3*res.allyDmg-90*res.losses.filter(n=>n!=='SELF').length-(res.losses.includes('SELF')?150:0);
 res.summary=res.hits.length?res.hits.join(', '):'no worm hurt';
 return res;
}
// Simulate every direct move (utility combos keep their planner estimate) and sort best first.
function rankOptions(options){
 for(const o of options)if(!o.action?.utility)o.sim=simulateAction(o.action);
 return options.slice().sort((p,q)=>(q.sim?.value??-1e9)-(p.sim?.value??-1e9));
}
// Broker gets the exact simulated outcome and the rank instead of the quick estimate.
function withSimText(options){
 options.forEach((o,i)=>{if(!o.sim)return;const head=o.description.split(':')[0];const text=`${head} → SIMULATED: ${o.sim.summary} (value ${Math.round(o.sim.value)}, rank ${i+1})`;o.description=text.length>240?text.slice(0,237)+'...':text});
 return options;
}
function applyBrokerChoice(id){const choice=state.brokerOptions.find(o=>o.id===id),a=choice?.action;if(!a||!state.active?.alive||!isBot(state.team)||!usesBroker(state.team))return false;if(state.shotgunLeft&&a.weapon!=='shotgun')return false;
 // A utility combo: move first, then the local AI takes the follow-up shot (no second model call).
 if(a.utility){state.phase='ready';state.brokerTicket=null;state.brokerRequest=null;state.brokerSavedAt=null;state.brokerOptions=[];clearPendingTurn();$('broker-panel').hidden=true;state.aiFollowUp=true;if(!startAiUtility(a.utility))state.aiTimer=.2;return true}
 state.brokerTicket=null;state.brokerRequest=null;state.brokerSavedAt=null;state.brokerOptions=[];clearPendingTurn();$('broker-panel').hidden=true;noteTarget(state.turnLog,targetFromCandidate(id));applyAction(a);return true}
function brokerWait(ms,signal){return new Promise((resolve,reject)=>{if(signal.aborted){reject(Error('aborted'));return}const timer=setTimeout(resolve,ms);signal.addEventListener('abort',()=>{clearTimeout(timer);reject(Error('aborted'))},{once:true})})}
async function requestBrokerTurn(resume=false){
 if(!state.running||!isBot(state.team)||!usesBroker(state.team)||!['ready','broker-error'].includes(state.phase))return;
 if(!resume||!state.brokerRequest){
  state.brokerOptions=withSimText(rankOptions(brokerTurnOptions(state,{windBlind:ctrl(state.team)==='hard'})));
  state.brokerTurnId=`t${state.matchId}_${state.round}_${state.active.id}_${++state.brokerSequence}`;
  // PC GOD is ultra plus the match journal (after the snapshot and candidates, see api/ai/turn.mjs).
  const god=ctrl(state.team)==='god';
  state.brokerRequest={turnId:state.brokerTurnId,difficulty:god?3:state.difficulty,snapshot:brokerSnapshot(state,{windBlind:ctrl(state.team)==='hard'}),candidates:state.brokerOptions.map(({id,description})=>({id,description})),...(god?{history:(state.journal||[]).slice(-JOURNAL_MAX)}:{})};
  state.brokerTicket=null;state.brokerSavedAt=Date.now();
 }
 const turnId=state.brokerTurnId,activeId=state.active.id,controller=new AbortController();
 const current=()=>state.running&&state.active?.id===activeId&&state.brokerTurnId===turnId&&state.phase==='broker-wait';
 state.brokerController=controller;state.phase='broker-wait';state.brokerElapsed=0;$('broker-panel').hidden=true;say(thinkingText(0),20,TEAM_COLORS[state.team]);updateUI();
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
function updateWorm(w,dt){if(!w.alive)return;w.flash=Math.max(0,w.flash-dt);const player=isHuman(state.team)&&state.active===w&&state.running&&(state.phase==='ready'||state.phase==='jetpack'||state.phase==='retreat');const ai=isBot(state.team)&&state.active===w&&['reposition','jetpack','retreat'].includes(state.phase);const aiDir=state.phase==='retreat'?state.aiRetreat:Math.sign(state.aiTarget-w.x);const aiDrive=ai&&Math.abs(state.aiTarget-w.x)>18||ai&&state.phase==='retreat';const aiLeft=aiDrive&&aiDir<0,aiRight=aiDrive&&aiDir>0;const ahead=w.x+aiDir*35,aiCliff=ai&&aiDir!==0&&(groundY(state.terrain,ahead)>state.waterLevel-25||groundY(state.terrain,ahead)-groundY(state.terrain,w.x)>55);const left=player&&(state.keys.left||state.keys.KeyA||state.keys.ArrowLeft)||aiLeft,right=player&&(state.keys.right||state.keys.KeyD||state.keys.ArrowRight)||aiRight,jump=player&&(state.keys.jump||state.keys.KeyW||state.keys.ArrowUp)||aiCliff&&state.phase!=='retreat';
 // Ninja rope: while the hook flies the worm keeps its normal physics; once hooked it swings on the rope.
 if(state.rope&&state.active===w){
  const rp=state.rope,k=state.keys,ai=isBot(state.team)?state.aiRope:null;
  // The AI replays the rope plan it simulated: swing toward the target, maybe reel in, let go on time.
  if(ai){if(rp.state==='attached')ai.t+=dt;const inp=executeRopeInputs(ai.plan,ai.t);if(inp.release||ai.t>4){releaseRope(w,rp);state.rope=null;state.aiRope=null;w.grounded=false;state.aiTimer=Math.max(state.aiTimer,.5)}else stepRope(state.terrain,w,rp,dt,inp)}
  else stepRope(state.terrain,w,rp,dt,{left:!!(k.KeyA||k.ArrowLeft||k.left),right:!!(k.KeyD||k.ArrowRight||k.right),up:!!(k.KeyW||k.ArrowUp||k.jump),down:!!(k.KeyS||k.ArrowDown)});
  if(rp.state==='missed'){state.rope=null;state.aiRope=null;say('ROPE MISSED',.8)}
  else if(rp.state==='attached'){w.grounded=false;w.sliding=false;if(Math.abs(w.vx)>20)w.face=Math.sign(w.vx);if(wormDrowned(w,state.waterLevel)){w.hp=0;kill(w);say(w.name.toUpperCase()+' TOOK A SWIM!',1.4)}return}
 }
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
 if(wormDrowned(w,state.waterLevel)){w.hp=0;kill(w);say(w.name.toUpperCase()+' TOOK A SWIM!',1.4)}
}
// Landing: hard hits bounce once and skid like the original ragdoll; long falls hurt.
function land(w,jet){
 const t=state.terrain;
 // Caught only by a side probe on a corner: shove off it and keep falling instead of hanging.
 // Balanced on a corner over a drop: roll off it. A worm wedged in a crevice (no free side, or many shoves) settles.
 let gap=0;while(gap<8&&!solid(t,w.x,w.y+R+gap))gap++;
 if(gap>=8){const away=solid(t,w.x-7,w.y+R-3)||solid(t,w.x-9,w.y-1)?1:-1,nx=clamp(w.x+away*2,R,W-R);if(wormFits(t,nx,w.y)&&(w.shoves=(w.shoves||0)+1)<40){w.x=nx;w.vx=away*Math.max(40,Math.abs(w.vx)*.5);w.vy=Math.min(w.vy,40);return}}
 w.shoves=0;w.climbDebt=0;const impact=w.vy;
 if(!jet&&impact>560&&state.running){const hurt=Math.min(30,Math.round((impact-560)/8));{const before=w.hp;w.hp=Math.max(0,w.hp-hurt);record(w,before-w.hp,w.lastHitBy)}w.flash=.6;voice(w,'hurt');emit(w.x,w.y+R,themes[state.map].dirt,10,120);if(!w.hp)kill(w);updateUI()}
 if(!jet&&impact>300){w.vy=-impact*.25;w.vx*=.6;return}
 // Settle on a whole pixel touching the ground, so the grounded test agrees next frame.
 w.y=Math.floor(w.y);for(let k=0;k<3&&!wormGrounded(t,w.x,w.y)&&wormFits(t,w.x,w.y+1);k++)w.y++;
 w.vy=0;w.grounded=true;w.sliding=!jet&&Math.abs(w.vx)>60;if(!w.sliding)w.vx=0;
}
function updateProjectile(p,dt){const oldFuse=p.fuse;p.fuse-=dt;if(p.type==='dynamite'&&Math.ceil(oldFuse)>Math.ceil(p.fuse)&&p.fuse>0)tone(920,.07,'square',.035,650);p.trail.push({x:p.x,y:p.y});if(p.trail.length>12)p.trail.shift();if(p.type==='grenade'||p.type==='dynamite'){const body=p.type==='dynamite'?BODIES.dynamite:(p.bounceFactor??.55)<.4?BODIES.grenadeLow:BODIES.grenadeHigh,hit=stepBody(state.terrain,p,dt,{body,water:state.waterLevel}).impact;if(hit>70){p.bounces++;if(p.type==='grenade')tone(650,.055,'triangle',clamp(hit/900,.008,.028),340);else tone(240,.05,'square',.018,160)}if(p.sunk){p.dead=true;emit(p.x,state.waterLevel,'#d6f5ff',15,110);tone(440,.12,'sine',.04);return}}
 else{const sub=4;for(let i=0;i<sub;i++){const d=dt/sub;p.vx+=state.wind*(p.type==='airstrike'?0:.7)*d;p.vy+=GRAVITY*d;p.x+=p.vx*d;p.y+=p.vy*d;
  if(p.x<4||p.x>W-4){p.dead=true;return}
  if(p.y>state.waterLevel){p.dead=true;return}
  if(solid(state.terrain,p.x,p.y+p.r)){p.dead=true;explosion(p.x,p.y,data[p.type].radius,data[p.type].damage,p.source);return}
  if(p.type==='bazooka'){for(const w of state.worms){if(!w.alive||w.id===p.source&&p.fuse>6.8)continue;if(Math.hypot(w.x-p.x,w.y-p.y)<R+p.r){p.dead=true;explosion(p.x,p.y,77,58,p.source);return}}}
 }}
 if(p.fuse<=0){p.dead=true;if(p.type==='grenade'||p.type==='dynamite'){explosion(p.x,p.y,data[p.type].radius,data[p.type].damage,p.source)}else if(p.type==='airstrike'){explosion(p.x,p.y,56,40,p.source)}else if(p.type==='bazooka'){p.dead=true}}
}
function update(dt){if(!state.running)return;if(!state.sim)updateCamera(dt);musicTick();if(isBot(state.team)&&usesBroker(state.team)&&['broker-wait','broker-error'].includes(state.phase)){if(state.phase==='broker-wait'){state.brokerElapsed=(state.brokerElapsed||0)+dt;setText($('message'),thinkingText(Math.floor(state.brokerElapsed)))}updateUI();return}state.wind+=(state.windTarget-state.wind)*dt*.08;state.shake=Math.max(0,state.shake-25*dt);if(state.messageTimer>0){state.messageTimer-=dt;if(state.messageTimer<=0)$('message').textContent=''}
 if(state.phase==='ready'||state.phase==='jetpack'||state.phase==='reposition'){{const before=state.timer;state.timer-=dt;if(before>5&&state.timer<=5&&state.active?.alive)voice(state.active,'hurry')}if(state.timer<=0){state.timer=0;say('TIME IS UP!',1);startResolution(.7)}if(state.phase==='jetpack'){state.jetTime-=dt;state.jetPulse=(state.jetPulse||0)-dt;if(state.jetPulse<=0){noise(.19,.018,1800);state.jetPulse=.44}if(state.jetTime<=0)startResolution(.8)}if(state.phase==='reposition'){state.aiMoveTime-=dt;if(state.aiMoveTime<=0||Math.abs(state.active.x-state.aiTarget)<20){state.phase='ready';state.aiTimer=.25}}}
 if(isBot(state.team)&&state.phase==='ready'&&!state.sim){state.aiTimer-=dt;if(state.aiTimer<=0)aiAct()}
 if(isBot(state.team)&&state.phase==='jetpack'&&!state.jetDropped&&state.active?.alive){const w=state.active;const target=living(1-w.team).find(f=>Math.abs(f.x-w.x)<62&&f.y-w.y>45);if(target&&living(w.team).every(f=>f===w||Math.hypot(f.x-w.x,f.y-w.y)>125))dropDynamite()}
 if(state.charging){state.power+=state.chargeDir*dt*.85;if(state.power>=1){state.power=1;state.chargeDir=-1}else if(state.power<=.18){state.power=.18;state.chargeDir=1}}
 if(isHuman(state.team)&&state.phase==='ready'){if(state.keys.aimleft||state.keys.KeyQ)state.aim=clamp(state.aim-.95*dt,AIM_MIN,AIM_MAX);if(state.keys.aimright||state.keys.KeyE)state.aim=clamp(state.aim+.95*dt,AIM_MIN,AIM_MAX)}
 for(const w of state.worms)updateWorm(w,dt);
 for(const p of state.projectiles)if(!p.dead){updateProjectile(p,dt);if(p.dead&&!state.sim)noteLanding(state.turnLog,p)}state.projectiles=state.projectiles.filter(p=>!p.dead);
 updateProps(state,dt,propApi);
 for(const p of state.particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=350*dt;p.life-=dt}state.particles=state.particles.filter(p=>p.life>0);state.blasts=state.blasts.filter(b=>(b.t+=dt)<1.3);
 if(state.phase==='resolving'||state.phase==='retreat'){state.resolveTimer-=dt;if(settled(dt)){if(state.sim)state.simDone=true;else nextTurn()}}else{state.calm=0;state.settleWait=0;state.camHoldId=null}
 updateUI();
}
// The HUD is refreshed every frame; touch the DOM only when a value really changes (each write invalidates style).
const setText=(el,v)=>{v=String(v);if(el.textContent!==v)el.textContent=v};
const setProp=(el,k,v)=>{if(el[k]!==v)el[k]=v};
const setWidth=(el,v)=>{if(el.__width!==v){el.__width=v;el.style.width=v}};
function updateWeaponSettings(){
 const player=state.running&&isHuman(state.team);
 setProp($('grenade-settings'),'hidden',!(player&&state.phase==='ready'&&state.selected==='grenade'));
 setProp($('airstrike-settings'),'hidden',!(player&&state.phase==='ready'&&state.selected==='airstrike'));
 setProp($('jetpack-settings'),'hidden',!(player&&state.phase==='jetpack'));
 for(const b of document.querySelectorAll('[data-fuse]'))b.classList.toggle('selected',Number(b.dataset.fuse)===state.grenadeFuse);
 setText($('bounce-toggle'),'BOUNCE: '+state.grenadeBounce.toUpperCase());
 setText($('strike-direction'),state.strikeDir>0?'FROM LEFT →':'FROM RIGHT ←');
 setProp($('drop-dynamite'),'disabled',state.jetDropped||!state.active?.alive);
 setText($('drop-dynamite'),state.jetDropped?'DYNAMITE DROPPED':'DROP DYNAMITE · X');
}
function updateUI(){if(state.sim)return;
 // Teleport tile shows the charges left for the team on turn.
 const tpKey=document.querySelector?.('.weapon[data-weapon="teleport"] .key'),tpLeft=state.ammo?.[state.team]?.teleport;if(tpKey&&tpLeft!=null){setText(tpKey,`9 · ${tpLeft} LEFT`);tpKey.parentElement.classList.toggle('empty',!tpLeft)}const p=living(0),e=living(1);setText($('p-count'),`${p.length} WORM${p.length===1?'':'IES'}`);setText($('e-count'),`${e.length} WORM${e.length===1?'':'IES'}`);setWidth($('p-health'),`${p.reduce((s,w)=>s+w.hp,0)/3}%`);setWidth($('e-health'),`${e.reduce((s,w)=>s+w.hp,0)/3}%`);setText($('timer'),Math.ceil(state.timer));setText($('turn-label'),isBot(state.team)?(usesBroker(state.team)&&(state.phase==='broker-wait'||state.phase==='broker-error')?'LLM THINKING':'AI TURN'):(isBot(1-state.team)?'YOUR TURN':TEAM_NAMES[state.team]));setText($('active-name'),state.active?.alive?state.active.name.toUpperCase():'K.O.');setText($('wind'),`WIND · ${Math.abs(Math.round(state.wind))} ${state.wind<0?'←':'→'}`);setWidth($('power'),`${Math.round(state.power*100)}%`);setText($('power-text'),`${Math.round(state.power*100)}%`);setText($('map-name'),`${mapNames[state.map]} · ${W}×${H}`);setText($('round'),`ROUND ${state.round}`);setText($('ai-level'),state.controllers?state.controllers.map(c=>CONTROLLER_LABELS[c]).join(' vs '):AI_PROFILES[state.difficulty].name+(usesBroker(state.team)?' · BROKER LLM':' · LOCAL'));document.querySelectorAll('.weapon').forEach(b=>b.classList.toggle('selected',b.dataset.weapon===state.selected));setProp($('fire'),'disabled',!state.running||!isHuman(state.team)||state.phase!=='ready');setProp($('end-turn'),'disabled',!state.running||!isHuman(state.team)||state.phase==='resolving');updateWeaponSettings()}
let lastFrame=0,frameDt=.016;
function graveY(w){const gy=groundY(state.terrain,w.x);if(w.y>state.waterLevel-6||gy>state.waterLevel-6)return null;if(w.gy==null)w.gy=Math.min(w.y+14,gy);if(w.gy<gy)w.gy=Math.min(gy,w.gy+420*frameDt);return w.gy}
// Sky and far ridges live in screen space and scroll slower than the battlefield (parallax).
// The widest zoom shows the whole map; it depends on the map's size, so it is worked out each time.
const SKY_W=VIEW_W+800,minZoom=()=>Math.max(VIEW_W/W,VIEW_H/H);
function drawSky(now){
 const th=themes[state.map];
 if(!state.bg||state.bg.map!==state.map)state.bg={map:state.map,...bakeBackground(()=>document.createElement('canvas'),state.map,th,SKY_W,VIEW_H)};
 const c=state.cam,span=Math.max(1,W-VIEW_W/c.zoom);
 ctx.save();ctx.translate(-(c.x/span)*(SKY_W-VIEW_W),0);drawBackdrop(ctx,state,state.bg,SKY_W,now,frameDt);ctx.restore();
}
function drawWorldBack(now){const th=themes[state.map];drawAmbient(ctx,state,th,W,H,now,frameDt);drawWater(ctx,state,th,W,H,now,false)}
// Camera: follows the shot in flight, otherwise the active worm. Wheel or Z zooms out to the whole map,
// right-drag looks around freely (the turn clock keeps running), C or the next shot snaps back.
function camFocus(){
 const shot=state.projectiles.find(p=>!p.dead&&p.type!=='airstrike')||state.projectiles.find(p=>!p.dead&&p.y>0);if(shot)return shot;
 // After the shot the camera stays on whoever is still flying, skidding or sinking (the fastest, but it does not
 // hop between worms), then rests on the last of them until the turn hands over.
 if(state.phase==='resolving'||state.phase==='retreat'){
  const held=state.worms.find(w=>w.id===state.camHoldId);if(held&&wormMoving(held))return held;
  let fast=null;for(const w of state.worms)if(wormMoving(w)&&(!fast||Math.hypot(w.vx,w.vy)>Math.hypot(fast.vx,fast.vy)))fast=w;
  if(fast){state.camHoldId=fast.id;return fast}if(held)return held;
 }
 return state.active;
}
function clampCam(c){c.x=clamp(c.x,0,Math.max(0,W-VIEW_W/c.zoom));c.y=clamp(c.y,0,Math.max(0,H-VIEW_H/c.zoom))}
function centerCamera(){const c=state.cam,f=camFocus();if(!c||!f)return;c.x=f.x-VIEW_W/c.zoom/2;c.y=f.y-VIEW_H/c.zoom*.55;clampCam(c)}
function updateCamera(dt){
 const c=state.cam;if(!c)return;
 if(Math.abs(c.tz-c.zoom)>1e-3){const mx=c.x+VIEW_W/c.zoom/2,my=c.y+VIEW_H/c.zoom/2;c.zoom+=(c.tz-c.zoom)*Math.min(1,dt*9);c.x=mx-VIEW_W/c.zoom/2;c.y=my-VIEW_H/c.zoom/2}
 if(!c.free){
  const f=camFocus(),a=state.active,tgt=f===a&&c.auto?frameTarget():null;let cx=f?.x,cy=f?.y,k=Math.min(1,dt*(f===a?4:7));
  if(tgt){
   // Frame the active worm with its target, zooming out as far as needed; past the widest view keep
   // our worm on screen and lean toward the target so its direction and the aim line stay readable.
   const dx=tgt.x-a.x,dy=tgt.y-a.y;c.tz=clamp(Math.min(VIEW_W/(Math.abs(dx)+560),VIEW_H/(Math.abs(dy)+460)),minZoom(),1);
   const vw=VIEW_W/c.zoom;cx=(a.x+tgt.x)/2;cy=(a.y+tgt.y)/2-20;if(Math.abs(dx)+560>vw)cx=a.x+Math.sign(dx)*(vw/2-280);k=Math.min(1,dt*3);
  }
  if(f){c.x+=(cx-VIEW_W/c.zoom/2-c.x)*k;c.y+=(cy-VIEW_H/c.zoom*.55-c.y)*k}
 }
 clampCam(c);
}
function zoomBy(factor){const c=state.cam;if(c){c.auto=false;c.tz=clamp(c.tz*factor,minZoom(),1.25)}}
function followAgain(){if(state.cam){state.cam.free=false}}
// Who the camera frames with the active worm: a picked target (T or an edge arrow), else the nearest rival.
function frameTarget(){
 const a=state.active;if(!a?.alive||!state.running)return null;
 const picked=state.worms.find(w=>w.id===state.camTargetId&&w.alive&&w.team!==a.team);if(picked)return picked;
 let best=null;for(const w of state.worms)if(w.alive&&w.team!==a.team&&(!best||Math.abs(w.x-a.x)<Math.abs(best.x-a.x)))best=w;return best;
}
function pickTarget(w){const c=state.cam;state.camTargetId=w?.id??null;if(c){c.auto=true;c.free=false}}
function cycleTarget(){const a=state.active;if(!a)return;const foes=state.worms.filter(w=>w.alive&&w.team!==a.team).sort((p,q)=>Math.abs(p.x-a.x)-Math.abs(q.x-a.x));if(!foes.length)return;const i=foes.findIndex(w=>w.id===state.camTargetId);pickTarget(foes[(i+1)%foes.length]);say('TARGET · '+foes[(i+1)%foes.length].name.toUpperCase(),.9)}
// The rope: a dark core with a light strand, through every wrap point, and the hook at the end.
function drawRope(){
 const r=state.rope,w=state.active;if(!r||!w?.alive)return;const pts=ropePoints(w,r);if(pts.length<2)return;
 ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
 for(const [col,width] of [['#2b1d14',4],['#d9b77a',1.8]]){ctx.strokeStyle=col;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y-6);for(const p of pts.slice(1))ctx.lineTo(p.x,p.y);ctx.stroke()}
 const e=pts[pts.length-1];ctx.fillStyle='#8796a3';ctx.strokeStyle='#1c1420';ctx.lineWidth=2;ctx.beginPath();ctx.arc(e.x,e.y,4.5,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.restore();
}
// Arrows on the screen edge point at worms outside the view.
function drawOffscreen(){
 const c=state.cam;if(!c)return;
 state.edgeArrows=[];
 for(const w of state.worms){
  if(!w.alive)continue;const sx=(w.x-c.x)*c.zoom,sy=(w.y-c.y)*c.zoom;if(sx>=-10&&sx<=VIEW_W+10&&sy>=-10&&sy<=VIEW_H+10)continue;
  const ex=clamp(sx,22,VIEW_W-22),ey=clamp(sy,22,VIEW_H-120);
  ctx.save();ctx.translate(ex,ey);ctx.rotate(Math.atan2(sy-ey,sx-ex));ctx.beginPath();ctx.moveTo(13,0);ctx.lineTo(-8,-9);ctx.lineTo(-8,9);ctx.lineTo(13,0);
  ctx.fillStyle=TEAM_COLORS[w.team?1:0];ctx.fill();ctx.lineWidth=state.camTargetId===w.id?4:2.5;ctx.strokeStyle=state.camTargetId===w.id?'#ffffff':'#1c1420';ctx.stroke();ctx.restore();
  const a=state.active,dist=a?Math.round(Math.hypot(w.x-a.x,w.y-a.y)/10):0,lx=clamp(ex,40,VIEW_W-40),ly=ey+(ey>VIEW_H/2?-22:26);
  ctx.save();ctx.font='bold 13px system-ui,sans-serif';ctx.textAlign='center';ctx.lineWidth=4;ctx.strokeStyle='#1c1420';ctx.fillStyle='#ffffff';const label=`${Math.ceil(w.hp)}♥ ${dist}m`;ctx.strokeText(label,lx,ly);ctx.fillText(label,lx,ly);ctx.restore();
  state.edgeArrows.push({x:ex,y:ey,id:w.id});
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
function drawAim(){if(!state.running||!isHuman(state.team)||state.phase!=='ready'||!state.active?.alive)return;const w=state.active,v=aimVector();ctx.save();ctx.strokeStyle='#fff8d9';ctx.lineWidth=3;ctx.setLineDash([8,8]);ctx.beginPath();ctx.moveTo(w.x+v.x*27,w.y-8+v.y*27);ctx.lineTo(w.x+v.x*125,w.y-8+v.y*125);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#fff9dd';ctx.beginPath();ctx.arc(w.x+v.x*125,w.y-8+v.y*125,6,0,Math.PI*2);ctx.fill();const ax=state.airTarget??state.airHover;if(state.selected==='airstrike'&&ax!=null){ctx.strokeStyle='#ffefaa';ctx.lineWidth=2;if(state.airTarget==null)ctx.setLineDash?.([6,6]);ctx.beginPath();ctx.moveTo(ax,120);ctx.lineTo(ax,groundY(state.terrain,ax)-30);ctx.stroke();ctx.beginPath();ctx.arc(ax,groundY(state.terrain,ax)-25,28,0,Math.PI*2);ctx.stroke();ctx.setLineDash?.([])}
 // Teleport preview: a worm-sized ring, green where it fits, red where it does not.
 if(state.selected==='teleport'){const tx=state.airTarget??state.airHover,ty=state.airTarget!=null?state.airTargetY:state.airHoverY;if(tx!=null&&ty!=null){const ok=wormFits(state.terrain,tx,ty)&&ty<state.waterLevel-40&&ty>R;ctx.strokeStyle=ok?'#9dffb8':'#ff7a6b';ctx.lineWidth=3;ctx.setLineDash?.([5,5]);ctx.beginPath();ctx.arc(tx,ty,R+7,0,Math.PI*2);ctx.stroke();ctx.setLineDash?.([])}}ctx.restore()}
// The camera's world rectangle plus a margin (covers the screen shake); drawing is skipped outside it.
const WORM_PAD=110;
function viewRect(c){const m=40+(state.shake||0);return {x0:c.x-m,y0:c.y-m,x1:c.x+VIEW_W/c.zoom+m,y1:c.y+VIEW_H/c.zoom+m}}
const inView=(v,x,y,pad)=>x+pad>=v.x0&&x-pad<=v.x1&&y+pad>=v.y0&&y-pad<=v.y1;
function render(){if(!state.terrain)return;const now=performance.now();frameDt=lastFrame?Math.min(.05,(now-lastFrame)/1000):.016;lastFrame=now;drawSky(now);const cam=state.cam;const v=state.view=viewRect(cam);ctx.save();ctx.scale(cam.zoom,cam.zoom);ctx.translate(-cam.x,-cam.y);if(state.shake){ctx.translate((visualRand()-.5)*state.shake,(visualRand()-.5)*state.shake)}drawWorldBack(now);drawEnvironment(ctx,state,groundY);drawBillboards(ctx,state.billboards,state.terrain,now);drawBattleAds(ctx,state,now,'back',VIEW_W,VIEW_H);ctx.drawImage(state.terrainCanvas,0,0);drawProps(ctx,state.props,now,{crateLogo:sponsorImage(state.crateSponsor),chuteLogo:sponsorImage(state.battleAds?.parachute),view:v});drawRope();for(const p of state.projectiles)drawOrdnance(ctx,p);drawBattleAds(ctx,state,now,'air',VIEW_W,VIEW_H);for(const w of state.worms){const gy=w.alive?null:graveY(w);if(inView(v,w.x,w.y,WORM_PAD))drawCharacter(ctx,w,{active:w===state.active&&state.running,weapon:state.selected,aim:state.aim,phase:state.phase,now,graveY:gy})}for(const b of state.blasts)if(inView(v,b.x,b.y,b.r*2+60))drawBlast(ctx,b);drawAim();for(const p of state.particles){if(!inView(v,p.x,p.y,p.r+2))continue;ctx.globalAlpha=clamp(p.life/p.max,0,1);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();if(p.r>3.4){ctx.lineWidth=1.5;ctx.strokeStyle='#2b1a1c';ctx.stroke()}}ctx.globalAlpha=1;drawWater(ctx,state,themes[state.map],W,H,now,true);ctx.restore();drawOffscreen();drawHud(ctx,state,VIEW_W,VIEW_H,now)}
// update() runs on every animation frame as before. Drawing is skipped while nothing can be seen changing: a modal
// (setup or results) dims and blurs the canvas, so it gets one still frame, and a hidden tab gets none. On 120/144 Hz
// screens every other refresh is drawn (60-72 fps); 60-100 Hz screens draw every refresh.
const MIN_FRAME_MS=9.5;let last=performance.now(),lastRender=-1e9,stillKey=null;
function shouldRender(now){
 if(document.hidden)return false;
 if(document.querySelector?.('.modal.open')){const key=state.seed+':'+state.map+':'+state.phase;if(key===stillKey)return false;stillKey=key;return true}
 stillKey=null;return now-lastRender>=MIN_FRAME_MS;
}
function loop(now){const dt=Math.min((now-last)/1000,.04);last=now;update(dt);if(shouldRender(now)){lastRender=now;render()}requestAnimationFrame(loop)}requestAnimationFrame(loop);
function pointerCoords(ev){const r=canvas.getBoundingClientRect(),c=state.cam,sx=(ev.clientX-r.left)/r.width*VIEW_W,sy=(ev.clientY-r.top)/r.height*VIEW_H;return{x:c.x+sx/c.zoom,y:c.y+sy/c.zoom}}
function aimAt(ev){if(!state.running||!isHuman(state.team)||state.phase!=='ready')return;const m=pointerCoords(ev),w=state.active,dx=m.x-w.x,dy=m.y-w.y+8;if(state.selected==='airstrike'||state.selected==='teleport'){if(ev.type==='pointerdown'&&(ev.button===0||ev.pointerType!=='mouse')){state.airTarget=m.x;state.airTargetY=m.y;state.airHover=null}else if(state.airTarget==null){state.airHover=m.x;state.airHoverY=m.y}return}state.dir=dx<0?-1:1;state.aim=aimAngle(dx,dy);w.face=state.dir}
function chargeStart(){if(!state.running||!isHuman(state.team)||state.phase!=='ready'||state.charging)return;if(['punch','dynamite','airstrike','jetpack','shotgun','teleport','rope'].includes(state.selected)){fire();return}state.charging=true;state.chargeDir=1;state.power=.22;tone(480,.08,'sine',.03,650)}
function chargeEnd(){if(state.charging)fire()}
const weaponBox=$('weapons');WEAPONS.forEach((id,i)=>{const b=document.createElement('button');b.className='weapon';b.dataset.weapon=id;b.title=`${data[id].name} - ${data[id].short}`;b.innerHTML=`<span class="glyph">${weaponIcon(id)||data[id].icon}</span><span class="name">${data[id].name}</span><span class="key">${i+1}</span>`;b.addEventListener('click',()=>{if(!isHuman(state.team)||state.phase!=='ready'||state.shotgunLeft)return;state.selected=id;state.playerWeapon=id;state.airTarget=null;state.airHover=null;updateUI();tone(530,.06,'sine',.03)});weaponBox.appendChild(b)});
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
canvas.addEventListener('pointermove',aimAt);canvas.addEventListener('pointerdown',e=>{document.activeElement?.blur?.();
 // A click on an edge arrow frames that worm instead of shooting.
 if(e.button===0&&state.edgeArrows?.length){const r=canvas.getBoundingClientRect(),sx=(e.clientX-r.left)/r.width*VIEW_W,sy=(e.clientY-r.top)/r.height*VIEW_H,hit=state.edgeArrows.find(a=>Math.hypot(a.x-sx,a.y-sy)<26);if(hit){pickTarget(state.worms.find(w=>w.id===hit.id));return}}
 aimAt(e);if(e.pointerType==='mouse'&&e.button===0)chargeStart()});window.addEventListener('pointerup',chargeEnd);
$('fire').addEventListener('pointerdown',e=>{e.preventDefault();chargeStart()});$('fire').addEventListener('pointerup',e=>{e.preventDefault();chargeEnd();$('fire').blur?.()});$('fire').addEventListener('focus',()=>{const y=window.scrollY;requestAnimationFrame?.(()=>window.scrollTo?.(0,y))});$('fire').addEventListener('pointerleave',chargeEnd);
document.addEventListener?.('click',e=>{const b=e.target?.closest?.('button');if(b&&!b.closest('.modal')&&e.detail>0)b.blur()});
$('end-turn').onclick=endTurn;
$('cam-target').onclick=()=>cycleTarget();$('cam-view').onclick=()=>{if(!state.cam)return;followAgain();state.cam.auto=false;state.cam.tz=state.cam.tz>minZoom()+.01?minZoom():1};$('touch-switch').onclick=cycle;
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
 if(e.code==='KeyC'&&state.cam){pickTarget(null);state.cam.tz=1}
 if(e.code==='KeyZ'&&state.cam){followAgain();state.cam.auto=false;state.cam.tz=state.cam.tz>minZoom()+.01?minZoom():1}
 if(e.code==='KeyT')cycleTarget();
 if(e.code==='KeyR')toggleStrikeDirection();
 if(e.code==='Minus'||e.code==='Equal')toggleGrenadeBounce();
 if(e.shiftKey&&/^Digit[1-5]$/.test(e.code)){setGrenadeFuse(Number(e.code.slice(-1)));return}
 if(/^Digit[1-9]$/.test(e.code)&&isHuman(state.team)&&state.phase==='ready'&&!state.shotgunLeft){state.selected=WEAPONS[Number(e.code.slice(-1))-1];state.playerWeapon=state.selected;state.airTarget=null;updateUI()}
});
window.addEventListener('keyup',e=>{state.keys[e.code]=false;if(e.code==='Space')chargeEnd()});window.addEventListener('blur',()=>{state.keys={};state.charging=false;state.power=.5;updateUI()});

// Battle setup: a row of player buttons per team; the choice is remembered on this device.
const CTRL_HINTS={human:'You play this team.',easy:'Local algorithm at its sharpest: instant turns, exact physics.',hard:'Broker LLM, about 8 s a turn; it gets no wind information, so its shots drift.',ultra:'Broker LLM, about 8 s a turn, with everything: wind, mines, barrels, crates and predicted damage.',god:'PC Ultra plus the whole match history: it studies earlier shots and their results to correct its aim and pick targets.'};
let setupCtrls=['human','easy'];try{const saved=JSON.parse(localStorage.getItem('craterCrew.controllers')||'null');if(Array.isArray(saved)&&saved.length===2&&saved.every(c=>c in CONTROLLER_LABELS)){setupCtrls=saved;ctrlsSaved=true}}catch{}
function updateAiHint(){
 for(const pick of document.querySelectorAll?.('.team-pick')??[]){const t=Number(pick.dataset.team);for(const b of pick.querySelectorAll('button')){const on=b.dataset.ctrl===setupCtrls[t];b.classList.toggle('on',on);b.setAttribute('aria-checked',String(on))}}
 const lines=[0,1].filter(t=>setupCtrls[t]!=='human').map(t=>`${TEAM_NAMES[t]} · ${CONTROLLER_LABELS[setupCtrls[t]]}: ${CTRL_HINTS[setupCtrls[t]]}`);
 // The setup screen stays clean: what each level means lives in the buttons' tooltips, not in a paragraph.
 $('ai-hint').textContent='';void lines;
 for(const b of document.querySelectorAll?.('.seg button[data-ctrl]')??[])if(!b.disabled)b.title=CTRL_HINTS[b.dataset.ctrl]||'';
}
for(const pick of document.querySelectorAll?.('.team-pick')??[])pick.addEventListener('click',e=>{const b=e.target.closest?.('button[data-ctrl]');if(!b||b.disabled)return;chooseController(Number(pick.dataset.team),b.dataset.ctrl)});
function chooseController(team,c){if(!(c in CONTROLLER_LABELS))return;setupCtrls[team]=c;ctrlsSaved=true;try{localStorage.setItem('craterCrew.controllers',JSON.stringify(setupCtrls))}catch{}updateAiHint()}
// PC Hard/Ultra/God stay off when the server has no Broker or the admin settings do not offer them (God follows Ultra).
function refreshCtrlButtons(){for(const lvl of ['hard','ultra','god']){const off=brokerDown||!offered[lvl];for(const b of document.querySelectorAll?.(`.seg button[data-ctrl="${lvl}"]`)??[]){b.disabled=off;b.title=brokerDown?'Broker LLM is not configured on this server':off?'Not offered on this server':''}}setupCtrls=setupCtrls.map(c=>['hard','ultra','god'].includes(c)&&(brokerDown||!offered[c])?'easy':c);updateAiHint()}
// Broker levels need the server side configured; otherwise their buttons are disabled with the reason.
globalThis.fetch?.('api/ai/health').then(r=>r.json()).then(h=>{if(h?.configured)return;brokerDown=true;refreshCtrlButtons()}).catch(()=>{});
updateAiHint();
function applyAudioSettings(unlock=false){const priorMusic=state.musicEnabled;state.sound=$('effects-on').checked;state.musicEnabled=$('music-on').checked;state.fxVolume=clamp(Number($('effects-volume').value)/100,0,1);state.musicVolume=clamp(Number($('music-volume').value)/100,0,1);configureVoices({enabled:state.sound&&rules.voices,volume:state.fxVolume});if(unlock){if(!state.audioUnlocked)unlockAudio();else audio?.resume?.()}if(!priorMusic&&state.musicEnabled){state.musicStep=0;state.musicNextTime=0}$('sound').textContent=state.sound||state.musicEnabled?'♫':'×';$('sound').title=state.sound||state.musicEnabled?'Music and effects settings':'Sound off — open settings'}
for(const id of ['music-on','effects-on'])$(id).onchange=()=>{audioTouched=true;applyAudioSettings(true)};
for(const id of ['music-volume','effects-volume'])$(id).oninput=()=>{audioTouched=true;applyAudioSettings(true)};
$('start').onclick=()=>{applyAudioSettings(true);state.controllers=[...setupCtrls];state.aiDriver=usesBroker(1)?'broker':'local';$('intro').classList.remove('open');newGame(enabledMap(Number($('map-choice').value)),2)};
$('rematch').onclick=()=>{$('result').classList.remove('open');newGame(state.map,state.difficulty)};
$('new-map').onclick=()=>{$('result').classList.remove('open');newGame(nextMap(state.map),state.difficulty)};
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
  state.brokerOptions=withSimText(rankOptions(brokerTurnOptions(state,{windBlind:ctrl(state.team)==='hard'})));
  const offered=state.brokerOptions.map(({id,description})=>({id,description}));
  if(JSON.stringify(offered)!==JSON.stringify(record.request.candidates)||JSON.stringify(brokerSnapshot(state,{windBlind:ctrl(state.team)==='hard'}))!==JSON.stringify(record.request.snapshot))throw Error('stale pending state');
  simRand=seeded((state.seed^0x9e3779b9)>>>0);for(let i=0;i<state.simDraws;i++)simRand();
  buildTerrain();state.turnLog=openTurn(state);state.phase='broker-error';state.brokerError='Pending Broker turn recovered. Retry to read the same job.';
  $('broker-error').textContent=state.brokerError;$('broker-panel').hidden=false;$('intro').classList.remove('open');updateUI();return true;
 }catch{clearPendingTurn();return false}
}
// ---- Admin settings: fetched once at startup; without the API (file://, offline) the defaults stay. ----
const enabledMap=m=>rules.maps.includes(m)?m:rules.maps[0];
const nextMap=m=>rules.maps.find(x=>x>m)??rules.maps[0];
function applySettings(raw){const s=mergeSettings(raw);if(state.running&&!state.ended)pendingSettings=s;else useSettings(s);return s}
function useSettings(s){
 Object.assign(scheme,{mines:s.props.mines,barrels:s.props.barrels,crateChance:s.props.crateChance});
 Object.assign(rules,{turnTime:s.match.turnTime,teleports:s.match.teleports,crateHeal:s.props.crateHeal,suddenDeathRound:s.water.suddenDeathRound,waterRise:s.water.waterRise,windStart:s.wind.startMax,windDrift:s.wind.turnDrift,windCap:s.wind.cap,maps:[...s.maps.enabled],voices:s.audio.voices,sponsors:s.sponsors.filter(x=>x.enabled!==false)});
 loadSponsorImages(rules.sponsors);showSponsorBanner();
 // The field manual quotes the live rules (crate heal, sudden-death round, teleport charges).
 for(const el of document.querySelectorAll?.('[data-rule]')??[])if(rules[el.dataset.rule]!=null)el.textContent=String(rules[el.dataset.rule]);
 for(const o of $('map-choice').options??[]){const on=rules.maps.includes(Number(o.value));o.hidden=!on;o.disabled=!on}
 if(!rules.maps.includes(Number($('map-choice').value)))$('map-choice').value=String(rules.maps[0]);
 offered={hard:s.players.offerHard,ultra:s.players.offerUltra,god:s.players.offerUltra};if(!ctrlsSaved)setupCtrls=[...s.players.defaults];refreshCtrlButtons();
 if(!audioTouched){$('music-on').checked=s.audio.music;$('effects-on').checked=s.audio.effects;$('music-volume').value=String(s.audio.musicVolume);$('effects-volume').value=String(s.audio.effectsVolume)}
}
// "Presented by" strip on the setup and results screens; one weighted pick per page load.
function showSponsorBanner(){
 const s=pickSponsors(rules.sponsors,'banner',1,Math.random)[0];
 for(const id of ['sponsor-intro','sponsor-result']){const a=$(id),img=$(id+'-logo');if(!a||!img)continue;
  if(!s){a.hidden=true;continue}
  const link=safeLink(s);if(link)a.setAttribute?.('href',link);else a.removeAttribute?.('href');
  img.alt=s.name;a.title=link?`${s.name} (opens in a new tab)`:s.name;img.onload=()=>{a.hidden=false};img.onerror=()=>{a.hidden=true};img.referrerPolicy='no-referrer';img.src=s.logoUrl}
}
globalThis.fetch?.('api/settings').then(r=>r.ok?r.json():null).then(s=>{if(s)applySettings(s)}).catch(()=>{});
const pendingOnLoad=readPendingTurn();
newGame(0,1,undefined,Boolean(pendingOnLoad));
if(!restorePendingBrokerTurn(pendingOnLoad)){state.running=false;$('intro').classList.add('open')}
window.__craterCrew={simulateAction,rankOptions,chooseController,scheme,rules,applySettings,state,newGame,nextTurn,fire,explosion,finish,beginTurn,update,render,cycle,aimAt,aiAct,requestBrokerTurn,restorePendingBrokerTurn,setGrenadeFuse,toggleGrenadeBounce,toggleStrikeDirection,dropDynamite};

