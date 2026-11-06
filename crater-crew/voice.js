// Worm voices: short squeaky lines spoken by the browser's own speech synthesis, pitched up per
// team. No recorded or third-party audio is shipped; without speechSynthesis the game stays silent.
const LINES={
 turn:['Let\'s get \'em!','My turn!','Right then!','Here we go!','Watch this!','Leave it to me!'],
 fire:['Fire!','Take that!','Fire in the hole!','Incoming!','Have some of this!'],
 hurt:['Ow!','Oof!','Ouch!','Hey!','Yowch!','That hurt!'],
 die:['Bye bye!','Oh no!','See ya!','Farewell!'],
 jump:['Hup!','Whee!','Yah!'],
 miss:['Oops!','Missed!','Drat!'],
 win:['Victory!','We did it!','Flawless!'],
 water:['Glub glub!','Help!'],
};
// Higher value interrupts lower; equal or lower waits its turn or is dropped.
const PRIORITY={jump:1,turn:2,fire:2,miss:2,hurt:3,water:4,die:4,win:5};
const settings={enabled:true,volume:1};
let speaking=0,lastAt=0,chosen=null;
const synth=()=>globalThis.speechSynthesis&&typeof globalThis.SpeechSynthesisUtterance==='function'?globalThis.speechSynthesis:null;
function pickVoice(s){
 if(chosen)return chosen;const voices=s.getVoices?.()||[];
 chosen=voices.find(v=>/en-GB/i.test(v.lang))||voices.find(v=>/^en/i.test(v.lang))||null;return chosen;
}
export function configureVoices({enabled=settings.enabled,volume=settings.volume}={}){settings.enabled=enabled;settings.volume=volume;if(!enabled)stopVoices()}
export function stopVoices(){speaking=0;try{synth()?.cancel()}catch{}}
export function voice(w,event){
 const s=synth(),lines=LINES[event];if(!s||!lines||!settings.enabled||settings.volume<=0||!w)return false;
 const p=PRIORITY[event]||1,now=globalThis.performance?.now?.()??Date.now();
 if(s.speaking&&now-lastAt<2500){if(p<=speaking)return false;s.cancel()}
 const u=new globalThis.SpeechSynthesisUtterance(lines[Math.floor(Math.random()*lines.length)]);
 const v=pickVoice(s);if(v){u.voice=v;u.lang=v.lang}else u.lang='en-GB';
 u.pitch=w.team?1.55:1.95;u.rate=1.3+((w.id||0)%3)*.06;u.volume=Math.min(1,settings.volume);
 u.onend=()=>{speaking=0};speaking=p;lastAt=now;
 try{s.speak(u)}catch{return false}
 return true;
}
