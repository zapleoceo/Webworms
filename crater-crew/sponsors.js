// Sponsor placements in the game: billboards standing on the terrain (pure scenery, never collision), the
// logo on health crates and the "Presented by" strip. Logos load through Image() and are drawn only once
// loaded; a logo that fails to load is skipped. No scripts or trackers: an <img> fetch with no referrer.
import {W,WATER,groundY,seeded} from './engine.js';
import {pickSponsors,validLink,validLogoUrl} from './settings.js';

const images=new Map();
export function loadSponsorImages(sponsors){
 if(typeof Image==='undefined')return;
 for(const s of sponsors){
  if(!validLogoUrl(s.logoUrl)||images.has(s.logoUrl))continue;
  const img=new Image(),entry={img,ok:false};images.set(s.logoUrl,entry);
  img.referrerPolicy='no-referrer';img.decoding='async';
  img.onload=()=>{entry.ok=true};img.onerror=()=>{entry.ok=false};img.src=s.logoUrl;
 }
}
// The loaded image for a sponsor, or null.
export function sponsorImage(s){const e=s&&images.get(s.logoUrl);return e?.ok?e.img:null}
export const safeLink=s=>s&&validLink(s.link)?s.link:'';

// Draw `img` fitted (contain) inside the box centred at (cx,cy).
export function drawFitted(c,img,cx,cy,w,h){
 const iw=img.naturalWidth||img.width||150,ih=img.naturalHeight||img.height||150,k=Math.min(w/iw,h/ih);
 c.drawImage(img,cx-iw*k/2,cy-ih*k/2,iw*k,ih*k);
}

export const BOARD={w:168,h:92,lift:74};
// 1-3 boards per match, chosen by the match seed (weighted), on dry, fairly level ground spread across the map
// and away from the worms' starting spots. Its own random stream, so gameplay randomness is unchanged.
export function placeBillboards(terrain,seed,sponsors,worms=[]){
 const rand=seeded((seed^0x51b0a2d7)>>>0),want=1+Math.floor(rand()*3),picked=pickSponsors(sponsors,'billboard',want,rand);
 if(!picked.length)return [];
 const out=[],slot=W/picked.length;
 picked.forEach((sponsor,i)=>{
  for(let tries=0;tries<40;tries++){
   const x=Math.round(slot*i+140+rand()*(slot-280)),l=groundY(terrain,x-BOARD.w*.35),r=groundY(terrain,x+BOARD.w*.35);
   if(Math.max(l,r)>WATER-140||Math.abs(l-r)>36||worms.some(w=>Math.abs(w.x-x)<110))continue;
   out.push({x,sponsor});break;
  }
 });
 return out;
}

// Scenery pass: drawn after the backdrop and before the terrain, so the post feet sink into the ground and
// worms, props and shots are always drawn on top. The base follows the ground if it is blasted away.
export function drawBillboards(c,boards,terrain,now=0){
 for(const b of boards||[]){
  const img=sponsorImage(b.sponsor);if(!img)continue;
  const {w,h,lift}=BOARD,base=Math.min(groundY(terrain,b.x-w*.3),groundY(terrain,b.x+w*.3));
  c.save();c.translate(b.x,base);c.lineJoin='round';
  // Two posts with a cross brace.
  c.fillStyle='#1c1420';for(const px of [-w*.3,w*.3])c.fillRect(px-6,-lift-4,12,lift+30);
  c.fillStyle='#6b5a7a';for(const px of [-w*.3,w*.3])c.fillRect(px-3.5,-lift,7,lift+26);
  c.strokeStyle='#1c1420';c.lineWidth=4;c.beginPath();c.moveTo(-w*.3,-lift*.25);c.lineTo(w*.3,-lift*.7);c.stroke();
  // Board: dark rim, gold frame, light panel for the logo.
  const top=-lift-h;
  c.fillStyle='#1c1420';c.fillRect(-w/2-5,top-5,w+10,h+10);
  c.fillStyle='#ffd23f';c.fillRect(-w/2,top,w,h);
  c.fillStyle='#fff6e0';c.fillRect(-w/2+7,top+7,w-14,h-14);
  drawFitted(c,img,0,top+h/2,w-24,h-24);
  // A lamp on an arm, with a soft flicker of light on the board.
  c.strokeStyle='#1c1420';c.lineWidth=3;c.beginPath();c.moveTo(0,top-5);c.lineTo(0,top-16);c.lineTo(14,top-16);c.stroke();
  c.fillStyle='#3d3160';c.fillRect(8,top-20,16,7);
  const glow=.16+.04*Math.sin(now/400+b.x);
  c.fillStyle=`rgba(255,226,140,${glow.toFixed(3)})`;c.beginPath();c.moveTo(10,top-13);c.lineTo(22,top-13);c.lineTo(w/2-6,top+h*.6);c.lineTo(-w/2+30,top+h*.6);c.closePath();c.fill();
  c.restore();
 }
}

