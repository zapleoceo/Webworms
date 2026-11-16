// Real index markup and stylesheet, without game scripts/network/model calls.
// Run npm start, then open /tests/responsive.html in a browser.
const source=await (await fetch('../index.html')).text();
const cases=[[320,568],[390,844],[568,320],[844,390],[1280,760]];
let passed=0,failed=0;
function check(ok,label){const li=document.createElement('li');li.className=ok?'pass':'fail';li.textContent=`${ok?'PASS':'FAIL'} ${label}`;document.querySelector('#results').append(li);ok?passed++:failed++}
for(const [width,height] of cases){
 const doc=new DOMParser().parseFromString(source,'text/html');
 doc.querySelectorAll('script').forEach(e=>e.remove());
 const base=doc.createElement('base');base.href=new URL('../',location.href);doc.head.prepend(base);
 doc.querySelector('#intro').classList.remove('open');
 doc.querySelector('#message').textContent='DIRT DEVILS · YOUR TURN';
 // game.js normally creates these nine armory buttons. Match their rendered structure.
 doc.querySelector('#weapons').innerHTML=['BAZOOKA','GRENADE','SHOTGUN','DYNAMITE','AIRSTRIKE','PUNCH','JETPACK','NINJA ROPE','TELEPORT'].map((name,i)=>`<button class="weapon"><span class="glyph"><svg width="32" height="32"></svg></span><span class="name">${name}</span><span class="key">${i+1}</span></button>`).join('');
 const frame=document.createElement('iframe');frame.width=width;frame.height=height;frame.setAttribute('sandbox','allow-same-origin');
 const loaded=new Promise(resolve=>frame.onload=resolve);frame.srcdoc=doc.documentElement.outerHTML;document.body.append(frame);await loaded;
 const d=frame.contentDocument,w=frame.contentWindow;await d.fonts.ready;
 const rect=s=>d.querySelector(s).getBoundingClientRect();
 const prefix=`${width}x${height}`;
 check(d.documentElement.scrollWidth<=width,`${prefix}: no horizontal overflow`);
 const a=rect('#message'),b=rect('#power-wrap');
 check(!(a.right>b.left&&b.right>a.left&&a.bottom>b.top&&b.bottom>a.top),`${prefix}: message and power do not overlap`);
 if(width<=700){
  check([...d.querySelectorAll('.touch-controls button')].every(e=>{const r=e.getBoundingClientRect();return r.width>=40&&r.height>=44&&r.left>=0&&r.right<=width}),`${prefix}: all six touch controls fit`);
  const swap=d.querySelector('#touch-switch');swap.scrollIntoView({block:'end'});check(rect('#touch-switch').bottom<=height+0.5,`${prefix}: SWAP reachable by vertical scroll (bottom ${rect("#touch-switch").bottom}, height ${height})`);w.scrollTo(0,0);
 }
 if(width===1280)check(d.documentElement.scrollHeight<=height,`${prefix}: game fits desktop height`);
 const help=d.querySelector('#help-panel');help.classList.add('open');
 check(rect('#help-panel').top>=0&&rect('#help-panel').bottom<=height,`${prefix}: manual stays inside viewport`);
 help.scrollTop=help.scrollHeight;
 const last=help.querySelector('p:last-child').getBoundingClientRect(),close=rect('#close-help'),box=rect('#help-panel');
 check(last.bottom<=box.bottom&&last.top>=box.top,`${prefix}: end of manual is reachable`);
 check(close.top>=box.top&&close.bottom<=box.bottom,`${prefix}: close remains reachable after scrolling`);
 help.classList.remove('open');check(w.getComputedStyle(help).display==='none',`${prefix}: manual closes`);
 frame.remove();
}
document.querySelector('#summary').textContent=`${passed} passed; ${failed} failed`;
document.title=`${failed?'FAIL':'PASS'} — responsive layout tests`;
