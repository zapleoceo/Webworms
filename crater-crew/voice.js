// Worm voices: CC0 recordings (see voices/CREDITS.txt) decoded once into AudioBuffers and played
// sped up, which raises the pitch the way the classic worm voices sound. Preloaded buffers start
// instantly; without Web Audio (tests, old browsers) the game simply stays silent.
const TEAM_BANK=['sky','dirt'],TEAM_RATE=[1.42,1.36];
// Higher value interrupts lower; equal or lower is dropped while a line is still playing.
const PRIORITY={jump:1,turn:1.5,fire:2,bazooka:2,shotgun:2,miss:2,hurry:2,incoming:3,hurt:3,medic:3,kill:3,water:4,die:4,win:5,tie:5};
const FALLBACK={bazooka:'fire',shotgun:'fire',medic:'hurt',kill:'win',tie:'die'};
const settings={enabled:true,volume:1};
const banks={};let ctx=null,loading=null,current=null;

export function configureVoices({enabled=settings.enabled,volume=settings.volume}={}){settings.enabled=enabled;settings.volume=volume;if(!enabled)stopVoices()}
export function stopVoices(){try{current?.source.stop()}catch{}current=null}

// Called from the first user gesture with the game's AudioContext; safe to call repeatedly.
export function loadVoices(audioContext,base='voices/'){
 if(loading||!audioContext||typeof fetch!=='function')return loading;ctx=audioContext;
 loading=fetch(base+'manifest.json').then(r=>r.json()).then(manifest=>Promise.all(Object.entries(manifest).flatMap(([bank,events])=>
  Object.entries(events).flatMap(([event,files])=>files.map(file=>fetch(base+bank+'/'+file).then(r=>r.arrayBuffer()).then(data=>ctx.decodeAudioData(data))
   .then(buffer=>{((banks[bank]??={})[event]??=[]).push(buffer)}).catch(()=>{})))))).catch(()=>{loading=null});
 return loading;
}

export function voice(w,event){
 if(!ctx||!w||!settings.enabled||settings.volume<=0)return false;
 const bank=banks[TEAM_BANK[w.team?1:0]]||{},clips=bank[event]?.length?bank[event]:bank[FALLBACK[event]];if(!clips?.length)return false;
 const p=PRIORITY[event]||1,now=ctx.currentTime;
 if(current&&now<current.ends){if(p<=current.priority)return false;stopVoices()}
 const buffer=clips[Math.floor(Math.random()*clips.length)],source=ctx.createBufferSource(),gain=ctx.createGain();
 // Each worm gets a slightly different pitch so a team does not sound like one recording.
 source.buffer=buffer;source.playbackRate.value=TEAM_RATE[w.team?1:0]+((w.id||0)%3-1)*.05;
 gain.gain.value=Math.min(1,settings.volume)*.9;source.connect(gain).connect(ctx.destination);
 try{source.start()}catch{return false}
 current={source,priority:p,ends:now+buffer.duration/source.playbackRate.value};
 source.onended=()=>{if(current?.source===source)current=null};
 return true;
}