// ---- In-battle placements: blimp, flags, strike plane, water buoy (the parachute canopy is drawn in props.js).
// Pure decoration: nothing here is collision or gameplay. Each placement picks its sponsor from its own seeded
// stream (match seed ^ salt), so gameplay randomness and the billboard picks are unchanged. Everything is drawn
// in world space before the worms (blimp/flags/buoy before the terrain, the plane with the ordnance), so worms,
// the aim line and the HUD always stay on top. Nothing is drawn until its logo has loaded or while off camera.
const SALT={blimp:0x0b1e5a11,flag:0x0f1a6c22,jet:0x0e7a1f33,parachute:0x0c4a7e44,arena:0x0a7e4a55};
// The seed is mixed first: the LCG's first draws for nearby seeds are nearly equal, which would skew the picks.
const mix=x=>{x=Math.imul(x^x>>>16,0x85ebca6b);x=Math.imul(x^x>>>13,0xc2b2ae35);return (x^x>>>16)>>>0};
const streamFor=(seed,placement)=>seeded(mix((seed^SALT[placement])>>>0));
const pickOne=(sponsors,placement,seed)=>pickSponsors(sponsors,placement,1,streamFor(seed,placement))[0]||null;
export const FLAG={pole:118,w:70,h:44,clear:130,spacing:240};
export const BLIMP={w:250,h:92,speed:22};
export const JET={speed:900,lead:1300,ms:3600};

// The camera window in world coordinates, and a box-overlap test against it (no view: everything is in view).
export function viewRect(cam,vw=1600,vh=800){const z=cam?.zoom||1;return {x:cam?.x||0,y:cam?.y||0,w:vw/z,h:vh/z}}
export const inView=(v,x0,y0,x1,y1)=>!v||x1>=v.x&&x0<=v.x+v.w&&y1>=v.y&&y0<=v.y+v.h;

export function placeBattleAds(terrain,seed,sponsors,worms=[],avoid=[]){
 const ads={blimp:null,flags:[],jet:pickOne(sponsors,'jet',seed),parachute:pickOne(sponsors,'parachute',seed),buoy:null,jetRun:null};
 const blimp=pickOne(sponsors,'blimp',seed);
 if(blimp){
  // Sky band: well above the typical ground line, so it reads as sky in the usual camera framing.
  const rand=seeded(mix((seed^0x6d2b79f5)>>>0)),tops=[...terrain.top].sort((a,b)=>a-b),med=tops[tops.length>>1]??WATER;
  ads.blimp={sponsor:blimp,y:Math.max(150,Math.round(med-450)),x0:Math.round(rand()*W),dir:rand()<.5?-1:1,ph:rand()*6.28};
 }
 // 2-4 flagpoles on level dry ground, spread across the map, clear of spawns, billboards and each other.
 const fr=streamFor(seed,'flag'),want=2+Math.floor(fr()*3),flagSponsors=pickSponsors(sponsors,'flag',want,fr);
 if(flagSponsors.length){
  // Every valid spot (10 px grid), then seeded picks among those still far enough from the flags already planted.
  let spots=[];
  for(let x=90;x<W-90;x+=10){
   if(groundY(terrain,x)>WATER-120||Math.abs(groundY(terrain,x-14)-groundY(terrain,x+14))>10)continue;
   if(worms.some(w=>Math.abs(w.x-x)<FLAG.clear)||avoid.some(a=>Math.abs(a-x)<FLAG.clear))continue;
   spots.push(x);
  }
  for(let i=0;i<want&&spots.length;i++){
   const x=spots[Math.floor(fr()*spots.length)];ads.flags.push({x,sponsor:flagSponsors[i%flagSponsors.length],ph:fr()*6.28});
   spots=spots.filter(s=>Math.abs(s-x)>=FLAG.spacing);
  }
 }
 // A buoy over open water (the sea floor is under the water line around it): mid-map channels or the open
 // sea past either shore.
 const arena=pickOne(sponsors,'arena',seed);
 if(arena){
  const spots=[];for(let x=40;x<=W-40;x+=10)if([-30,0,30].every(d=>groundY(terrain,x+d)>WATER+6))spots.push(x);
  if(spots.length){const r=seeded(mix((seed^0x1b873593)>>>0));ads.buoy={x:spots[Math.floor(r()*spots.length)],sponsor:arena,ph:r()*6.28}}
 }
 return ads;
}

const INK='#1c1420';
const oval=(c,x,y,rx,ry,col)=>{c.fillStyle=col;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill()};
function panel(c,img,cx,cy,w,h){c.fillStyle=INK;c.fillRect(cx-w/2-3,cy-h/2-3,w+6,h+6);c.fillStyle='#fff6e0';c.fillRect(cx-w/2,cy-h/2,w,h);drawFitted(c,img,cx,cy,w-8,h-8)}

