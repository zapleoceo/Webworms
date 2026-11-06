// Crater Crew admin page: sign in, edit the game settings and sponsors, save through /api/admin/*.
// Validation uses the same rules as the server (settings.js); the server checks everything again.
import {defaultSettings,validateSettings,LIMITS,CONTROLLERS,PLACEMENTS,validLink} from './settings.js';

const $=id=>document.getElementById(id);
const MAP_NAMES=['Sunset Cove · 3600×1400','Rust Ridge · 3600×1400','Crystal Atoll · 3600×1400','Grand Expedition · 6400×1800'];
const CTRL_NAMES={human:'Human',easy:'PC Easy (local)',hard:'PC Hard (Broker LLM)',ultra:'PC Ultra (Broker LLM)'};
const PLACE_NAMES={billboard:'Billboard',crate:'Crate',banner:'Banner'};
const MAX_LOGO=512*1024;

// Labels, units and hints for every numeric/boolean field, in display order per section.
const UI={
 match:{
  turnTime:{label:'Turn time',unit:'s',hint:'Seconds per turn. Default 35.'},
  teleports:{label:'Teleport charges',unit:'per team',hint:'Teleports each team gets per match. Default 2.'},
 },
 props:{
  mines:{label:'Mines',unit:'per map',hint:'Proximity mines scattered at the start. Default 8.'},
  barrels:{label:'Barrels',unit:'per map',hint:'Explosive fuel barrels. Default 6.'},
  crateChance:{label:'Health crate chance',unit:'%',hint:'Chance that a crate parachutes in at the start of a turn. Default 30 %.',percent:true},
  crateHeal:{label:'Crate heal',unit:'HP',hint:'Health a crate restores. Default 25.'},
 },
 water:{
  suddenDeathRound:{label:'Sudden death from round',unit:'round',hint:'The water starts rising at this round. Default 9.'},
  waterRise:{label:'Water rise',unit:'px / round',hint:'How far the water climbs each round in sudden death (a worm is about 30 px tall). Default 12.'},
 },
 wind:{
  startMax:{label:'Starting wind',unit:'± strength',hint:'Wind at the start of a match is random within ± this. Default 36.'},
  turnDrift:{label:'Wind change per turn',unit:'± strength',hint:'How much the wind can shift each turn. Default 20.'},
  cap:{label:'Wind limit',unit:'± strength',hint:'The wind never gets stronger than this. Default 80 (100 max).'},
 },
 players:{
  offerHard:{label:'Offer PC Hard',hint:'Broker LLM without wind information. Needs Broker configured on the server.'},
  offerUltra:{label:'Offer PC Ultra',hint:'Broker LLM with full information. Needs Broker configured on the server.'},
 },
 audio:{
  music:{label:'Music on'},
  musicVolume:{label:'Music volume',unit:'%',hint:'Default 42.'},
  effects:{label:'Sound effects on'},
  effectsVolume:{label:'Effects volume',unit:'%',hint:'Also the worms’ voices. Default 65.'},
  voices:{label:'Worm voices',hint:'Spoken lines (“Fire!”, “Incoming!”) on top of the effects.'},
 },
};

let settings=defaultSettings(),storage=false,dirty=false;

// ---------- API ----------
async function api(path,{method='GET',json,form}={}){
 const init={method,headers:{},credentials:'same-origin'};
 if(json!==undefined){init.headers['content-type']='application/json';init.body=JSON.stringify(json)}
 if(form)init.body=form;
 let response;try{response=await fetch(path,init)}catch{throw Object.assign(Error('Network error. Check your connection.'),{status:0})}
 let body=null;try{body=await response.json()}catch{}
 if(response.status===401&&path!=='/api/admin/login'){showLogin('Your session has ended. Please sign in again.');throw Object.assign(Error('Not signed in'),{status:401,silent:true})}
 if(!response.ok)throw Object.assign(Error(body?.error||`Request failed (${response.status})`),{status:response.status,errors:body?.errors||[]});
 return body;
}

// ---------- views ----------
function show(view){$('loading').hidden=true;$('login-view').hidden=view!=='login';$('config-view').hidden=view!=='config';$('bar-actions').hidden=view!=='config'}
function showLogin(message=''){show('login');$('login-error').textContent=message;$('password').value='';$('password').focus()}
let toastTimer=0;
function toast(text,kind='ok'){const t=$('toast');t.textContent=text;t.className=`toast ${kind}`;t.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{t.hidden=true},kind==='error'?7000:3500)}
function setDirty(on){dirty=on;$('dirty').hidden=!on}
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});

