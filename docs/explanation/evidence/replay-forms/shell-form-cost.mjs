import { chromium } from "/opt/node-tools/node_modules/playwright-core/index.mjs";
const b=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
const res={};
for(const rate of [1,4]){
 for(const N of [1,20,200]){
  const p=await (await b.newContext()).newPage(); const c=await p.context().newCDPSession(p); await c.send("Emulation.setCPUThrottlingRate",{rate});
  await p.setContent(`<form id=f>${Array.from({length:N},(_,i)=>`<input name=n${i} value="srv${i}">`).join("")}</form>`);
  // user types in all fields
  await p.evaluate(()=>{document.querySelectorAll("input").forEach((e,i)=>{e.value="typed "+i}); const l=document.querySelectorAll("input"); l[l.length-1].focus(); l[l.length-1].setSelectionRange(2,4)});
  const r=await p.evaluate(()=>{
   const T=(f)=>{const a=[];for(let k=0;k<30;k++){const t=performance.now();f();a.push(performance.now()-t)}return a.sort((x,y)=>x-y)[15]};
   const els=[...document.querySelectorAll("input")];
   let snap;
   const cap=T(()=>{snap=els.map(e=>[e,e.value,e.selectionStart,e.selectionEnd]).filter(([e,v])=>v!==e.defaultValue)});
   const act=document.activeElement; const focused={el:act,s:act.selectionStart,e:act.selectionEnd};
   // simulate hydration overwriting with app value
   els.forEach((e,i)=>e.value="app"+i); 
   const rest=T(()=>{for(const [e,v] of snap){e.value=v}});
   const sel0=[act.selectionStart,act.selectionEnd];
   for(const [e,v,s,en] of snap){e.value=v} 
   const okAll=els.every((e,i)=>e.value==="typed "+i);
   // per-keystroke tracking cost: dispatch 1000 input events with listener
   let m=0;const h=(ev)=>{m++;ev.target.__v=ev.target.value};document.addEventListener("input",h,true);
   const t=performance.now();for(let k=0;k<1000;k++){els[k%els.length].dispatchEvent(new Event("input",{bubbles:true}))}const per=(performance.now()-t)/1000;
   return {captureMs:cap,restoreMs:rest,allRestored:okAll,focusKept:document.activeElement===act,selAfterValueWrite:sel0,perEventTrackingMs:per,captured:snap.length};});
  res[`${rate}x N=${N}`]=r; await p.context().close();
 }}
console.log(JSON.stringify(res,null,1));
// loss modes
const p=await (await b.newContext()).newPage();
await p.setContent(`<input id=a value=x><textarea id=t>q</textarea><select id=s><option>1<option>2</select><input type=checkbox id=c><input type=file id=fl><input id=pw type=password>`);
const lm=await p.evaluate(()=>{const a=document.getElementById("a");a.focus();a.value="hello";a.setSelectionRange(1,3);const before=[a.selectionStart,a.selectionEnd];a.value="hello"; const same=[a.selectionStart,a.selectionEnd]; a.value="HELLO"; const diff=[a.selectionStart,a.selectionEnd];
 a.setAttribute("value","z"); // does attribute write change value after dirty?
 return {before,sameValueWrite:same,differentValueWrite:diff,dirtyAfterAttr:a.value, activeAfter:document.activeElement===a}});
console.log("loss modes",JSON.stringify(lm));
await b.close();
