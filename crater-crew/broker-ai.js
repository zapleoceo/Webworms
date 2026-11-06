import {W,H,R,data,groundY,solid,selectShot,selectLob,aimAngle,clamp,blastDamage} from './engine.js';
import {planTeleport,planCrate,planRope} from './ai-utility.js';

export const TERRAIN_SAMPLES=64;

// What a blast at (x,y) would do, worked out by the game's own damage rules, so the model weighs real
// consequences: who is hit and for how much, kills, friendly fire, chained barrels/mines, water nearby.
function effects(state,x,y,radius,damage,{spread=0}={}){
 const me=state.active,hits=[];
 for(const w of state.worms){
  if(!w.alive)continue;
  let d=0;if(spread){for(let i=-2;i<=2;i++)d+=blastDamage(Math.hypot(w.x-(x+i*spread),w.y-y),radius,damage)}else d=blastDamage(Math.hypot(w.x-x,w.y-y),radius,damage);
  if(d>0)hits.push(`${w===me?'SELF':w.team===me.team?'ally '+w.name:w.name} -${Math.min(d,Math.ceil(w.hp))}${d>=w.hp?' KILL':''}`);
 }
 const chain=(state.props||[]).filter(p=>(p.kind==='barrel'||p.kind==='mine')&&Math.abs(p.x-x)<radius+spread*2&&Math.abs(p.y-y)<radius).length;
 return (hits.length?hits.join(', '):'no worm hit')+(chain?`; sets off ${chain} barrel/mine`:'')+(y>state.waterLevel-60?'; near water':'');
}
const fit=s=>s.length>240?s.slice(0,237)+'...':s;

