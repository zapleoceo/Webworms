// The browser executes these controls and the server validates exactly the same JSON contract.
// Map bounds, ammunition and the current turn can narrow these static protocol limits further.
export const OPEN_PROTOCOL='open-v1';
export const MAX_AGENT_STEPS=6;
export const MAX_UTILITY_STEPS=3;

const number=(minimum,maximum)=>({type:'number',minimum,maximum});
const integer=(minimum,maximum)=>({type:'integer',minimum,maximum});
const choice=(type,...values)=>({type,enum:values});
const direction=()=>choice('integer',-1,1);
const action=(type,fields={})=>({type:'object',properties:{type:choice('string',type),...fields},required:['type',...Object.keys(fields)],additionalProperties:false});
const freeze=value=>{if(value&&typeof value==='object'){for(const v of Object.values(value))freeze(v);Object.freeze(value)}return value};

const baseActions=[
 action('shoot',{weapon:choice('string','bazooka','grenade','shotgun'),angle_deg:number(-88,88),direction:direction(),power:number(18,100),fuse:integer(1,5),bounce:choice('string','high','low')}),
 action('punch',{direction:direction()}),
 action('dynamite',{direction:direction()}),
 action('airstrike',{target_x:number(75,6325),direction:direction()}),
 action('jetpack',{target_x:number(15,6385)}),
 action('teleport',{x:number(15,6385),y:number(15,1785)}),
 action('rope',{angle_deg:number(-88,88),direction:direction(),swing:choice('integer',-1,0,1),reel:choice('integer',-1,0,1),release_after:number(.1,4)}),
 action('walk',{target_x:number(15,6385),seconds:number(.1,5)}),
 action('jump',{direction:direction(),kind:choice('string','forward','backflip')}),
 action('select_worm',{worm_id:integer(0,5)}),
 action('pass'),
];
// Separate strict-schema variants keep retreat optional for older clients.
const attacks=baseActions.filter(s=>['shoot','punch','dynamite','airstrike'].includes(s.properties.type.enum[0]));
const withRetreat=attacks.map(s=>({...s,properties:{...s.properties,retreat_direction:choice('integer',-1,0,1)},required:[...s.required,'retreat_direction']}));
export const ACTION_SCHEMA=freeze({anyOf:[...baseActions,...withRetreat,action('jetpack',{target_x:number(15,6385),drop_after:number(.1,3.8)}),action('simulate',{action:{anyOf:[...attacks,...withRetreat]}})]});

// Deliberately small schema interpreter: no coercion, ignored extras, nonfinite numbers or defaults.
function valid(value,schema){
 if(schema.anyOf)return schema.anyOf.some(branch=>valid(value,branch));
 if(schema.type==='object')return Boolean(value&&typeof value==='object'&&!Array.isArray(value)&&
  Object.keys(value).length===schema.required.length&&schema.required.every(k=>Object.hasOwn(value,k))&&
  Object.keys(value).every(k=>Object.hasOwn(schema.properties,k)&&valid(value[k],schema.properties[k])));
 if(schema.type==='number'||schema.type==='integer'){
  if(!Number.isFinite(value)||(schema.type==='integer'&&!Number.isInteger(value)))return false;
 }else if(typeof value!==schema.type)return false;
 return (!schema.enum||schema.enum.includes(value))&&(schema.minimum===undefined||value>=schema.minimum)&&(schema.maximum===undefined||value<=schema.maximum);
}
export const validAgentAction=value=>valid(value,ACTION_SCHEMA);