// Blimp position at time `now` (ms): drifts across the whole map and loops, with a gentle bob.
export function blimpAt(b,now){
 const span=W+BLIMP.w*2,raw=b.x0+b.dir*BLIMP.speed*now/1000;
 return {x:((raw%span)+span)%span-BLIMP.w,y:b.y+Math.sin(now/1300+b.ph)*7};
}
function drawBlimp(c,b,img,now,view){
 const {x,y}=blimpAt(b,now),{w,h}=BLIMP,d=b.dir;
 if(!inView(view,x-w*.6,y-h/2-10,x+w*.6,y+h/2+30))return;
 c.save();c.translate(x,y);c.rotate(Math.sin(now/1700+b.ph)*.025);c.lineJoin='round';
 // Tail fins (at the rear, opposite the travel direction), envelope with seams, gondola, propeller blur.
 for(const [col,a,b2,c2] of [[INK,.08,.5,.06],['#e8524a',.1,.42,.08]])for(const s of [-1,1]){c.fillStyle=col;c.beginPath();c.moveTo(-d*w*.36,s*h*a);c.lineTo(-d*w*.56,s*h*b2);c.lineTo(-d*w*.46,s*h*c2);c.closePath();c.fill()}
 oval(c,0,0,w/2+4,h/2+4,INK);oval(c,0,0,w/2,h/2,'#c9d3e6');oval(c,0,-h*.12,w*.44,h*.3,'#e3e9f4');
 c.strokeStyle='#8f9bb3';c.lineWidth=2;for(const k of [-.3,0,.3]){c.beginPath();c.ellipse(k*w*.9,0,w*.06,h/2-2,0,0,Math.PI*2);c.stroke()}
 c.fillStyle=INK;c.fillRect(-w*.12-3,h/2-2,w*.24+6,22);c.fillStyle='#ffd23f';c.fillRect(-w*.12,h/2,w*.24,16);
 c.fillStyle='#3d3160';for(let i=0;i<3;i++)c.fillRect(-w*.1+i*w*.075,h/2+4,w*.05,8);
 c.globalAlpha=.5;oval(c,-d*(w*.12+10),h/2+8,3,10+3*Math.sin(now/30),INK);c.globalAlpha=1;
 // Logo panel on the envelope's flank.
 panel(c,img,0,0,w*.5,h*.56);
 c.restore();
}

// A pole with a waving cloth; the logo is drawn in vertical slices that follow the wave. The cloth trails
// downwind; the logo always reads left to right.
function drawFlag(c,f,img,terrain,now,wind,view){
 const base=groundY(terrain,f.x),{pole,w,h}=FLAG,side=wind<0?-1:1,top=base-pole;
 if(!inView(view,f.x-w-10,top-10,f.x+w+10,base+10))return;
 c.save();c.lineJoin='round';
 c.fillStyle=INK;c.fillRect(f.x-3.5,top-4,7,pole+14);c.fillStyle='#d9dde6';c.fillRect(f.x-1.5,top-2,3,pole+10);oval(c,f.x,top-5,5,5,INK);oval(c,f.x,top-5,3.4,3.4,'#ffd23f');
 // Wave offset per slice: zero at the pole, growing toward the free edge.
 const n=10,amp=3+Math.min(5,Math.abs(wind)/12),x0=side>0?f.x+2:f.x-2-w,sw=w/n;
 const yOff=i=>{const j=side>0?i:n-i;return Math.sin(now/220-j*.7+f.ph)*amp*(j/n)};
 c.fillStyle=INK;c.beginPath();c.moveTo(x0,top+yOff(0)-2);for(let i=0;i<=n;i++)c.lineTo(x0+i*sw,top+yOff(i)-2);for(let i=n;i>=0;i--)c.lineTo(x0+i*sw,top+h+yOff(i)+2);c.closePath();c.fill();
 for(let i=0;i<n;i++){c.fillStyle=i%2?'#f6ecd4':'#fff6e0';c.fillRect(x0+i*sw-.3,top+yOff(i+.5),sw+.6,h)}
 // Logo fitted in the cloth, sliced to ride the wave.
 const iw=img.naturalWidth||img.width||150,ih=img.naturalHeight||img.height||150,k=Math.min((w-12)/iw,(h-10)/ih),lw=iw*k,lh=ih*k,lx=x0+(w-lw)/2,ly=top+(h-lh)/2;
 for(let i=0;i<n;i++){const sx0=Math.max(lx,x0+i*sw),sx1=Math.min(lx+lw,x0+(i+1)*sw);if(sx1<=sx0)continue;
  c.drawImage(img,(sx0-lx)/k,0,(sx1-sx0)/k,ih,sx0,ly+yOff(i+.5),sx1-sx0+.4,lh)}
 c.restore();
}