// The local physics supplies legal options and their predicted outcome. The Broker model makes the choice.
// windBlind (PC Hard): shots are planned as if there were no wind, and the model is not told the wind.
export function brokerTurnOptions(state,{windBlind=false}={}){
 const wind=windBlind?0:state.wind;
 const w=state.active,foes=state.worms.filter(x=>x.alive&&x.team!==w?.team),friends=state.worms.filter(x=>x.alive&&x.team===w?.team),options=[];
 if(!w?.alive||!foes.length)return options;
 const add=(id,description,action)=>options.push({id,description:fit(description),action});
 const far=f=>`${Math.round(Math.hypot(f.x-w.x,f.y-w.y))}px`;
 if(state.shotgunLeft){for(const f of foes){const dx=f.x-w.x,dy=f.y-w.y-7;add(`shotgun_${f.id}`,`Second shotgun shot at ${f.name} (${far(f)}, ${Math.ceil(f.hp)}hp): up to 25 damage if the line is clear.`,{weapon:'shotgun',dir:Math.sign(dx)||1,aim:aimAngle(dx,dy)})}return options}
 for(const f of foes){
  const dx=f.x-w.x,dy=f.y-w.y-7,dist=Math.hypot(dx,dy),dir=Math.sign(dx)||1;
  if(Math.abs(dx)<58&&Math.abs(dy)<48)add(`punch_${f.id}`,`Punch ${f.name} (${Math.ceil(f.hp)}hp, adjacent): ${data.punch.damage} damage${data.punch.damage>=f.hp?' KILL':''}, strong knockback${groundY(state.terrain,f.x+dir*120)>state.waterLevel-40?' toward water':''}.`,{weapon:'punch',dir});
  if(dist<270&&Math.abs(dy)<85){let clear=true;for(let d=25;d<dist-20;d+=7)if(solid(state.terrain,w.x+dx*d/dist,w.y-7+dy*d/dist)){clear=false;break}if(clear)add(`shotgun_${f.id}`,`Shotgun at ${f.name} (${far(f)}, ${Math.ceil(f.hp)}hp, clear line): two shots, up to 50 damage${f.hp<=50?' KILL possible':''}; barely dents terrain.`,{weapon:'shotgun',dir,aim:aimAngle(dx,dy)});}
  const shot=selectShot(state.terrain,w,[f],friends,wind,state.difficulty,state.waterLevel);
  if(shot&&shot.score>0)add(`bazooka_${f.id}`,`Bazooka at ${f.name} (${far(f)}), ${windBlind?'aimed for calm air':'wind-corrected'}: lands (${Math.round(shot.end.x)},${Math.round(shot.end.y)}): ${effects(state,shot.end.x,shot.end.y,data.bazooka.radius,data.bazooka.damage)}.`,{weapon:'bazooka',dir:shot.dir,aim:shot.angle*Math.PI/180,power:shot.power});
  if(state.difficulty>0){const lob=selectLob(state.terrain,w,[f],friends,wind,state.difficulty,state.waterLevel);if(lob&&lob.score>0)add(`grenade_${f.id}`,`Grenade at ${f.name} (${far(f)}), bounces then 3 s fuse: settles (${Math.round(lob.end.x)},${Math.round(lob.end.y)}): ${effects(state,lob.end.x,lob.end.y,data.grenade.radius,data.grenade.damage)}.`,{weapon:'grenade',dir:lob.dir,aim:lob.angle*Math.PI/180,power:lob.power,fuse:3,bounce:'high'});}
  if((state.ammo?.[w.team]?.airstrike??1)>0)for(const side of [-1,1]){const tx=clamp(f.x-side*48,75,W-75);add(`air_${f.id}_${side<0?'right':'left'}`,`Airstrike on ${f.name} from the ${side<0?'right':'left'} (any range, wind-proof, 5 missiles): about ${effects(state,tx,groundY(state.terrain,tx),data.airstrike.radius,data.airstrike.damage,{spread:35})}.`,{weapon:'airstrike',strikeDir:side,targetX:tx});}
  if(state.difficulty>0&&dist<112&&dist>58&&w.hp>55&&w.x>220&&w.x<W-220){const retreatX=w.x-dir*190;if(groundY(state.terrain,retreatX)<state.waterLevel-40)add(`dynamite_${f.id}`,`Dynamite beside ${f.name}, then retreat ${dir>0?'left':'right'} 190px; 3 s fuse: ${effects(state,w.x+dir*22,w.y,data.dynamite.radius,data.dynamite.damage).replace(/SELF -\d+( KILL)?(, )?/,'')}.`,{weapon:'dynamite',dir,targetX:retreatX});}
 }
 if(groundY(state.terrain,w.x)>state.waterLevel-70){const toward=foes.reduce((a,b)=>Math.abs(a.x-w.x)<Math.abs(b.x-w.x)?a:b),targetX=clamp(w.x+Math.sign(toward.x-w.x)*260,65,W-65);if(groundY(state.terrain,targetX)<state.waterLevel-70)add('jetpack_escape',`Jetpack to safer ground at x=${Math.round(targetX)}: you stand ${Math.round(state.waterLevel-w.y)}px above rising water; uses the turn.`,{weapon:'jetpack',targetX});}
 // Utility combos (move first, then the game's best shot from the new spot) go to the front of the list.
 if(!state.aiUtilityUsed){
  const best=Math.max(0,...options.filter(o=>/^(bazooka|grenade)_/.test(o.id)).map(o=>Number(/-(d+)/.exec(o.description)?.[1]||0))),combos=[];
  const crate=planCrate(state);
  if(crate)combos.push({id:crate.how==='walk'?'crate_walk':'crate_teleport',description:fit(`${crate.how==='walk'?'Walk':'Teleport'} to the health crate at x=${Math.round(crate.crate.x)} (+${state.crateHeal??25} hp; you have ${Math.ceil(w.hp)}hp), then the best shot from there.`),action:{utility:{kind:crate.how==='walk'?'crate-walk':'crate-teleport',...crate}}});
  if(best<25){
   const tp=planTeleport(state,{baseScore:best});
   if(tp)combos.push({id:'teleport_combo',description:fit(`Teleport (${state.ammo?.[w.team]?.teleport??0} charge left) to (${Math.round(tp.x)},${Math.round(tp.y)}), then ${tp.weapon}: ${effects(state,tp.shot.end.x,tp.shot.end.y,data[tp.weapon].radius,data[tp.weapon].damage)}.`),action:{utility:{kind:'teleport',...tp}}});
   const near=foes.reduce((a,b)=>Math.abs(a.x-w.x)<Math.abs(b.x-w.x)?a:b),rope=planRope(state,{target:near});
   if(rope)combos.push({id:'rope_combo',description:fit(`Ninja rope to (${Math.round(rope.landing.x)},${Math.round(rope.landing.y)}), ${Math.round(Math.hypot(rope.landing.x-near.x,rope.landing.y-near.y))}px from ${near.name}, then the best shot from there.`),action:{utility:{kind:'rope',...rope}}});
  }
  options.unshift(...combos);
 }
 return options.slice(0,32);
}

// Everything the model may reason about, compact. Terrain is the surface height every W/63 px.
export function brokerSnapshot(state,{windBlind=false}={}){
 return {map:state.map,size:[W,H],round:state.round,suddenDeath:state.round>=(state.suddenDeathRound??9),timer:Math.max(0,Math.ceil(state.timer)),wind:windBlind?0:Math.round(state.wind),water:Math.round(state.waterLevel),activeId:state.active.id,
  worms:state.worms.map(w=>({id:w.id,name:w.name,team:w.team,x:Math.round(w.x),y:Math.round(w.y),hp:Math.ceil(w.hp),alive:w.alive})),
  props:(state.props||[]).slice(0,60).map(p=>({kind:p.kind==='crate'?'health_crate':p.kind,x:Math.round(p.x),y:Math.round(p.y),...(p.kind==='mine'?{armed:Boolean(p.armed)}:{})})),
  terrain:Array.from({length:TERRAIN_SAMPLES},(_,i)=>Math.round(groundY(state.terrain,Math.round(i*(W-1)/(TERRAIN_SAMPLES-1)))))};
}
