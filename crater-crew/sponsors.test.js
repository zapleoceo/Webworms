// In-battle sponsor placements: deterministic picks, safe spots, camera culling and "nothing without a loaded logo".
import test from 'node:test';
import assert from 'node:assert/strict';
import {createTerrain,groundY,setWorld,spawnSpots,W,WATER} from './engine.js';
import {loadSponsorImages,sponsorImage,placeBillboards,placeBattleAds,drawBattleAds,viewRect,inView,blimpAt,BLIMP} from './sponsors.js';
import {drawProps} from './props.js';
import {PLACEMENTS} from './settings.js';

// A fake Image: "loads" on a microtask unless its URL contains "broken".
globalThis.Image=class{set src(v){this._src=v;this.naturalWidth=200;this.naturalHeight=80;queueMicrotask(()=>v.includes('broken')?this.onerror?.():this.onload?.())}get src(){return this._src}};
const settle=()=>new Promise(r=>setTimeout(r,0));
// Canvas stub that counts every call; drawImage counted separately.
function recorder(){const calls={draw:0,any:0};const c=new Proxy({},{get:(t,k)=>k==='calls'?calls:k in t?t[k]:(...a)=>{calls.any++;if(k==='drawImage')calls.draw++},set:(t,k,v)=>{t[k]=v;return true}});return c}

const sp=(id,over={})=>({id,name:id,logoUrl:`/sponsors/${id}.png`,link:'',weight:1,enabled:true,placements:[...PLACEMENTS],placementsV:2,...over});
const A=sp('aaaaaaaa0001',{weight:3}),B=sp('bbbbbbbb0002'),OFF=sp('cccccccc0003',{enabled:false}),NOBATTLE=sp('dddddddd0004',{placements:['billboard','crate','banner']});

function match(map,seed,sponsors){setWorld(map);const terrain=createTerrain(map,seed),worms=spawnSpots(terrain,seed).map(s=>({x:s.x,y:s.y}));const boards=placeBillboards(terrain,seed,sponsors,worms);return {terrain,worms,boards,ads:placeBattleAds(terrain,seed,sponsors,worms,boards.map(b=>b.x))}}
const ids=ads=>JSON.stringify({blimp:ads.blimp&&[ads.blimp.sponsor.id,ads.blimp.x0,ads.blimp.y],flags:ads.flags.map(f=>[f.x,f.sponsor.id]),jet:ads.jet?.id,chute:ads.parachute?.id,buoy:ads.buoy&&[ads.buoy.x,ads.buoy.sponsor.id]});

test('placement choice is deterministic per match seed and only among enabled sponsors that allow it',()=>{
 for(const map of [0,1,2,3])for(const seed of [7,31337,99001]){
  const a=match(map,seed,[A,B,OFF,NOBATTLE]),b=match(map,seed,[A,B,OFF,NOBATTLE]);
  assert.equal(ids(a.ads),ids(b.ads),`map ${map} seed ${seed}`);
  const used=[a.ads.blimp?.sponsor,a.ads.jet,a.ads.parachute,a.ads.buoy?.sponsor,...a.ads.flags.map(f=>f.sponsor)].filter(Boolean).map(s=>s.id);
  assert.ok(used.every(id=>id===A.id||id===B.id),'disabled and billboard-only sponsors never appear in battle');
  assert.ok(a.ads.blimp&&a.ads.jet&&a.ads.parachute,'one blimp, plane and canopy sponsor per match');
 }
 // Weighted: A (weight 3) wins the blimp more often than B over many seeds.
 let heavy=0;setWorld(0);const t=createTerrain(0,5);for(let s=1;s<=400;s++)if(placeBattleAds(t,s,[A,B]).blimp.sponsor.id===A.id)heavy++;
 assert.ok(heavy>240&&heavy<360,`weighted blimp pick: ${heavy}/400`);
 // A placement switched off leaves just that placement empty.
 const noFlag=match(0,7,[sp('eeeeeeee0005',{placements:['blimp','jet']})]).ads;
 assert.deepEqual(noFlag.flags,[]);assert.equal(noFlag.parachute,null);assert.equal(noFlag.buoy,null);assert.ok(noFlag.blimp&&noFlag.jet);
 const none=placeBattleAds(createTerrain(0,1),1,[]);assert.deepEqual([none.blimp,none.flags,none.jet,none.parachute,none.buoy],[null,[],null,null,null],'no sponsors: no placements');
});