// ---------- form building ----------
function el(tag,attrs={},...kids){const n=document.createElement(tag);for(const [k,v] of Object.entries(attrs)){if(v===undefined||v===null||v===false)continue;if(k==='text')n.textContent=v;else if(k in n&&typeof v!=='string')n[k]=v;else n.setAttribute(k,v===true?'':v)}for(const kid of kids)if(kid!=null)n.append(kid);return n}
function buildFields(){
 for(const [section,fields] of Object.entries(UI)){
  const box=document.querySelector(`[data-section="${section}"]`);
  for(const [key,ui] of Object.entries(fields)){
   const path=`${section}.${key}`,[kind,min,max]=LIMITS[section][key];
   if(kind==='bool'){box.append(el('label',{class:'field toggle'},el('input',{type:'checkbox','data-path':path}),el('span',{class:'label',text:ui.label}),ui.hint?el('span',{class:'hint',text:ui.hint}):null,el('span',{class:'error','data-error':path})));continue}
   const lo=ui.percent?min*100:min,hi=ui.percent?max*100:max;
   box.append(el('label',{class:'field'},
    el('span',{class:'label',text:ui.label}),
    el('span',{class:'input-unit'},el('input',{type:'number',inputmode:'numeric',min:String(lo),max:String(hi),step:'1','data-path':path,required:true}),ui.unit?el('span',{class:'unit',text:ui.unit}):null),
    el('span',{class:'hint',text:`${ui.hint?ui.hint+' ':''}Range ${lo}–${hi}.`}),
    el('span',{class:'error','data-error':path})));
  }
 }
 for(let i=0;i<MAP_NAMES.length;i++)$('maps').append(el('label',{class:'chip'},el('input',{type:'checkbox',value:String(i),'data-map':String(i)}),` ${i} · ${MAP_NAMES[i]}`));
 for(const t of [0,1])for(const c of CONTROLLERS)$('default-'+t).append(el('option',{value:c,text:CTRL_NAMES[c]}));
 $('settings-form').addEventListener('input',()=>{setDirty(true);validateLive()});
 $('settings-form').addEventListener('change',()=>{setDirty(true);validateLive()});
}

const input=path=>document.querySelector(`input[data-path="${path}"]`);
const isPercent=path=>{const [s,k]=path.split('.');return Boolean(UI[s]?.[k]?.percent)};
function fillForm(s){
 for(const [section,fields] of Object.entries(UI))for(const key of Object.keys(fields)){
  const path=`${section}.${key}`,i=input(path),v=s[section][key];
  if(i.type==='checkbox')i.checked=Boolean(v);else i.value=String(isPercent(path)?Math.round(v*1000)/10:v);
 }
 for(const box of document.querySelectorAll('[data-map]'))box.checked=s.maps.enabled.includes(Number(box.dataset.map));
 $('default-0').value=s.players.defaults[0];$('default-1').value=s.players.defaults[1];
 renderSponsors(s.sponsors);
}

// Reads the form back into a settings object. Empty or non-numeric inputs become NaN, which validation reports.
function readForm(){
 const s=defaultSettings();
 for(const [section,fields] of Object.entries(UI))for(const key of Object.keys(fields)){
  const path=`${section}.${key}`,i=input(path);
  if(i.type==='checkbox')s[section][key]=i.checked;
  else{const raw=i.value.trim(),n=raw===''?NaN:Number(raw);s[section][key]=isPercent(path)?Math.round(n*10)/1000:n}
 }
 s.maps.enabled=[...document.querySelectorAll('[data-map]')].filter(b=>b.checked).map(b=>Number(b.dataset.map));
 s.players.defaults=[$('default-0').value,$('default-1').value];
 s.sponsors=readSponsors();
 return s;
}