// The plane that "delivers" an airstrike: crosses the top of the camera view while the missiles fall.
export function jetAt(run,now,view){
 const t=(now-run.t0)/1000;
 return {x:run.cx-run.dir*JET.lead+run.dir*JET.speed*t,y:(view?view.y:0)+70};
}
function drawJet(c,run,img,now,view){
 const {x,y}=jetAt(run,now,view),d=run.dir;
 if(!inView(view,x-130,y-40,x+130,y+40))return;
 c.save();c.translate(x,y+Math.sin(now/160)*2);c.lineJoin='round';
 c.save();c.scale(d,1);
 // Wing, tail fin, fuselage, cockpit, propeller blur, speed lines; the nose points along +x before the flip.
 c.fillStyle=INK;c.beginPath();c.moveTo(-6,-2);c.lineTo(-30,22);c.lineTo(-14,22);c.lineTo(16,-2);c.closePath();c.fill();
 c.fillStyle='#5f7fbf';c.beginPath();c.moveTo(-4,0);c.lineTo(-26,19);c.lineTo(-16,19);c.lineTo(12,0);c.closePath();c.fill();
 c.fillStyle=INK;c.beginPath();c.moveTo(-62,-6);c.lineTo(-70,-34);c.lineTo(-44,-34);c.lineTo(-36,-6);c.closePath();c.fill();
 c.fillStyle='#e8524a';c.beginPath();c.moveTo(-60,-6);c.lineTo(-67,-31);c.lineTo(-47,-31);c.lineTo(-40,-6);c.closePath();c.fill();
 oval(c,0,0,60,13,INK);oval(c,0,0,57,10,'#dfe6f2');oval(c,-2,4,50,4,'#b7c2d6');oval(c,24,-6,11,6,'#7ad3ff');
 c.globalAlpha=.45;oval(c,60,0,3,13,INK);c.globalAlpha=1;
 c.strokeStyle='rgba(255,255,255,.6)';c.lineWidth=2;c.beginPath();c.moveTo(-70,2);c.lineTo(-120,2);c.moveTo(-74,-4);c.lineTo(-110,-4);c.stroke();
 c.restore();
 // Logo on the tail fin and on the fuselage (never mirrored).
 panel(c,img,d*-54,-21,26,18);panel(c,img,d*-12,0,40,14);
 c.restore();
}

function drawBuoy(c,b,img,waterLevel,now,view){
 const y=waterLevel-4+Math.sin(now/600+b.ph)*3;
 if(!inView(view,b.x-40,y-70,b.x+40,y+20))return;
 c.save();c.translate(b.x,y);c.rotate(Math.sin(now/900+b.ph)*.06);c.lineJoin='round';c.globalAlpha=.92;
 oval(c,0,0,24,13,INK);oval(c,0,0,21,10,'#ff7a3a');c.fillStyle='#fff6e0';c.fillRect(-21,-3,42,5);
 c.fillStyle=INK;c.fillRect(-2.5,-34,5,26);
 panel(c,img,0,-46,44,26);
 c.globalAlpha=1;c.restore();
}

// layer 'back': blimp, flags and buoy (before the terrain); layer 'air': the strike plane (with the ordnance).
export function drawBattleAds(c,state,now,layer,vw=1600,vh=800){
 const ads=state?.battleAds;if(!ads)return;
 const view=viewRect(state.cam,vw,vh);
 if(layer==='back'){
  const bi=ads.blimp&&sponsorImage(ads.blimp.sponsor);if(bi)drawBlimp(c,ads.blimp,bi,now,view);
  for(const f of ads.flags){const img=sponsorImage(f.sponsor);if(img)drawFlag(c,f,img,state.terrain,now,state.wind||0,view)}
  const ui=ads.buoy&&sponsorImage(ads.buoy.sponsor);if(ui&&state.waterLevel!=null)drawBuoy(c,ads.buoy,ui,state.waterLevel,now,view);
  return;
 }
 if(layer!=='air')return;
 // A run starts when an airstrike's missiles appear and lasts JET.ms; it is visual state only.
 const strike=(state.projectiles||[]).filter(p=>p.type==='airstrike'&&!p.dead);
 if(strike.length&&!ads.jetRun)ads.jetRun={t0:now,dir:Math.sign(strike[0].vx)||1,cx:strike.reduce((a,p)=>a+p.x,0)/strike.length};
 if(ads.jetRun&&now-ads.jetRun.t0>JET.ms){if(!strike.length)ads.jetRun=null;return}
 const ji=ads.jetRun&&ads.jet&&sponsorImage(ads.jet);if(ji)drawJet(c,ads.jetRun,ji,now,view);
}
