import {W,R,groundY,solid,selectShot,selectLob,aimAngle,clamp} from './engine.js';

// The local physics supplies legal options. The Broker model makes the choice.
export function brokerTurnOptions(state){
 const w=state.active,foes=state.worms.filter(x=>x.alive&&x.team===0),friends=state.worms.filter(x=>x.alive&&x.team===1),options=[];
 if(!w?.alive||!foes.length)return options;
 const add=(id,description,action)=>options.push({id,description,action});
 if(state.shotgunLeft){for(const f of foes){const dx=f.x-w.x,dy=f.y-w.y-7;add(`shotgun_${f.id}`,`Second shotgun shot toward ${f.name}; direct pellets can be blocked by terrain.`,{weapon:'shotgun',dir:Math.sign(dx)||1,aim:aimAngle(dx,dy)})}return options}
 for(const f of foes){
  const dx=f.x-w.x,dy=f.y-w.y-7,dist=Math.hypot(dx,dy),dir=Math.sign(dx)||1;
  if(Math.abs(dx)<58&&Math.abs(dy)<48)add(`punch_${f.id}`,`Punch ${f.name}: adjacent target, 30 base damage and knockback.`,{weapon:'punch',dir});
  if(dist<270&&Math.abs(dy)<85){let clear=true;for(let d=25;d<dist-20;d+=7)if(solid(state.terrain,w.x+dx*d/dist,w.y-7+dy*d/dist)){clear=false;break}if(clear)add(`shotgun_${f.id}`,`Shotgun toward ${f.name}: direct line, two separately aimed shots, low terrain damage.`,{weapon:'shotgun',dir,aim:aimAngle(dx,dy)});}
  const shot=selectShot(state.terrain,w,[f],friends,state.wind,state.difficulty,state.waterLevel);
  if(shot&&shot.score>0)add(`bazooka_${f.id}`,`Bazooka toward ${f.name}: predicted blast value ${Math.round(shot.score)}, wind ${Math.round(state.wind)}.`,{weapon:'bazooka',dir:shot.dir,aim:shot.angle*Math.PI/180,power:shot.power});
  if(state.difficulty>0){const lob=selectLob(state.terrain,w,[f],friends,state.wind,state.difficulty,state.waterLevel);if(lob&&lob.score>0)add(`grenade_${f.id}`,`Three-second high-bounce grenade toward ${f.name}: predicted blast value ${Math.round(lob.score)}.`,{weapon:'grenade',dir:lob.dir,aim:lob.angle*Math.PI/180,power:lob.power,fuse:3,bounce:'high'});}
  for(const side of [-1,1])add(`air_${f.id}_${side<0?'right':'left'}`,`Airstrike around ${f.name} from ${side<0?'right':'left'}: five missiles, wind-proof; check nearby allies.`,{weapon:'airstrike',strikeDir:side,targetX:clamp(f.x-side*48,75,W-75)});
  if(state.difficulty>0&&dist<112&&dist>58&&w.hp>55&&w.x>220&&w.x<W-220){const retreatX=w.x-dir*190;if(groundY(state.terrain,retreatX)<state.waterLevel-40)add(`dynamite_${f.id}`,`Place dynamite near ${f.name}, then retreat ${dir>0?'left':'right'}; 3-second fuse and large blast.`,{weapon:'dynamite',dir,targetX:retreatX});}
 }
 if(groundY(state.terrain,w.x)>state.waterLevel-70){const toward=foes.reduce((a,b)=>Math.abs(a.x-w.x)<Math.abs(b.x-w.x)?a:b),targetX=clamp(w.x+Math.sign(toward.x-w.x)*260,65,W-65);if(groundY(state.terrain,targetX)<state.waterLevel-70)add('jetpack_escape','Jetpack to safer ground; consumes this turn, can drop dynamite if close.',{weapon:'jetpack',targetX});}
 return options.slice(0,32);
}

export function brokerSnapshot(state){
 return {map:state.map,round:state.round,wind:Math.round(state.wind),water:Math.round(state.waterLevel),activeId:state.active.id,worms:state.worms.map(w=>({id:w.id,team:w.team,x:Math.round(w.x),y:Math.round(w.y),hp:w.hp,alive:w.alive})),terrain:Array.from({length:32},(_,i)=>Math.round(groundY(state.terrain,Math.round(i*(W-1)/31))))};
}