test('flags stand on level dry ground, clear of spawns, billboards and each other; buoy floats on open water',()=>{
 for(const map of [0,1,2,3])for(const seed of [7,31337,99001,4242]){
  const {terrain,worms,boards,ads}=match(map,seed,[A,B]);
  assert.ok(ads.flags.length>=2&&ads.flags.length<=4,`map ${map} seed ${seed}: ${ads.flags.length} flags`);
  for(const f of ads.flags){
   assert.ok(f.x>0&&f.x<W);assert.ok(groundY(terrain,f.x)<=WATER-120,'dry');
   assert.ok(Math.abs(groundY(terrain,f.x-14)-groundY(terrain,f.x+14))<=10,'level');
   assert.ok(worms.every(w=>Math.abs(w.x-f.x)>=130),'away from spawns');assert.ok(boards.every(b=>Math.abs(b.x-f.x)>=130),'away from billboards');
   assert.ok(ads.flags.every(o=>o===f||Math.abs(o.x-f.x)>=240),'spread out');
  }
  assert.ok(ads.buoy,'every map has open water for the buoy');assert.ok([-30,0,30].every(d=>groundY(terrain,ads.buoy.x+d)>WATER+6),'open water');
  // The blimp flies above the usual ground line and loops across the map.
  const p0=blimpAt(ads.blimp,0),p1=blimpAt(ads.blimp,1e9);
  assert.ok(p0.y<=WATER-300&&p0.y>=140,'sky band');assert.ok(p1.x>=-BLIMP.w&&p1.x<=W+BLIMP.w,'loops');
 }
});

test('nothing is drawn until the logo has loaded; a broken logo is never drawn',async()=>{
 setWorld(0);const broken=sp('ffffffff0006',{logoUrl:'/sponsors/broken.png'}),{terrain,worms}=match(0,7,[]);
 const state={terrain,worms,wind:20,waterLevel:WATER,projectiles:[],cam:{x:0,y:0,zoom:viewRect(null).w/W},battleAds:placeBattleAds(terrain,7,[A],worms)};
 const c=recorder();drawBattleAds(c,state,1000,'back');assert.equal(c.calls.any,0,'not loaded yet: no draw calls at all');
 loadSponsorImages([A,broken]);await settle();assert.ok(sponsorImage(A));assert.equal(sponsorImage(broken),null);
 const c2=recorder();drawBattleAds(c2,state,1000,'back');assert.ok(c2.calls.draw>=2,'blimp and flags draw the logo once loaded');
 const sb={...state,battleAds:placeBattleAds(terrain,7,[broken],worms)},c3=recorder();drawBattleAds(c3,sb,1000,'back');drawBattleAds(c3,{...sb,projectiles:[{type:'airstrike',x:900,vx:160}]},1000,'air');assert.equal(c3.calls.any,0);
 // Parachute canopy: logo only with a loaded image; the plain canopy otherwise.
 const crate=[{kind:'crate',x:100,y:100,r:11,parachute:true}],c4=recorder(),c5=recorder();
 drawProps(c4,crate,0,{chuteLogo:null});drawProps(c5,crate,0,{chuteLogo:sponsorImage(A)});assert.equal(c4.calls.draw,0);assert.equal(c5.calls.draw,1);
});

test('culling: off-camera placements make no draw calls; the strike plane appears only during an airstrike',async()=>{
 loadSponsorImages([A]);await settle();
 const {terrain,worms}=match(0,7,[]),ads=placeBattleAds(terrain,7,[A],worms);
 assert.equal(inView({x:0,y:0,w:100,h:100},150,0,200,50),false);assert.equal(inView({x:0,y:0,w:100,h:100},90,90,200,200),true);
 assert.deepEqual(viewRect({x:10,y:20,zoom:.5},1600,800),{x:10,y:20,w:3200,h:1600});
 // Camera parked deep underground at the far edge: nothing in view (flags and blimp are above, buoy elsewhere).
 const far={terrain,worms,wind:0,waterLevel:WATER,projectiles:[],cam:{x:0,y:0,zoom:1},battleAds:{...ads,blimp:{...ads.blimp,y:-5000},flags:ads.flags.map(f=>({...f,x:f.x+1e5})),buoy:ads.buoy&&{...ads.buoy,x:-1e5}}};
 const c=recorder();drawBattleAds(c,far,0,'back');assert.equal(c.calls.any,0,'all culled');
 // Plane: nothing without airstrike missiles; with them it shows at the top of the view, then the run ends.
 const st={...far,battleAds:{...ads,jetRun:null},cam:{x:0,y:300,zoom:1}};const c2=recorder();drawBattleAds(c2,st,0,'air');assert.equal(c2.calls.any,0);
 st.projectiles=[{type:'airstrike',x:800,vx:160},{type:'airstrike',x:835,vx:160}];
 const c3=recorder();drawBattleAds(c3,st,1000,'air');assert.ok(st.battleAds.jetRun,'run started');assert.equal(st.battleAds.jetRun.dir,1);
 const c4=recorder();drawBattleAds(c4,st,2400,'air');assert.ok(c4.calls.draw>=2,'logo on tail and fuselage while crossing');
 st.projectiles=[];const c5=recorder();drawBattleAds(c5,st,1000+3700,'air');assert.equal(c5.calls.any,0);assert.equal(st.battleAds.jetRun,null,'run over');
});