function showErrors(errors){
 for(const e of document.querySelectorAll('[data-error]'))e.textContent='';
 for(const i of document.querySelectorAll('.invalid'))i.classList.remove('invalid');
 const general=[];
 for(const msg of errors){
  const m=/^([a-zA-Z]+(?:\[\d+\])?(?:\.[a-zA-Z]+)?)/.exec(msg),path=m?.[1]||'';
  const sponsor=/^sponsors\[(\d+)\]\.(\w+)/.exec(msg);
  if(sponsor){const row=$('sponsor-list').children[Number(sponsor[1])];const slot=row?.querySelector(`[data-error="${sponsor[2]}"]`)||row?.querySelector('[data-error="row"]');if(slot){slot.textContent=msg.replace(/^sponsors\[\d+\]\.\w+:\s*/,'');row.querySelector(`[data-field="${sponsor[2]}"]`)?.classList.add('invalid');continue}}
  const slot=document.querySelector(`[data-error="${path}"]`);
  // Cross-field messages name the field they belong to first ("wind.startMax: must not exceed wind.cap").
  const text=isPercent(path)?msg.replace(/^[^:]+:\s*/,'').replace(/between ([\d.]+) and ([\d.]+)/,(_,a,b)=>`between ${a*100} and ${b*100}`):msg.replace(/^[^:]+:\s*/,'');
  if(slot){slot.textContent=text;input(path)?.classList.add('invalid')}else general.push(msg);
 }
 return general;
}
function validateLive(){const r=validateSettings(readForm());showErrors(r.errors);return r}

// ---------- sponsors ----------
function renderSponsors(list){
 const box=$('sponsor-list');box.replaceChildren();
 $('sponsor-empty').hidden=list.length>0;
 for(const s of list){
  const row=el('div',{class:'sponsor','data-id':s.id,'data-logo':s.logoUrl});
  const logo=el('img',{class:'logo',src:s.logoUrl,alt:s.name,loading:'lazy',referrerpolicy:'no-referrer'});
  const places=el('div',{class:'places','data-field':'placements'},...PLACEMENTS.map(p=>el('label',{class:'chip'},el('input',{type:'checkbox',value:p,checked:s.placements.includes(p)}),' '+PLACE_NAMES[p])));
  row.append(
   el('div',{class:'logo-box'},logo),
   el('label',{class:'field'},el('span',{class:'label',text:'Name'}),el('input',{type:'text',maxlength:'40',value:s.name,'data-field':'name'}),el('span',{class:'error','data-error':'name'})),
   el('label',{class:'field'},el('span',{class:'label',text:'Link'}),el('input',{type:'url',maxlength:'300',value:s.link,placeholder:'https:// (optional)','data-field':'link'}),el('span',{class:'error','data-error':'link'})),
   el('label',{class:'field narrow'},el('span',{class:'label',text:'Weight'}),el('input',{type:'number',min:'1',max:'100',step:'1',value:String(s.weight),'data-field':'weight'}),el('span',{class:'error','data-error':'weight'})),
   el('label',{class:'field toggle narrow'},el('input',{type:'checkbox',checked:s.enabled,'data-field':'enabled'}),el('span',{class:'label',text:'Enabled'})),
   el('div',{class:'field'},el('span',{class:'label',text:'Placements'}),places,el('span',{class:'error','data-error':'placements'})),
   el('div',{class:'row-actions'},el('button',{type:'button',class:'danger','data-delete':s.id,text:'Delete'}),el('span',{class:'error','data-error':'row'})),
  );
  box.append(row);
 }
}
function readSponsors(){
 return [...$('sponsor-list').children].map(row=>{
  const f=k=>row.querySelector(`[data-field="${k}"]`),w=f('weight').value.trim();
  return {id:row.dataset.id,name:f('name').value,logoUrl:row.dataset.logo,link:f('link').value.trim(),weight:w===''?NaN:Number(w),enabled:f('enabled').checked,
   placements:[...row.querySelectorAll('.places input')].filter(b=>b.checked).map(b=>b.value)};
 });
}

$('sponsor-list').addEventListener('click',async e=>{
 const id=e.target.closest?.('[data-delete]')?.dataset.delete;if(!id)return;
 const row=e.target.closest('.sponsor'),name=row.querySelector('[data-field="name"]').value||'this sponsor';
 if(!confirm(`Delete ${name} and its logo? This cannot be undone.`))return;
 e.target.disabled=true;
 try{await api(`/api/admin/sponsors/${encodeURIComponent(id)}`,{method:'DELETE'});row.remove();$('sponsor-empty').hidden=$('sponsor-list').children.length>0;settings.sponsors=settings.sponsors.filter(s=>s.id!==id);toast(`${name} deleted.`)}
 catch(err){if(!err.silent)toast(err.message,'error');e.target.disabled=false}
});

