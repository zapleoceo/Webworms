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
