import { chromium } from "/opt/node-tools/node_modules/playwright-core/index.mjs";
const exe="/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const mq=`(()=>{const q=s=>matchMedia(s).matches;return {hover:q('(hover:hover)'),anyHover:q('(any-hover:hover)'),pointerCoarse:q('(pointer:coarse)'),pointerFine:q('(pointer:fine)'),anyCoarse:q('(any-pointer:coarse)'),anyFine:q('(any-pointer:fine)'),maxTouch:navigator.maxTouchPoints}})()`;
const page=`<style>
button{width:100px;height:60px;display:block;margin:20px;color:black;outline:0;border:0;background:#ccc}
.b:hover{color:rgb(255,0,0)} .b:active{background:rgb(0,0,255)}
@media (hover:hover){.g:hover{color:rgb(0,160,0)}}
</style><button id=t class=b>t</button><button id=g class="b g">g</button><div id=o style="height:200px">other</div>`;
const fr=p=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
const st=(p,id)=>p.evaluate(id=>{const s=getComputedStyle(document.getElementById(id));return (s.color==='rgb(255, 0, 0)'?'HOVER ':'')+(s.color==='rgb(0, 160, 0)'?'HOVER(media) ':'')+(s.backgroundColor==='rgb(0, 0, 255)'?'ACTIVE':'')||'-'},id);
async function probe(label, ctxOpts){
 const b=await chromium.launch({executablePath:exe});
 const c=await b.newContext(ctxOpts); const p=await c.newPage(); await p.setContent(page);
 console.log('==',label, JSON.stringify(await p.evaluate(mq)));
 const box=async id=>p.locator('#'+id).boundingBox();
 if(ctxOpts.hasTouch){
  let bx=await box('t');
  await p.touchscreen.tap(bx.x+50,bx.y+30); await fr(p);
  console.log(' after tap #t:',await st(p,'t'));
  await p.waitForTimeout(500); await fr(p); console.log(' 500ms later #t:',await st(p,'t'));
  bx=await box('g'); await p.touchscreen.tap(bx.x+50,bx.y+30); await fr(p);
  console.log(' tap #g: t=',await st(p,'t'),' g=',await st(p,'g'));
  bx=await box('o'); await p.touchscreen.tap(bx.x+50,bx.y+30); await fr(p);
  console.log(' tap elsewhere: t=',await st(p,'t'),' g=',await st(p,'g'));
  const cdp=await c.newCDPSession(p); bx=await box('t'); const x=bx.x+50,y=bx.y+30; const out=[];
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  let t0=Date.now(); for(const ms of [0,50,100,200,400]){const w=ms-(Date.now()-t0); if(w>0)await p.waitForTimeout(w); await fr(p); out.push(ms+'ms:'+await st(p,'t'));}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); await fr(p);
  console.log(' touch hold (no release):',out.join(' | '),'| after release:',await st(p,'t'));
  // touch drag (scroll) cancels active?
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]}); await p.waitForTimeout(150);
  for(let i=1;i<=5;i++) await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+i*10}]});
  await fr(p); console.log(' during drag:',await st(p,'t')); await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 }
 const bx=await box('g'); await p.mouse.move(bx.x+10,bx.y+10); await fr(p); console.log(' mouse over #g:',await st(p,'g'));
 await p.mouse.down(); await fr(p); console.log(' mouse down:',await st(p,'g')); await p.mouse.up(); await b.close();
}
await probe('desktop mouse only',{viewport:{width:800,height:600}});
await probe('hasTouch (desktop)',{viewport:{width:800,height:600},hasTouch:true});
await probe('isMobile+hasTouch',{viewport:{width:400,height:700},isMobile:true,hasTouch:true});