$('upload-form').addEventListener('submit',async e=>{
 e.preventDefault();const out=$('upload-error');out.textContent='';
 const file=$('up-logo').files?.[0],name=$('up-name').value.trim(),link=$('up-link').value.trim(),weight=$('up-weight').value.trim();
 const places=[...document.querySelectorAll('input[name="up-place"]')].filter(b=>b.checked).map(b=>b.value);
 const problems=[];
 if(!file)problems.push('Choose a logo file.');else if(file.size>MAX_LOGO)problems.push(`The logo is ${Math.ceil(file.size/1024)} KB; the limit is 512 KB.`);
 if(!name||name.length>40)problems.push('Name: 1 to 40 characters.');
 if(link&&!validLink(link))problems.push('Link must start with https://');
 if(!/^\d+$/.test(weight)||Number(weight)<1||Number(weight)>100)problems.push('Weight: a whole number from 1 to 100.');
 if(!places.length)problems.push('Pick at least one placement.');
 if(problems.length){out.textContent=problems.join(' ');return}
 const form=new FormData();form.set('logo',file);form.set('name',name);form.set('link',link);form.set('weight',weight);form.set('placements',places.join(','));
 $('upload-button').disabled=true;
 try{
  const r=await api('/api/admin/sponsors',{method:'POST',form});
  // Keep unsaved edits in other rows: add only the new row.
  const current=readSponsors();settings.sponsors=[...settings.sponsors,r.sponsor];renderSponsors([...current,r.sponsor]);
  $('upload-form').reset();toast(`${r.sponsor.name} added.`);
 }catch(err){if(!err.silent){out.textContent=[err.message,...(err.errors||[])].join(' · ')}}
 finally{$('upload-button').disabled=!storage}
});

// ---------- save / reset ----------
$('settings-form').addEventListener('submit',async e=>{
 e.preventDefault();
 const r=validateLive();
 if(!r.ok){toast('Please fix the highlighted fields.','error');document.querySelector('.invalid')?.focus();return}
 $('save').disabled=true;
 try{const res=await api('/api/admin/settings',{method:'PUT',json:r.value});settings=res.settings;fillForm(settings);setDirty(false);toast('Settings saved. New matches use them.')}
 catch(err){if(!err.silent){const general=showErrors(err.errors||[]);toast([err.message,...general].join(' · '),'error')}}
 finally{$('save').disabled=!storage}
});
$('reset').addEventListener('click',()=>{
 if(!confirm('Reset all game settings to the built-in defaults? Sponsors stay as they are. Nothing is saved until you press Save changes.'))return;
 const sponsors=readSponsors();fillForm({...defaultSettings(),sponsors});setDirty(true);validateLive();toast('Defaults loaded. Press Save changes to apply.');
});

// ---------- auth ----------
$('login-form').addEventListener('submit',async e=>{
 e.preventDefault();$('login-error').textContent='';$('login-button').disabled=true;
 try{await api('/api/admin/login',{method:'POST',json:{password:$('password').value}});$('password').value='';await loadConfig()}
 catch(err){$('login-error').textContent=err.status===401?'Wrong password.':err.message}
 finally{$('login-button').disabled=false}
});
$('logout').addEventListener('click',async()=>{if(dirty&&!confirm('Discard unsaved changes and sign out?'))return;try{await api('/api/admin/logout',{method:'POST'})}catch{}setDirty(false);showLogin()});

async function loadConfig(){
 const r=await api('/api/admin/settings');settings=r.settings;storage=r.storage;
 $('storage-notice').hidden=storage;for(const id of ['save','upload-button'])$(id).disabled=!storage;
 fillForm(settings);setDirty(false);showErrors([]);show('config');
}

buildFields();
(async()=>{
 try{
  const s=await api('/api/admin/session');
  if(s.authenticated)await loadConfig();else showLogin();
 }catch(err){
  if(err.silent)return;
  show('login');$('login-form').hidden=err.status===503;
  $('login-error').textContent=err.status===503?(err.message==='admin not configured'?'The admin panel is not configured on this server (set ADMIN_PASSWORD).':err.message):err.status===404?'The admin API is not available here. Open this page from the game server.':err.message;
 }
})();
